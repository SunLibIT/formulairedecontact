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
// Les extensions `.js` sont obligatoires : Vercel compile en ESM, et Node en
// ESM n'applique pas la résolution implicite des extensions. TypeScript sait
// que `./x.js` désigne `./x.ts`.
import { upsert } from './_lib/airtable.js';
import {
  defaultPriority,
  departmentFrom,
  FIELD_REFS,
  findAnswer,
  normaliseCountry,
  normalisePhone,
  TYPEFORM_FORMS,
  VARIABLE_KEYS,
  variableNumber,
  variableText,
  type TypeformAnswer,
  type TypeformVariable,
} from './_lib/typeform.js';
// Les identifiants de champs viennent du schéma partagé : une seule
// définition pour le front et pour le webhook.
import { CONTACT, FIELD_NAMES, TABLES } from '../src/lib/schema.js';

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
    /** Score de la logique de qualification. Doublonne la variable `score`. */
    calculated?: { score?: number };
    /** Variables du formulaire : score, tag de qualité, enrichissement société. */
    variables?: TypeformVariable[];
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
 *
 * Renvoie aussi de quoi diagnostiquer un refus sans jamais divulguer le secret
 * ni la signature : uniquement des longueurs et le préfixe d'algorithme.
 */
function checkSignature(
  rawBody: string,
  rawHeader: string | null,
  secret: string,
): { valid: boolean; diagnostic: Record<string, unknown> } {
  const header = rawHeader?.trim() ?? '';
  const expected =
    'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

  const diagnostic = {
    headerPresent: Boolean(rawHeader),
    headerLength: header.length,
    headerPrefix: header.slice(0, 7),
    expectedLength: expected.length,
    bodyLength: rawBody.length,
    // Longueur seule : 43 est la valeur attendue pour un secret généré par
    // `token_urlsafe(32)`. 44 ou plus trahit un espace ou un retour à la
    // ligne collé avec la valeur dans Vercel.
    secretLength: secret.length,
  };

  if (!header) return { valid: false, diagnostic };

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  return { valid, diagnostic };
}

/**
 * Export nommé par méthode HTTP : c'est la signature attendue par le runtime
 * Vercel. Un `export default (req) => Response` voit sa valeur de retour
 * ignorée et la fonction ne répond jamais. Le routeur refuse lui-même toute
 * méthode autre que POST.
 */
export async function POST(req: Request): Promise<Response> {
  // `.trim()` volontaire : coller une valeur dans Vercel embarque souvent un
  // retour à la ligne, ce qui invaliderait silencieusement toute signature.
  const secret = process.env.TYPEFORM_SECRET?.trim();
  if (!secret) {
    return json({ error: 'TYPEFORM_SECRET absent de la configuration serveur.' }, 500);
  }

  // Corps brut d'abord : la signature porte sur lui, pas sur l'objet analysé.
  const rawBody = await req.text();

  const { valid, diagnostic } = checkSignature(
    rawBody,
    req.headers.get('typeform-signature'),
    secret,
  );
  if (!valid) {
    // Journalisé pour pouvoir distinguer « aucune signature reçue » de
    // « signature reçue mais secret différent ». La réponse, elle, reste
    // muette : inutile d'aider un appelant illégitime.
    console.warn('[typeform-webhook] signature refusée', JSON.stringify(diagnostic));
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
    // `FR` côté Typeform, `France` dans les 438 enregistrements repris :
    // sans normalisation, tout regroupement par pays se scinderait en deux.
    [CONTACT.country]: normaliseCountry(findAnswer(answers, FIELD_REFS.country)),
    // Une case à cocher arrive comme un `choice` porteur d'un libellé, jamais
    // comme un booléen : la présence d'une réponse vaut consentement.
    [CONTACT.gdprConsent]: findAnswer(answers, FIELD_REFS.gdprConsent).length > 0,
    // Filet de sécurité : la charge utile brute permet de re-mapper un champ
    // plus tard sans redemander quoi que ce soit à Typeform.
    [CONTACT.rawJson]: rawBody.slice(0, 95_000),
  };

  const formLabel = response.form_id ? FORM_LABEL[response.form_id] : undefined;
  if (formLabel) fields[CONTACT.formId] = formLabel;

  /* --------------------------- scoring et enrichissement société
   *
   * Ces valeurs voyagent dans `calculated` et `variables`, à côté des
   * réponses, et n'étaient pas lues : elles n'existaient qu'au fond de
   * `Raw JSON`. Le score y est en double, `calculated.score` et la variable
   * `score` ; on préfère le premier et on retombe sur la seconde, le repli
   * étant gratuit.
   *
   * Chaque champ n'est ajouté que s'il a une valeur. C'est indispensable :
   * l'écriture se fait avec `typecast: false`, et une chaîne vide envoyée
   * dans un champ nombre fait échouer la requête — donc perdre la demande
   * pour un enrichissement absent, ce qui serait absurde.
   */
  const variables = response.variables ?? [];

  const score = response.calculated?.score ?? variableNumber(variables, VARIABLE_KEYS.score);
  if (score !== undefined) fields[CONTACT.score] = score;

  const employees = variableNumber(variables, VARIABLE_KEYS.companyEmployees);
  if (employees !== undefined) fields[CONTACT.companyEmployees] = employees;

  // Estimation d'un tiers, transmise en texte : convertie ici, ignorée si elle
  // n'est pas un nombre exploitable.
  const revenue = variableNumber(variables, VARIABLE_KEYS.companyRevenue);
  if (revenue !== undefined) fields[CONTACT.companyRevenue] = revenue;

  const textVariables: ReadonlyArray<readonly [string, string]> = [
    [CONTACT.leadQuality, VARIABLE_KEYS.leadQuality],
    [CONTACT.companyName, VARIABLE_KEYS.companyName],
    [CONTACT.companyDomain, VARIABLE_KEYS.companyDomain],
    [CONTACT.companyIndustry, VARIABLE_KEYS.companyIndustry],
    [CONTACT.companyLinkedIn, VARIABLE_KEYS.companyLinkedIn],
  ];
  for (const [field, key] of textVariables) {
    const value = variableText(variables, key);
    if (value) fields[field] = value;
  }

  // Garde-fou : les refs de `FIELD_REFS` désignent des questions de deux
  // formulaires précis. Branché sur un autre formulaire, le mapping ne
  // résoudrait rien et créerait des lignes vides sans erreur. On compte donc
  // ce qui a réellement été résolu et on le journalise.
  //
  // L'enregistrement est écrit malgré tout : `Raw JSON` conserve la charge
  // utile intégrale, ce qui permet de re-mapper après coup sans rien
  // redemander à Typeform. Perdre la donnée serait pire que la stocker mal.
  const resolved = [
    CONTACT.firstName, CONTACT.lastName, CONTACT.email, CONTACT.phone,
    CONTACT.company, CONTACT.requesterType, CONTACT.motive, CONTACT.message,
    CONTACT.address, CONTACT.city, CONTACT.postalCode,
  ].filter((key) => {
    const v = fields[key];
    return typeof v === 'string' && v.trim().length > 0;
  }).length;

  if (!formLabel || resolved === 0) {
    console.warn(
      '[typeform-webhook] mapping suspect',
      JSON.stringify({
        formId: response.form_id ?? null,
        formKnown: Boolean(formLabel),
        resolvedFields: resolved,
        answerCount: answers.length,
        responseId,
        // Les refs reçues permettent de compléter FIELD_REFS pour un
        // formulaire encore inconnu, sans exposer les réponses.
        receivedRefs: answers.map((a) => a.field?.ref).filter(Boolean).slice(0, 40),
      }),
    );
  }

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
