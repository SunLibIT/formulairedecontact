/**
 * Statuts de suivi : lecture de la table Statuts, résolution du statut d'un
 * lead, comptages.
 *
 * Depuis le 2026-10-07 les statuts ne sont plus codés en dur : ils vivent dans
 * la table Statuts et les admins les ajoutent, les renomment, les recolorent
 * et les archivent depuis l'app. Le statut d'un lead est un **lien** vers une
 * ligne de cette table, donc un renommage se propage sans réécrire un seul
 * lead.
 *
 * Conséquence pour tout le reste du code : **un statut ne se reconnaît jamais
 * à son nom**, qui peut changer. Il se reconnaît à son identifiant (filtres,
 * comptages) ou à son rôle (règles métier). Voir `StatusRole` dans `schema.ts`.
 */
import type { AirtableRecord } from './airtable';
import {
  DEFAULT_STATUSES,
  STATUS,
  STATUS_ROLES,
  type StatusDef,
  type StatusRole,
  type Tone,
} from './schema';

export type { StatusDef, StatusRole };

const TONE_SET = new Set<Tone>([
  'neutral',
  'fresh',
  'action',
  'followup',
  'qualified',
  'signed',
  'rejected',
]);
const ROLE_SET = new Set<string>(STATUS_ROLES);

const selectName = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'name' in v) return String((v as { name: unknown }).name ?? '');
  return '';
};

/** Une ligne de la table Statuts. Un ton illisible retombe sur `neutral`, jamais sur une erreur. */
export function toStatusDef(record: AirtableRecord): StatusDef {
  const f = record.fields;
  const tone = selectName(f[STATUS.tone]) as Tone;
  const role = selectName(f[STATUS.role]);
  const order = f[STATUS.order];
  return {
    id: record.id,
    name: typeof f[STATUS.name] === 'string' ? (f[STATUS.name] as string).trim() : '',
    tone: TONE_SET.has(tone) ? tone : 'neutral',
    order: typeof order === 'number' ? order : Number.MAX_SAFE_INTEGER,
    archived: f[STATUS.archived] === true,
    role: ROLE_SET.has(role) ? (role as StatusRole) : null,
  };
}

/** Index des statuts connus. Immuable : un changement produit un nouveau registre. */
export interface StatusRegistry {
  /** Tous les statuts, archivés compris, dans l'ordre du pipeline. */
  list: StatusDef[];
  byId: Map<string, StatusDef>;
  byRole: Map<StatusRole, StatusDef>;
}

export const byOrder = (a: StatusDef, b: StatusDef): number =>
  a.order - b.order || a.name.localeCompare(b.name, 'fr');

export function buildRegistry(defs: readonly StatusDef[]): StatusRegistry {
  const list = [...defs].sort(byOrder);
  const byId = new Map(list.map((s) => [s.id, s]));
  const byRole = new Map<StatusRole, StatusDef>();
  for (const s of list) if (s.role && !byRole.has(s.role)) byRole.set(s.role, s);
  return { list, byId, byRole };
}

/** Registre de repli : les sept statuts d'origine. */
export const DEFAULT_REGISTRY = buildRegistry(DEFAULT_STATUSES);

/** Libellé de l'ancien select → identifiant du statut d'origine. */
const LEGACY_ID = new Map(DEFAULT_STATUSES.map((s) => [s.name, s.id]));

/**
 * Le statut d'un lead.
 *
 * 1. Le lien, quand il existe — le cas normal.
 * 2. Sinon le libellé de l'ancien select, rattaché par son nom **d'origine**
 *    (`DEFAULT_STATUSES`), puis cherché par identifiant dans le registre
 *    vivant : un lead jamais repris garde ainsi son statut même après que
 *    « Nouveau » a été renommé.
 * 3. Un libellé hérité inconnu reste affiché tel quel, marqué `unknown`.
 * 4. Rien du tout vaut le statut de rôle « nouveau » : un statut absent n'est
 *    pas une valeur vide.
 */
export function resolveStatus(
  registry: StatusRegistry,
  linkId: string | null,
  legacyLabel: string,
): StatusDef {
  if (linkId) {
    const linked = registry.byId.get(linkId) ?? DEFAULT_REGISTRY.byId.get(linkId);
    if (linked) return linked;
  }
  const label = legacyLabel.trim();
  if (label) {
    const id = LEGACY_ID.get(label);
    const known = id ? registry.byId.get(id) ?? DEFAULT_REGISTRY.byId.get(id) : undefined;
    if (known) return known;
    return {
      id: `legacy:${label}`,
      name: label,
      tone: 'neutral',
      order: Number.MAX_SAFE_INTEGER,
      archived: true,
      role: null,
      unknown: true,
    };
  }
  return statusForRole(registry, 'nouveau');
}

/** Le statut qui porte un rôle. Jamais `undefined` : retombe sur le statut d'origine. */
export function statusForRole(registry: StatusRegistry, role: StatusRole): StatusDef {
  return registry.byRole.get(role) ?? DEFAULT_REGISTRY.byRole.get(role)!;
}

/**
 * Statuts proposés à la saisie : ni archivés, ni « Archivé » — on archive une
 * demande par le bouton prévu, qui passe par le rôle `archive`.
 *
 * `current` est ajouté s'il en est exclu, pour qu'un menu ouvert sur un lead
 * au statut archivé affiche ce statut au lieu d'une valeur vide.
 */
export function selectableStatuses(registry: StatusRegistry, current?: StatusDef): StatusDef[] {
  const list = registry.list.filter((s) => !s.archived && s.role !== 'archive');
  if (current && !list.some((s) => s.id === current.id)) return [...list, current].sort(byOrder);
  return list;
}

/** Vrai pour une demande archivée — sortie du flux de travail. */
export const isArchivedStatus = (s: StatusDef): boolean => s.role === 'archive';

/** Statuts qui ne sont pas encore dans un lien Airtable : rien à écrire pour eux. */
export const isLegacyId = (id: string): boolean => id.startsWith('legacy:');

/* ------------------------------------------------------------- comptages */

export interface StatusCount {
  status: StatusDef;
  count: number;
}

/** Comptage par identifiant de statut. */
export type StatusCounts = Map<string, StatusCount>;

export function tallyStatus(counts: StatusCounts, status: StatusDef): void {
  const row = counts.get(status.id);
  if (row) row.count++;
  else counts.set(status.id, { status, count: 1 });
}

/** Les comptages dans l'ordre du pipeline. */
export function orderedCounts(counts: StatusCounts): StatusCount[] {
  return [...counts.values()].sort((a, b) => byOrder(a.status, b.status));
}

export const countOf = (counts: StatusCounts, id: string): number => counts.get(id)?.count ?? 0;

/** Nombre de demandes dont le statut porte ce rôle. */
export function countOfRole(counts: StatusCounts, role: StatusRole): number {
  let n = 0;
  for (const { status, count } of counts.values()) if (status.role === role) n += count;
  return n;
}

/**
 * Le statut d'origine qui porte ce libellé, ou un statut hérité inconnu.
 * Pour les tests et les fixtures : le code applicatif passe par le registre.
 */
export const legacyStatus = (label: string): StatusDef =>
  resolveStatus(DEFAULT_REGISTRY, null, label);
