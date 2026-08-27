/**
 * Client Airtable unique de l'application.
 *
 * Deux modes de transport :
 *  - **proxy** (défaut, et seul mode acceptable en production) : les requêtes
 *    partent vers `/api/airtable/…`, une fonction serverless qui détient le
 *    token. Rien de secret n'entre dans le bundle navigateur.
 *  - **direct** : utilisé seulement si `VITE_AIRTABLE_TOKEN` est défini, pour
 *    pouvoir développer sans lancer `vercel dev`. Le token est alors visible
 *    dans le bundle — à ne jamais déployer.
 *
 * Les champs sont toujours désignés par leur identifiant (`fld…`) et les
 * réponses demandées avec `returnFieldsByFieldId`, pour que renommer un champ
 * dans Airtable n'ait aucun effet sur le code.
 */
import { authFetch } from './adminAuth';
import { BASE_ID } from './schema';

const DIRECT_TOKEN = import.meta.env.VITE_AIRTABLE_TOKEN as string | undefined;
const PROXY_PATH = '/api/airtable';

/** Limite dure de l'API Airtable pour les écritures par lot. */
const WRITE_BATCH = 10;
/** L'API tolère 5 requêtes/seconde et par base ; on reste sous le plafond. */
const WRITE_INTERVAL_MS = 250;

export interface AirtableRecord {
  id: string;
  createdTime: string;
  /** Indexé par identifiant de champ, jamais par nom. */
  fields: Record<string, unknown>;
}

interface ListResponse {
  records: AirtableRecord[];
  offset?: string;
}

export class AirtableError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type?: string,
  ) {
    super(message);
    this.name = 'AirtableError';
  }
}

/** Vrai si l'application peut joindre Airtable dans la configuration actuelle. */
export function isConfigured(): boolean {
  return Boolean(DIRECT_TOKEN) || typeof window !== 'undefined';
}

/** `true` quand le token voyage dans le navigateur — à signaler à l'utilisateur. */
export const usesDirectToken = Boolean(DIRECT_TOKEN);

/**
 * Construit l'URL de la requête.
 *
 * En mode direct, `path` est le chemin Airtable tel quel. En mode proxy, la
 * cible passe en **paramètres** (`table`, `record`) et non en segments : le
 * proxy vit sur un chemin fixe, `/api/airtable`. Une route attrape-tout
 * répondait pour un segment mais renvoyait 404 pour deux, ce qui cassait
 * silencieusement toute mise à jour d'enregistrement.
 */
function buildUrl(path: string, params?: URLSearchParams): string {
  if (DIRECT_TOKEN) {
    const qs = params?.toString();
    return `https://api.airtable.com/v0/${BASE_ID}/${path}${qs ? `?${qs}` : ''}`;
  }

  const [tableId, recordId] = path.split('/');
  const merged = new URLSearchParams(params);
  merged.set('table', tableId);
  if (recordId) merged.set('record', recordId);
  return `${PROXY_PATH}?${merged.toString()}`;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  params?: URLSearchParams,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (DIRECT_TOKEN) headers.Authorization = `Bearer ${DIRECT_TOKEN}`;
  if (init.body) headers['Content-Type'] = 'application/json';

  // En mode proxy, `authFetch` joint le jeton de session à toute requête —
  // écritures groupées comprises, puisque ce point de passage est unique. En
  // mode direct il faut l'éviter : l'en-tête `Authorization` y porte le token
  // Airtable, qu'un jeton de session écraserait.
  const send = DIRECT_TOKEN ? fetch : authFetch;
  const res = await send(buildUrl(path, params), { ...init, headers });

  if (res.status === 429) {
    // Le plafond de débit est atteint : une seule reprise, après la fenêtre.
    await sleep(1_500);
    return request<T>(path, init, params);
  }

  if (!res.ok) {
    const raw = await res.text();
    let message = raw;
    let type: string | undefined;
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message ?? parsed?.error ?? raw;
      type = parsed?.error?.type;
    } catch {
      /* réponse non JSON : on garde le texte brut */
    }
    throw new AirtableError(
      typeof message === 'string' ? message : JSON.stringify(message),
      res.status,
      type,
    );
  }

  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lit une table entière en suivant la pagination.
 *
 * `fieldIds` restreint la charge utile aux seuls champs affichés : sur 438
 * enregistrements avec un champ `Raw JSON`, la différence est loin d'être
 * négligeable.
 */
export async function listRecords(
  tableId: string,
  options: { fieldIds?: readonly string[]; sortBy?: string; desc?: boolean } = {},
): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    params.set('returnFieldsByFieldId', 'true');
    for (const id of options.fieldIds ?? []) params.append('fields[]', id);
    if (options.sortBy) {
      params.set('sort[0][field]', options.sortBy);
      params.set('sort[0][direction]', options.desc ? 'desc' : 'asc');
    }
    if (offset) params.set('offset', offset);

    const page = await request<ListResponse>(tableId, { method: 'GET' }, params);
    all.push(...page.records);
    offset = page.offset;
  } while (offset);

  return all;
}

/** Met à jour un enregistrement. Ne touche que les champs fournis. */
export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' });
  return request<AirtableRecord>(
    `${tableId}/${recordId}`,
    { method: 'PATCH', body: JSON.stringify({ fields }) },
    params,
  );
}

/**
 * Crée un enregistrement.
 *
 * `typecast` reste absent, comme partout : une option de liste inconnue doit
 * échouer bruyamment plutôt que d'être créée en silence. C'est ainsi que la
 * table héritée s'était retrouvée avec ~170 options `Statut` parasites.
 */
export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' });
  return request<AirtableRecord>(
    tableId,
    { method: 'POST', body: JSON.stringify({ fields }) },
    params,
  );
}

/**
 * Supprime un enregistrement.
 *
 * N'existe que pour la sectorisation. Ailleurs, rien ne se supprime : une
 * demande se classe « Archivé », jamais effacée.
 */
export async function deleteRecord(tableId: string, recordId: string): Promise<void> {
  await request<{ deleted: boolean; id: string }>(`${tableId}/${recordId}`, {
    method: 'DELETE',
  });
}

export interface BulkProgress {
  /** Enregistrements effectivement écrits. */
  updated: number;
  /** Vrai si l'opération a été interrompue avant la fin. */
  aborted: boolean;
  /** Identifiants dont l'écriture a échoué, par lot. */
  failed: string[];
}

/**
 * Met à jour plusieurs enregistrements par identifiant, en respectant les
 * limites de l'API.
 *
 * Airtable accepte **10 enregistrements par requête** et tolère 5 requêtes par
 * seconde et par base. Modifier 200 lignes demande donc 20 requêtes étalées
 * sur environ cinq secondes : c'est trop long pour un bouton qui gèlerait
 * l'interface, d'où la progression rapportée lot par lot et la possibilité
 * d'interrompre.
 *
 * Un lot qui échoue n'arrête pas les suivants : mieux vaut écrire 190 lignes
 * sur 200 et dire lesquelles ont manqué que tout abandonner au premier refus.
 */
export async function updateRecords(
  tableId: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>,
  options: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<BulkProgress> {
  const total = records.length;
  let updated = 0;
  const failed: string[] = [];

  for (let i = 0; i < total; i += WRITE_BATCH) {
    if (options.signal?.aborted) {
      return { updated, aborted: true, failed };
    }

    const chunk = records.slice(i, i + WRITE_BATCH);
    try {
      await request(
        tableId,
        {
          method: 'PATCH',
          body: JSON.stringify({ records: chunk, typecast: false }),
          signal: options.signal,
        },
        new URLSearchParams({ returnFieldsByFieldId: 'true' }),
      );
      updated += chunk.length;
    } catch {
      // Une interruption n'est pas un échec d'écriture : on sort proprement.
      if (options.signal?.aborted) return { updated, aborted: true, failed };
      failed.push(...chunk.map((r) => r.id));
    }

    options.onProgress?.(Math.min(i + WRITE_BATCH, total), total);
    if (i + WRITE_BATCH < total) await sleep(WRITE_INTERVAL_MS);
  }

  return { updated, aborted: false, failed };
}

/**
 * Crée ou met à jour des enregistrements en une passe, par lots de 10.
 *
 * `mergeOn` désigne le champ qui sert de clé d'unicité (le `Response ID` pour
 * les demandes de contact) : relancer l'opération ne crée pas de doublon.
 */
export async function upsertRecords(
  tableId: string,
  records: Array<{ fields: Record<string, unknown> }>,
  mergeOn: string,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (let i = 0; i < records.length; i += WRITE_BATCH) {
    const chunk = records.slice(i, i + WRITE_BATCH);
    const res = await request<{
      createdRecords?: string[];
      updatedRecords?: string[];
    }>(tableId, {
      method: 'PATCH',
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: [mergeOn] },
        records: chunk,
        typecast: false,
      }),
    });
    created += res.createdRecords?.length ?? 0;
    updated += res.updatedRecords?.length ?? 0;

    if (i + WRITE_BATCH < records.length) await sleep(WRITE_INTERVAL_MS);
  }

  return { created, updated };
}
