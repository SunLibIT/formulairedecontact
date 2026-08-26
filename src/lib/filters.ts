/**
 * Filtrage, tri et statistiques — une seule implémentation pour les deux onglets.
 *
 * Remplace les deux blocs `useEffect` de ~60 lignes qui divergeaient
 * silencieusement (le filtre « assigné à » comparait des noms d'un côté et des
 * identifiants de l'autre, le tri portait sur un champ différent de celui
 * affiché, et les compteurs cherchaient des libellés absents de la table).
 */
import type { Lead } from './records';
import { PRIORITIES, STATUSES, type Priority, type Status } from './schema';

export type { Priority, Status };

export const ALL = 'all' as const;

export interface FilterState {
  search: string;
  status: Status | typeof ALL;
  priority: Priority | typeof ALL;
  category: string | typeof ALL;
  /** Identifiant d'enregistrement RH, ou `unassigned` pour les non assignés. */
  assignee: string | typeof ALL | 'unassigned';
  partner: string | typeof ALL;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  status: ALL,
  priority: ALL,
  category: ALL,
  assignee: ALL,
  partner: ALL,
  from: '',
  to: '',
};

export function countActiveFilters(f: FilterState): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.status !== ALL) n++;
  if (f.priority !== ALL) n++;
  if (f.category !== ALL) n++;
  if (f.assignee !== ALL) n++;
  if (f.partner !== ALL) n++;
  if (f.from || f.to) n++;
  return n;
}

/** Bornes de jour inclusives, calculées une fois et non par enregistrement. */
function dateBounds(from: string, to: string): [number, number] {
  const lo = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const hi = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  return [lo, hi];
}

/**
 * Restreint à la période. Séparé du reste car les statistiques doivent refléter
 * la période choisie mais **pas** les autres filtres : sinon filtrer sur
 * « Qualifié » afficherait « Qualifié : n » et zéro partout ailleurs.
 */
export function applyPeriod(leads: Lead[], from: string, to: string): Lead[] {
  if (!from && !to) return leads;
  const [lo, hi] = dateBounds(from, to);
  return leads.filter((l) => {
    const t = new Date(l.date).getTime();
    return Number.isFinite(t) && t >= lo && t <= hi;
  });
}

function matchesSearch(lead: Lead, query: string): boolean {
  // Un seul haystack : évite de réécrire la liste des champs cherchés à
  // chaque ajout de colonne, et couvre les deux sources d'un coup.
  const haystack = [
    lead.fullName,
    lead.email,
    lead.company,
    lead.phone,
    lead.address.city,
    lead.address.postalCode,
    lead.partner,
    lead.ref,
    ...lead.assigneeNames,
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/* --------------------------------------------------------------- tri */

export type SortField = 'date' | 'priority' | 'name' | 'assignee' | 'status';

export interface SortState {
  field: SortField;
  direction: 'asc' | 'desc';
}

/** Du plus récent au plus ancien : l'ordre d'une file de traitement. */
export const DEFAULT_SORT: SortState = { field: 'date', direction: 'desc' };

/** Urgence décroissante — l'ordre alphabétique n'aurait aucun sens ici. */
const PRIORITY_RANK: Record<Priority, number> = { Haute: 0, Moyenne: 1, Basse: 2 };

/** Ordre du pipeline, pas alphabétique : « Nouveau » précède « Qualifié ». */
const STATUS_RANK: Record<Status, number> = Object.fromEntries(
  STATUSES.map((s, i) => [s, i]),
) as Record<Status, number>;

/**
 * Trie une liste déjà filtrée.
 *
 * Séparé du filtrage parce que les deux vues partagent le même tri et doivent
 * le conserver en basculant : le tri est un état de l'écran, pas une propriété
 * du filtre. Il était auparavant codé en dur à la fin d'`applyFilters`, donc
 * impossible à piloter depuis des en-têtes de colonnes.
 */
export function sortLeads(leads: Lead[], sort: SortState): Lead[] {
  const collator = new Intl.Collator('fr', { sensitivity: 'base' });
  const sign = sort.direction === 'asc' ? 1 : -1;

  const compare = (a: Lead, b: Lead): number => {
    switch (sort.field) {
      case 'date':
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case 'status':
        return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      case 'name':
        return collator.compare(a.fullName, b.fullName);
      case 'assignee': {
        // Les non assignés se regroupent en fin de tri croissant : ce sont
        // eux qu'on cherche, pas une valeur vide à ignorer.
        const an = a.assigneeNames[0] ?? '';
        const bn = b.assigneeNames[0] ?? '';
        if (!an && !bn) return 0;
        if (!an) return 1;
        if (!bn) return -1;
        return collator.compare(an, bn);
      }
    }
  };

  // Tri stable à départage par date : deux demandes de même priorité gardent
  // un ordre prévisible d'un rendu à l'autre.
  return [...leads].sort((a, b) => {
    const primary = compare(a, b) * sign;
    if (primary !== 0) return primary;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

/**
 * Applique tous les filtres. Ne trie pas — voir `sortLeads`.
 *
 * Le tri est volontairement séparé : il vit au-dessus des vues, qui sont
 * purement présentationnelles.
 */
export function applyFilters(leads: Lead[], f: FilterState): Lead[] {
  const query = f.search.trim();
  const periodScoped = applyPeriod(leads, f.from, f.to);

  return periodScoped.filter((lead) => {
    if (query && !matchesSearch(lead, query)) return false;
    if (f.status !== ALL && lead.status !== f.status) return false;
    if (f.priority !== ALL && lead.priority !== f.priority) return false;
    if (f.category !== ALL && lead.category !== f.category) return false;
    if (f.partner !== ALL && lead.partner.trim() !== f.partner.trim()) return false;

    if (f.assignee === 'unassigned') {
      if (lead.assigneeIds.length > 0 || lead.assigneeNames.length > 0) return false;
    } else if (f.assignee !== ALL) {
      // Comparaison sur l'identifiant, en repli sur le nom pour les
      // enregistrements historiques encore renseignés en texte libre.
      const byId = lead.assigneeIds.includes(f.assignee);
      const byName = lead.assigneeNames.includes(f.assignee);
      if (!byId && !byName) return false;
    }

    return true;
  });
}

export interface Stats {
  total: number;
  byStatus: Record<Status, number>;
  byPriority: Record<Priority, number>;
  unassigned: number;
}

/** Compteurs sur l'ensemble restreint à la période. */
export function computeStats(leads: Lead[]): Stats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
  let unassigned = 0;

  for (const lead of leads) {
    if (lead.status in byStatus) byStatus[lead.status]++;
    if (lead.priority in byPriority) byPriority[lead.priority]++;
    if (!lead.assigneeIds.length && !lead.assigneeNames.length) unassigned++;
  }

  return { total: leads.length, byStatus, byPriority, unassigned };
}

/**
 * Valeurs réellement présentes, pour ne proposer que des filtres utiles.
 * Les listes codées en dur laissaient choisir des options qui ne
 * ramenaient jamais rien.
 */
export function deriveOptions(leads: Lead[]) {
  const categories = new Set<string>();
  const partners = new Set<string>();
  const assignees = new Map<string, string>();

  for (const lead of leads) {
    if (lead.category) categories.add(lead.category);
    if (lead.partner.trim()) partners.add(lead.partner.trim());
    lead.assigneeIds.forEach((id, i) => {
      assignees.set(id, lead.assigneeNames[i] ?? id);
    });
  }

  const collator = new Intl.Collator('fr');
  return {
    categories: [...categories].sort(collator.compare),
    partners: [...partners].sort(collator.compare),
    assignees: [...assignees.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => collator.compare(a.name, b.name)),
  };
}
