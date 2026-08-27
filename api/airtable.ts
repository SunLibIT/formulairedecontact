/**
 * Proxy Airtable — fonction serverless Vercel.
 *
 * Raison d'être : le token Airtable ne doit jamais être compilé dans le bundle
 * navigateur. Toute variable préfixée `VITE_` l'est par construction, donc
 * n'importe quel visiteur du site pourrait extraire un token en lecture et en
 * écriture sur la base entière. Ici, le token reste côté serveur.
 *
 * **Chemin statique, cible en paramètres.** La table et l'enregistrement
 * arrivent par `?table=` et `?record=`, pas en segments d'URL. La version
 * précédente utilisait une route attrape-tout `api/airtable/[...path].ts` :
 * elle répondait pour un segment (`/api/airtable/tblXXX`) mais renvoyait 404
 * pour deux (`/api/airtable/tblXXX/recYYY`), ce qui cassait toute mise à jour
 * d'un enregistrement. Un chemin fixe supprime la dépendance au routage
 * dynamique, et donc la panne.
 *
 * Le proxy reste volontairement étroit :
 *  - seules les tables de cette application sont joignables ;
 *  - seuls GET et PATCH existent, et c'est le routeur qui l'impose : toute
 *    autre méthode reçoit un 405 sans que la fonction soit invoquée ;
 *  - la requête est reconstruite paramètre par paramètre, jamais relayée
 *    telle quelle.
 *
 * Variables d'environnement (Vercel → Settings → Environment Variables) :
 *   AIRTABLE_TOKEN   Personal Access Token, scopes data.records:read + :write
 *   AIRTABLE_BASE_ID par défaut la base « Simulateur Solaire »
 */

import { googleAuthEnabled, requireWriter } from './_lib/auth.js';

const BASE_ID = process.env.AIRTABLE_BASE_ID ?? 'appYjCP9BUY8Zj5Ni';

/** Tables que ce proxy accepte de servir. Toute autre table est refusée. */
const ALLOWED_TABLES = new Set([
  'tblcgBrFfVCBrczdl', // Demandes de contact
  'tblg8uig0z4oPUC1x', // Leads Solaires
  'tblySHLLDvHjk2ktK', // RH
  'tblw11IuaIggSkNu5', // Sectorisation commerciale
]);

/**
 * Paramètres relayés vers Airtable. `table` et `record` en sont absents à
 * dessein : ils désignent la cible et sont consommés ici.
 */
const ALLOWED_PARAMS = new Set([
  'pageSize',
  'offset',
  'returnFieldsByFieldId',
  'fields[]',
  'sort[0][field]',
  'sort[0][direction]',
  'filterByFormula',
  'view',
]);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Les données sont nominatives : aucun cache intermédiaire.
      'Cache-Control': 'no-store',
    },
  });

async function proxy(req: Request): Promise<Response> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return json(
      { error: { message: 'AIRTABLE_TOKEN absent de la configuration serveur.' } },
      500,
    );
  }

  const url = new URL(req.url);
  const tableId = url.searchParams.get('table') ?? '';
  const recordId = url.searchParams.get('record');

  if (!ALLOWED_TABLES.has(tableId)) {
    return json({ error: { message: 'Table inconnue ou non autorisée.' } }, 403);
  }
  if (recordId && !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    return json({ error: { message: "Identifiant d'enregistrement invalide." } }, 400);
  }

  // Reconstruction de la requête : on ne relaie que les paramètres connus.
  const target = new URL(
    `https://api.airtable.com/v0/${BASE_ID}/${tableId}${recordId ? `/${recordId}` : ''}`,
  );
  for (const [key, value] of url.searchParams) {
    if (ALLOWED_PARAMS.has(key)) target.searchParams.append(key, value);
  }

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(req.method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}),
    },
  };

  if (req.method === 'PATCH') {
    const body = await req.text();
    if (body.length > 1_000_000) {
      return json({ error: { message: 'Charge utile trop volumineuse.' } }, 413);
    }
    init.body = body;
  }

  try {
    const upstream = await fetch(target, init);
    const payload = await upstream.text();
    return new Response(payload, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return json(
      {
        error: {
          message: `Airtable injoignable : ${
            err instanceof Error ? err.message : 'erreur réseau'
          }`,
        },
      },
      502,
    );
  }
}

// Exports nommés par méthode HTTP : c'est la signature attendue par le
// runtime Vercel. Un `export default (req) => Response` voit sa valeur de
// retour ignorée et la fonction ne répond jamais.

/**
 * Lecture — publique, inchangée.
 *
 * `Vary: Authorization` est posé par précaution. Les réponses partent déjà en
 * `no-store`, donc rien ne les met en cache aujourd'hui ; mais le jour où un
 * cache apparaîtrait, une réponse anonyme resservie à une requête authentifiée
 * afficherait « lecture seule » alors que la session est bonne — une panne qui
 * se corrige toute seule à l'expiration, donc très difficile à diagnostiquer.
 * Le client ajoute de son côté un `auth=1` neutre dès qu'il détient un jeton,
 * ce qui sépare aussi la clé de cache. Les deux ensemble, jamais l'un sans
 * l'autre.
 */
export async function GET(req: Request): Promise<Response> {
  const res = await proxy(req);
  const headers = new Headers(res.headers);
  headers.set('Vary', 'Authorization');
  return new Response(res.body, { status: res.status, headers });
}

/**
 * Écriture — sous condition d'identité prouvée.
 *
 * C'est le SEUL point d'écriture ouvert au navigateur : toutes les
 * modifications de l'application (statut, priorité, assignation, notes, actions
 * groupées) passent par ce PATCH. `api/typeform-webhook.ts` écrit aussi, mais il
 * s'authentifie par signature HMAC de Typeform et ne relève pas d'un
 * utilisateur : il n'est donc pas concerné.
 *
 * Le client masque ses boutons par courtoisie. C'est ici que le refus a lieu.
 */
export async function PATCH(req: Request): Promise<Response> {
  const check = await requireWriter(req);
  if (!check.ok) {
    return json(
      { error: { message: check.message, type: 'AUTH_REQUIRED' }, googleAuth: true },
      check.status,
    );
  }
  return proxy(req);
}

/** Exporté pour les tests : dit si le régime Google est armé côté serveur. */
export const writesAreProtected = googleAuthEnabled;
