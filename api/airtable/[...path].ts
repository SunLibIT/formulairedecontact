/**
 * Proxy Airtable — fonction serverless Vercel.
 *
 * Raison d'être : le token Airtable ne doit jamais être compilé dans le bundle
 * navigateur. Toute variable préfixée `VITE_` l'est par construction, donc
 * n'importe quel visiteur du site pouvait jusqu'ici extraire un token en
 * lecture/écriture sur la base entière. Ici, le token reste côté serveur.
 *
 * Le proxy est volontairement étroit :
 *  - seules les tables de cette application sont joignables ;
 *  - seules les méthodes GET et PATCH sont acceptées (aucune suppression) ;
 *  - la requête est reconstruite champ par champ, jamais relayée telle quelle.
 *
 * Variables d'environnement (Vercel → Settings → Environment Variables) :
 *   AIRTABLE_TOKEN   Personal Access Token, scopes data.records:read + :write
 *   AIRTABLE_BASE_ID par défaut la base « Simulateur Solaire »
 */

const BASE_ID = process.env.AIRTABLE_BASE_ID ?? 'appYjCP9BUY8Zj5Ni';
const TOKEN = process.env.AIRTABLE_TOKEN;

/** Tables que ce proxy accepte de servir. Toute autre table est refusée. */
const ALLOWED_TABLES = new Set([
  'tblcgBrFfVCBrczdl', // Demandes de contact
  'tblg8uig0z4oPUC1x', // Leads Solaires
  'tblySHLLDvHjk2ktK', // RH
]);

/** Paramètres de requête relayés vers Airtable. */
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

export default async function handler(req: Request): Promise<Response> {
  if (!TOKEN) {
    return json(
      { error: { message: 'AIRTABLE_TOKEN absent de la configuration serveur.' } },
      500,
    );
  }

  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return json({ error: { message: `Méthode ${req.method} non autorisée.` } }, 405);
  }

  const url = new URL(req.url);
  // Chemin attendu : /api/airtable/<tableId>[/<recordId>]
  const segments = url.pathname.replace(/^\/api\/airtable\/?/, '').split('/').filter(Boolean);
  const [tableId, recordId] = segments;

  if (!tableId || !ALLOWED_TABLES.has(tableId)) {
    return json({ error: { message: 'Table inconnue ou non autorisée.' } }, 403);
  }
  if (recordId && !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    return json({ error: { message: "Identifiant d'enregistrement invalide." } }, 400);
  }
  if (segments.length > 2) {
    return json({ error: { message: 'Chemin non reconnu.' } }, 400);
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
      Authorization: `Bearer ${TOKEN}`,
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
