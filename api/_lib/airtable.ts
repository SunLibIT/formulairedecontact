/**
 * Écriture Airtable côté serveur.
 *
 * Distinct de `src/lib/airtable.ts`, qui vise le navigateur et lit
 * `import.meta.env`. Ici on est dans une fonction Vercel : le token vient de
 * `process.env` et ne sort jamais du serveur.
 */

const BASE_ID = process.env.AIRTABLE_BASE_ID ?? 'appYjCP9BUY8Zj5Ni';

/** Limite dure de l'API Airtable pour les écritures par lot. */
const BATCH = 10;

export interface UpsertResult {
  created: number;
  updated: number;
}

function token(): string {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new Error('AIRTABLE_TOKEN absent de la configuration serveur.');
  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Crée ou met à jour des enregistrements, en fusionnant sur `mergeOn`.
 *
 * Le webhook Typeform réémet en cas d'erreur ou de lenteur : l'upsert est ce
 * qui garantit qu'une réémission met à jour la demande au lieu de la
 * dupliquer.
 */
export async function upsert(
  tableId: string,
  records: Array<{ fields: Record<string, unknown> }>,
  mergeOn: string,
): Promise<UpsertResult> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}`;
  let created = 0;
  let updated = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: [mergeOn] },
        records: chunk,
        typecast: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Airtable ${res.status} : ${detail}`);
    }

    const body = (await res.json()) as {
      createdRecords?: string[];
      updatedRecords?: string[];
    };
    created += body.createdRecords?.length ?? 0;
    updated += body.updatedRecords?.length ?? 0;

    if (i + BATCH < records.length) await sleep(250);
  }

  return { created, updated };
}
