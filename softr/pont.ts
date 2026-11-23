/**
 * Transport Airtable du bloc Softr — remplace `src/lib/airtable.ts` au build.
 *
 * Sur Vercel, l'app parle à l'API Airtable (via le proxy `/api/airtable`).
 * Dans le CRM 3, elle vit dans un bloc vibe coding : Airtable n'est joignable
 * que par les hooks Softr (`useRecords`, `useRecordUpdate`…), branchés sur les
 * cinq tables par `softr/Block.tsx`. Ce module garde **exactement** l'interface
 * de `lib/airtable.ts` (mêmes exports, mêmes formes de données) : le reste du
 * code ne voit pas la différence.
 *
 * - **Lecture.** `Block.tsx` lit chaque table entière (pages de 100, enchaînées)
 *   et dépose ici les enregistrements, convertis au format de l'API Airtable
 *   (`fields` indexés par identifiant de champ, liens = tableau d'ids, liste
 *   simple = libellé, case décochée / valeur vide = champ absent).
 *   `listRecords` rend la dernière lecture complète, ou en demande une neuve.
 * - **Écriture.** Les mutations Softr sont enregistrées par `Block.tsx` ;
 *   `updateRecord`, `createRecord`, `deleteRecord` et `updateRecords` les
 *   appellent avec les valeurs déjà au format Airtable.
 * - **Droits.** Vérifiés ici avant toute écriture (`droits.ts`), comme le
 *   faisait `requireWriter` / `requireAdmin` côté serveur. Softr filtre en plus
 *   les actions par groupe d'utilisateurs.
 */
import { BASE_ID, PRIORITIES, REGIONS, STATUS, STATUS_ROLES, TABLES, CONTACT, LEAD, TERRITORY } from '../src/lib/schema';
import { droitsEcriture } from './droits';

void BASE_ID;

export interface AirtableRecord {
  id: string;
  createdTime: string;
  /** Indexé par identifiant de champ, jamais par nom. */
  fields: Record<string, unknown>;
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

/** Le bloc Softr est toujours branché. */
export function isConfigured(): boolean {
  return true;
}

/** Aucun jeton dans le navigateur : Softr tient l'accès Airtable. */
export const usesDirectToken = false;

/* ------------------------------------------------------------ conversion */

/**
 * Valeur Softr → valeur de l'API Airtable.
 *
 * Relevé sur la production (sonde du 23/11/2026) : liste simple `{ id, label }`,
 * lien `[{ id, label }]` (tableau vide sans lien), lookup `[valeur]`, case
 * `true` / `false`, dates ISO identiques à l'API. Airtable, lui, n'envoie pas
 * un champ vide ni une case décochée : on les retire pour que `records.ts`
 * lise exactement ce qu'il lisait.
 */
function versAirtable(v: unknown): unknown {
  if (v === null || v === undefined || v === '' || v === false) return undefined;
  if (Array.isArray(v)) {
    const out = v
      .map((x) => {
        if (x && typeof x === 'object') {
          const o = x as { id?: unknown; label?: unknown; name?: unknown };
          const id = typeof o.id === 'string' ? o.id : '';
          // Lien : identifiant d'enregistrement. Liste multiple : libellé.
          if (id.startsWith('rec')) return id;
          return String(o.label ?? o.name ?? id);
        }
        return x;
      })
      .filter((x) => x !== null && x !== undefined && x !== '');
    return out.length ? out : undefined;
  }
  if (typeof v === 'object') {
    const o = v as { id?: unknown; label?: unknown; name?: unknown };
    if ('label' in o || 'name' in o) return String(o.label ?? o.name ?? '') || undefined;
    return v;
  }
  return v;
}

/** Enregistrement Softr `{ id, fields }` → enregistrement de l'API Airtable. */
export function enregistrementAirtable(item: { id: string; createdTime?: string; fields?: Record<string, unknown> }): AirtableRecord {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item.fields ?? {})) {
    const conv = versAirtable(v);
    if (conv !== undefined) fields[k] = conv;
  }
  return { id: item.id, createdTime: item.createdTime ?? '', fields };
}

/* ------------------------------------------------------------- les tables */

export type CleTable = 'demandes' | 'leads' | 'rh' | 'secteurs' | 'statuts';

const CLE_DE_TABLE: Record<string, CleTable> = {
  [TABLES.contactRequests]: 'demandes',
  [TABLES.solarLeads]: 'leads',
  [TABLES.staff]: 'rh',
  [TABLES.territories]: 'secteurs',
  [TABLES.statuses]: 'statuts',
};

function cle(tableId: string): CleTable {
  const k = CLE_DE_TABLE[tableId];
  if (!k) throw new AirtableError('Table inconnue ou non autorisée.', 403);
  return k;
}

/**
 * Options des listes simples écrites par l'app. Softr accepterait un libellé
 * inconnu en créant l'option (« allowToAddNewChoice ») ; l'app écrivait avec
 * `typecast: false` pour qu'un tel libellé échoue bruyamment. On garde ce
 * refus ici, avant l'appel.
 */
const OPTIONS: Record<string, readonly string[]> = {
  [CONTACT.priority]: PRIORITIES,
  [LEAD.priority]: PRIORITIES,
  [TERRITORY.region]: REGIONS,
  [STATUS.role]: STATUS_ROLES,
};

function verifierOptions(fields: Record<string, unknown>) {
  for (const [k, v] of Object.entries(fields)) {
    const permises = OPTIONS[k];
    if (!permises || v === null || v === undefined || v === '') continue;
    if (typeof v !== 'string' || !permises.includes(v)) {
      throw new AirtableError(
        `Insufficient permissions to create new select option ""${String(v)}""`,
        422,
        'INVALID_MULTIPLE_CHOICE_OPTIONS',
      );
    }
  }
}

/* ------------------------------------------------------- état des lectures */

interface Attente {
  resolve: (r: AirtableRecord[]) => void;
  reject: (e: Error) => void;
}

interface Etat {
  records: AirtableRecord[];
  complet: boolean;
  lueA: number;
  erreur: string;
  relire?: () => void;
  attentes: Attente[];
}

const etats: Record<CleTable, Etat> = {
  demandes: { records: [], complet: false, lueA: 0, erreur: '', attentes: [] },
  leads: { records: [], complet: false, lueA: 0, erreur: '', attentes: [] },
  rh: { records: [], complet: false, lueA: 0, erreur: '', attentes: [] },
  secteurs: { records: [], complet: false, lueA: 0, erreur: '', attentes: [] },
  statuts: { records: [], complet: false, lueA: 0, erreur: '', attentes: [] },
};

/**
 * Une lecture terminée depuis moins longtemps que ça est rendue telle quelle.
 * `useLeads` relit au montage puis encore quand la table RH arrive : sans ce
 * délai, chaque ouverture lirait deux fois toutes les pages. « Actualiser »,
 * cliqué plus tard, relit pour de bon.
 */
const FRAICHEUR_MS = 20_000;

/** Appelé par `Block.tsx` à chaque état de la lecture d'une table. */
export function deposerLecture(
  table: CleTable,
  lecture: { complet: boolean; erreur: string; items: Array<{ id: string; createdTime?: string; fields?: Record<string, unknown> }>; relire: () => void },
) {
  const e = etats[table];
  e.relire = lecture.relire;
  if (lecture.erreur) {
    e.erreur = lecture.erreur;
    const attentes = e.attentes.splice(0);
    attentes.forEach((a) => a.reject(new AirtableError(lecture.erreur, 500)));
    return;
  }
  if (!lecture.complet) return;
  e.records = lecture.items.map(enregistrementAirtable);
  e.complet = true;
  e.erreur = '';
  e.lueA = Date.now();
  const attentes = e.attentes.splice(0);
  attentes.forEach((a) => a.resolve(e.records));
}

/** Lit une table entière, au format de l'API Airtable. */
export async function listRecords(
  tableId: string,
  _options: { fieldIds?: readonly string[]; sortBy?: string; desc?: boolean } = {},
): Promise<AirtableRecord[]> {
  void _options; // champs et tri sont fixés par les lectures de `Block.tsx`
  const e = etats[cle(tableId)];
  if (e.complet && Date.now() - e.lueA < FRAICHEUR_MS) return e.records;
  return new Promise<AirtableRecord[]>((resolve, reject) => {
    e.attentes.push({ resolve, reject });
    if (e.complet || e.erreur) {
      e.complet = false;
      e.erreur = '';
      e.relire?.();
    }
  });
}

/* ------------------------------------------------------------ écritures */

export interface Mutations {
  update?: (recordId: string, fields: Record<string, unknown>) => Promise<unknown>;
  create?: (fields: Record<string, unknown>) => Promise<unknown>;
  remove?: (recordId: string) => Promise<unknown>;
}

const mutations: Partial<Record<CleTable, Mutations>> = {};

/** Appelé par `Block.tsx` à chaque rendu : les fonctions Softr y sont tenues à jour. */
export function enregistrerMutations(table: CleTable, m: Mutations) {
  mutations[table] = m;
}

function exiger<K extends keyof Mutations>(table: CleTable, quoi: K): NonNullable<Mutations[K]> {
  const d = droitsEcriture();
  if (table === 'statuts') {
    if (!d.isAdmin) {
      throw new AirtableError(
        'Gestion des statuts réservée aux services Direction et Administratif.',
        403,
        'AUTH_REQUIRED',
      );
    }
  } else if (!d.canWrite) {
    throw new AirtableError(
      'Modification réservée aux membres actifs de l’Équipe SunLib.',
      403,
      'AUTH_REQUIRED',
    );
  }
  const fn = mutations[table]?.[quoi];
  if (!fn) {
    throw new AirtableError('Écriture non autorisée sur cette page (action Softr désactivée).', 403, 'AUTH_REQUIRED');
  }
  return fn as NonNullable<Mutations[K]>;
}

function messageErreur(err: unknown): AirtableError {
  if (err instanceof AirtableError) return err;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Écriture refusée.';
  return new AirtableError(msg || 'Écriture refusée.', 422);
}

/** Les valeurs écrites, telles que l'API Airtable les relirait. */
function relues(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const conv = versAirtable(v);
    if (conv !== undefined) out[k] = conv;
  }
  return out;
}

/**
 * Enregistrement complet après écriture, comme l'API le renvoie : la ligne
 * connue, corrigée des champs écrits. `StatusManagerModal` relit le nom dans
 * cette réponse ; Softr ne renvoie pas forcément toute la ligne.
 */
function apresEcriture(table: CleTable, id: string, fields: Record<string, unknown>, retour: unknown): AirtableRecord {
  const e = etats[table];
  const avant = e.records.find((r) => r.id === id);
  const base: Record<string, unknown> = { ...(avant?.fields ?? {}) };
  for (const k of Object.keys(fields)) delete base[k];
  const merged: AirtableRecord = {
    id,
    createdTime: avant?.createdTime ?? '',
    fields: { ...base, ...relues(fields) },
  };
  // Si Softr renvoie la ligne, ses champs connus font foi.
  const r = retour as { fields?: Record<string, unknown> } | null | undefined;
  if (r && r.fields && typeof r.fields === 'object') {
    for (const [k, v] of Object.entries(r.fields)) {
      if (!(k in fields)) continue;
      const conv = versAirtable(v);
      if (conv === undefined) delete merged.fields[k];
      else merged.fields[k] = conv;
    }
  }
  if (avant) e.records = e.records.map((x) => (x.id === id ? merged : x));
  return merged;
}

/** Met à jour un enregistrement. Ne touche que les champs fournis. */
export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const table = cle(tableId);
  const fn = exiger(table, 'update');
  verifierOptions(fields);
  try {
    const retour = await fn(recordId, fields);
    return apresEcriture(table, recordId, fields, retour);
  } catch (err) {
    throw messageErreur(err);
  }
}

/** Crée un enregistrement. Une option de liste inconnue échoue (cf. `OPTIONS`). */
export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const table = cle(tableId);
  const fn = exiger(table, 'create');
  verifierOptions(fields);
  let retour: unknown;
  try {
    retour = await fn(fields);
  } catch (err) {
    throw messageErreur(err);
  }
  const r = retour as { id?: unknown; fields?: Record<string, unknown> } | null | undefined;
  const id = typeof r?.id === 'string' ? r.id : '';
  if (!id) throw new AirtableError('Création faite, mais Softr n’a pas rendu l’enregistrement : actualisez.', 500);
  const record: AirtableRecord = { id, createdTime: '', fields: relues(fields) };
  if (r?.fields) {
    for (const [k, v] of Object.entries(r.fields)) {
      if (!(k in fields)) continue;
      const conv = versAirtable(v);
      if (conv !== undefined) record.fields[k] = conv;
    }
  }
  etats[table].records = [...etats[table].records, record];
  return record;
}

/** Supprime un enregistrement (sectorisation et statuts seulement). */
export async function deleteRecord(tableId: string, recordId: string): Promise<void> {
  const table = cle(tableId);
  const fn = exiger(table, 'remove');
  try {
    await fn(recordId);
  } catch (err) {
    throw messageErreur(err);
  }
  etats[table].records = etats[table].records.filter((r) => r.id !== recordId);
}

export interface BulkProgress {
  /** Enregistrements effectivement écrits. */
  updated: number;
  /** Vrai si l'opération a été interrompue avant la fin. */
  aborted: boolean;
  /** Identifiants dont l'écriture a échoué. */
  failed: string[];
}

/** Même découpage que la version API : la progression avance par dix lignes. */
const LOT = 10;

/**
 * Met à jour plusieurs enregistrements, avec progression et interruption.
 *
 * Softr écrit une ligne par appel : les lignes d'un lot de dix partent
 * ensemble, les lots l'un après l'autre. Une ligne qui échoue n'arrête pas
 * les autres.
 */
export async function updateRecords(
  tableId: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>,
  options: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<BulkProgress> {
  const table = cle(tableId);
  const fn = exiger(table, 'update');
  for (const r of records) verifierOptions(r.fields);
  const total = records.length;
  let updated = 0;
  const failed: string[] = [];

  for (let i = 0; i < total; i += LOT) {
    if (options.signal?.aborted) return { updated, aborted: true, failed };
    const lot = records.slice(i, i + LOT);
    const resultats = await Promise.allSettled(lot.map((r) => fn(r.id, r.fields)));
    resultats.forEach((res, j) => {
      const r = lot[j];
      if (res.status === 'fulfilled') {
        updated += 1;
        apresEcriture(table, r.id, r.fields, res.value);
      } else {
        failed.push(r.id);
      }
    });
    options.onProgress?.(Math.min(i + LOT, total), total);
  }
  return { updated, aborted: false, failed };
}

/** N'existe que pour les scripts de reprise, hors du bloc. */
export async function upsertRecords(): Promise<{ created: number; updated: number }> {
  throw new AirtableError('Indisponible dans le CRM.', 405);
}
