/**
 * Webhook Typeform → Airtable.
 *
 * Remplace l'ancienne synchronisation par tirage (un bouton « Sync » qui
 * rappatriait et comparait les 438 réponses à chaque clic) par une réception
 * en temps réel : Typeform pousse chaque soumission, on écrit une ligne.
 *
 * À configurer côté Typeform, pour chacun des deux formulaires :
 *   Connect → Webhooks → Add a webhook
 *   Endpoint : https://<domaine>/api/typeform-webhook
 *   Secret   : la même valeur que la variable TYPEFORM_SECRET sur Vercel
 *
 * Variables d'environnement :
 *   AIRTABLE_TOKEN    PAT, scopes data.records:read + data.records:write
 *   AIRTABLE_BASE_ID  optionnel, défaut appYjCP9BUY8Zj5Ni
 *   TYPEFORM_SECRET   secret de signature du webhook
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { upsert } from './_lib/airtable';
import {
  defaultPriority,
  departmentFrom,
  FIELD_REFS,
  findAnswer,
  normalisePhone,
  TYPEFORM_FORMS,
  type TypeformAnswer,
} from './_lib/typeform';
// Les identifiants de champs viennent du schéma partagé : une seule
// définition pour le front et pour le webhook.
import { CONTACT, FIELD_NAMES, TABLES } from '../src/lib/schema';

interface WebhookPayload {
  event_id?: string;
  event_type?: string;
  form_response?: {
    form_id?: string;
    /** Identifiant de la réponse. Nommé `token` dans les webhooks. */
    token?: string;
    response_id?: string;
    submitted_at?: string;
    answers?: TypeformAnswer[];
    hidden?: Record<string, string>;
  };
}

/** Libellé de l'option « Form ID » dans Airtable, pour les deux formulaires. */
const FORM_LABEL: Record<string, string> = {
  [TYPEFORM_FORMS.V0]: 'MtEfRiYk (V0)',
  [TYPEFORM_FORMS.MAR26]: 'gbPj3B1m (MAR26)',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Vérifie la signature du webhook.
 *
 * Typeform envoie `sha256=<base64(hmac_sha256(corps_brut, secret))>`. Le corps
 * doit être celui reçu **octet pour octet** : re-sérialiser le JSON changerait
 * l'empreinte. La comparaison est à temps constant.
 */
function signatureValid(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected =
    'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: `Méthode ${req.method} non autorisée.` }, 405);
  }

  const secret = process.env.TYPEFORM_SECRET;
  if (!secret) {
    return json({ error: 'TYPEFORM_SECRET absent de la configuration serveur.' }, 500);
  }

  // Corps brut d'abord : la signature porte sur lui, pas sur l'objet analysé.
  const rawBody = await req.text();

  if (!signatureValid(rawBody, req.headers.get('typeform-signature'), secret)) {
    // Pas de détail dans la réponse : inutile d'aider un appelant illégitime.
    return json({ error: 'Signature invalide.' }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return json({ error: 'Corps JSON illisible.' }, 400);
  }

  const response = payload.form_response;
  const responseId = response?.token ?? response?.response_id;
  if (!response || !responseId) {
    return json({ error: 'Charge utile sans form_response exploitable.' }, 400);
  }

  const answers = response.answers ?? [];
  const requesterType = findAnswer(answers, FIELD_REFS.requesterType);
  const postalCode = findAnswer(answers, FIELD_REFS.postalCode);

  const fields: Record<string, unknown> = {
    [CONTACT.responseId]: responseId,
    [CONTACT.submittedAt]: response.submitted_at ?? new Date().toISOString(),
    [CONTACT.firstName]: findAnswer(answers, FIELD_REFS.firstName),
    [CONTACT.lastName]: findAnswer(answers, FIELD_REFS.lastName),
    [CONTACT.email]: findAnswer(answers, FIELD_REFS.email),
    [CONTACT.phone]: normalisePhone(findAnswer(answers, FIELD_REFS.phone)),
    [CONTACT.company]: findAnswer(answers, FIELD_REFS.company),
    [CONTACT.requesterType]: requesterType,
    [CONTACT.motive]: findAnswer(answers, FIELD_REFS.motive),
    [CONTACT.message]: findAnswer(answers, FIELD_REFS.message),
    [CONTACT.address]: findAnswer(answers, FIELD_REFS.address),
    [CONTACT.addressLine2]: findAnswer(answers, FIELD_REFS.addressLine2),
    [CONTACT.city]: findAnswer(answers, FIELD_REFS.city),
    [CONTACT.postalCode]: postalCode,
    [CONTACT.department]: departmentFrom(postalCode),
    [CONTACT.region]: findAnswer(answers, FIELD_REFS.region),
    [CONTACT.country]: findAnswer(answers, FIELD_REFS.country),
    // Filet de sécurité : la charge utile brute permet de re-mapper un champ
    // plus tard sans redemander quoi que ce soit à Typeform.
    [CONTACT.rawJson]: rawBody.slice(0, 95_000),
  };

  const formLabel = response.form_id ? FORM_LABEL[response.form_id] : undefined;
  if (formLabel) fields[CONTACT.formId] = formLabel;

  // Une liste déroulante refuse une chaîne vide : on n'envoie que ce qui est
  // renseigné. Un champ absent reste vide dans Airtable.
  for (const key of [CONTACT.requesterType, CONTACT.motive] as const) {
    if (!fields[key]) delete fields[key];
  }

  // Statut et priorité ne sont posés qu'à la création. `performUpsert` écrase
  // les champs fournis, donc les inclure ici réinitialiserait le suivi
  // commercial à chaque réémission du webhook.
  const isNew = !(await exists(responseId));
  if (isNew) {
    fields[CONTACT.status] = 'Nouveau';
    fields[CONTACT.priority] = defaultPriority(requesterType);
  }

  try {
    const result = await upsert(TABLES.contactRequests, [{ fields }], CONTACT.responseId);
    return json({ ok: true, responseId, ...result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    // On renvoie 500 pour que Typeform réémette : l'upsert rend la reprise
    // sûre, une réémission ne créera pas de doublon.
    console.error('[typeform-webhook]', responseId, message);
    return json({ error: message, responseId }, 500);
  }
}

/** Vrai si la demande est déjà en base, pour ne pas réinitialiser son suivi. */
async function exists(responseId: string): Promise<boolean> {
  const baseId = process.env.AIRTABLE_BASE_ID ?? 'appYjCP9BUY8Zj5Ni';
  // Une formule Airtable référence les champs par NOM, jamais par identifiant.
  // C'est la seule exception de tout le code ; d'où la constante dédiée.
  const params = new URLSearchParams({
    pageSize: '1',
    returnFieldsByFieldId: 'true',
    filterByFormula: `{${FIELD_NAMES.contactResponseId}} = '${responseId.replace(/'/g, "\\'")}'`,
  });
  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${TABLES.contactRequests}?${params}`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN ?? ''}` } },
  );
  if (!res.ok) return false; // en cas de doute, on traite comme une création
  const body = (await res.json()) as { records?: unknown[] };
  return (body.records?.length ?? 0) > 0;
}
