/**
 * Calculs des indicateurs. Fonctions pures, sans React ni appel réseau :
 * tout se déduit des `Lead[]` déjà chargés, donc l'onglet KPI n'ajoute
 * aucune requête.
 */
import type { Lead } from './records';
import { PRIORITIES, STATUSES, type Priority, type Status } from './schema';

const DAY_MS = 86_400_000;

export interface Slice {
  label: string;
  count: number;
}

/** Comptage par clé, trié du plus fréquent au plus rare, vides exclus. */
export function countBy(leads: Lead[], key: (l: Lead) => string): Slice[] {
  const tally = new Map<string, number>();
  for (const lead of leads) {
    const k = key(lead).trim();
    if (!k) continue;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
}

/**
 * Replie la queue de distribution dans « Autres ».
 *
 * Au-delà d'une poignée de classes un graphique devient illisible ; le guide de
 * visualisation demande de replier plutôt que de multiplier les barres.
 */
export function withTail(slices: Slice[], keep: number): Slice[] {
  if (slices.length <= keep + 1) return slices;
  const head = slices.slice(0, keep);
  const tail = slices.slice(keep).reduce((sum, s) => sum + s.count, 0);
  return tail > 0 ? [...head, { label: 'Autres', count: tail }] : head;
}

export interface MonthPoint {
  /** `YYYY-MM`, pour l'ordre chronologique. */
  key: string;
  /** « mars 26 », pour l'axe. */
  label: string;
  count: number;
}

/**
 * Volume par mois, **sans trou** : un mois sans demande vaut zéro et reste
 * affiché. Omettre les mois vides déformerait la lecture de la tendance.
 */
export function byMonth(leads: Lead[]): MonthPoint[] {
  if (!leads.length) return [];
  const tally = new Map<string, number>();
  let min = Infinity;
  let max = -Infinity;

  for (const lead of leads) {
    const d = new Date(lead.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
    const stamp = d.getFullYear() * 12 + d.getMonth();
    min = Math.min(min, stamp);
    max = Math.max(max, stamp);
  }
  if (!Number.isFinite(min)) return [];

  const points: MonthPoint[] = [];
  for (let stamp = min; stamp <= max; stamp++) {
    const year = Math.floor(stamp / 12);
    const month = stamp % 12;
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    points.push({
      key,
      label: new Date(year, month, 1).toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
      }),
      count: tally.get(key) ?? 0,
    });
  }
  return points;
}

export interface AssigneeLoad {
  name: string;
  total: number;
  byStatus: Record<Status, number>;
  /** Demandes encore au statut « Nouveau », donc non traitées. */
  untouched: number;
}

/** Charge par collaborateur, non assignés compris, du plus chargé au moins. */
export function perAssignee(leads: Lead[]): AssigneeLoad[] {
  const rows = new Map<string, AssigneeLoad>();

  const blank = (): Record<Status, number> =>
    Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;

  for (const lead of leads) {
    // Une demande partagée compte pour chacun : la charge est ce que chacun
    // a sur les bras, pas une part de gâteau.
    const names = lead.assigneeNames.length ? lead.assigneeNames : ['Non assigné'];
    for (const name of names) {
      let row = rows.get(name);
      if (!row) {
        row = { name, total: 0, byStatus: blank(), untouched: 0 };
        rows.set(name, row);
      }
      row.total++;
      if (lead.status in row.byStatus) row.byStatus[lead.status]++;
      if (lead.status === 'Nouveau') row.untouched++;
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fr'),
  );
}

export interface Summary {
  total: number;
  byStatus: Record<Status, number>;
  byPriority: Record<Priority, number>;
  unassigned: number;
  /** Encore au statut « Nouveau ». */
  untouched: number;
  qualified: number;
  rejected: number;
  /**
   * Part de qualifiées parmi les demandes **tranchées** (qualifiées + hors
   * critères). Calculer sur le total ferait baisser le taux à chaque nouvelle
   * demande non encore traitée, ce qui ne mesurerait rien.
   */
  qualificationRate: number | null;
  /** Part de demandes déjà sorties de « Nouveau ». */
  handledRate: number | null;
  /** Ancienneté médiane, en jours, des demandes non traitées. */
  medianUntouchedAge: number | null;
  /** Non traitées depuis plus de 14 jours. */
  staleCount: number;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarise(leads: Lead[], now = Date.now()): Summary {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<
    Priority,
    number
  >;
  let unassigned = 0;
  const untouchedAges: number[] = [];
  let staleCount = 0;

  for (const lead of leads) {
    if (lead.status in byStatus) byStatus[lead.status]++;
    if (lead.priority in byPriority) byPriority[lead.priority]++;
    if (!lead.assigneeIds.length && !lead.assigneeNames.length) unassigned++;

    if (lead.status === 'Nouveau') {
      const t = new Date(lead.date).getTime();
      if (Number.isFinite(t)) {
        const age = Math.max(0, Math.floor((now - t) / DAY_MS));
        untouchedAges.push(age);
        if (age > 14) staleCount++;
      }
    }
  }

  const qualified = byStatus['Qualifié'];
  const rejected = byStatus['Hors Critères'];
  const decided = qualified + rejected;
  const untouched = byStatus['Nouveau'];

  return {
    total: leads.length,
    byStatus,
    byPriority,
    unassigned,
    untouched,
    qualified,
    rejected,
    qualificationRate: decided ? qualified / decided : null,
    handledRate: leads.length ? (leads.length - untouched) / leads.length : null,
    medianUntouchedAge: median(untouchedAges),
    staleCount,
  };
}

/**
 * Variation entre deux périodes de même longueur.
 *
 * `null` quand la période précédente est vide : afficher « +100 % » à partir de
 * zéro donnerait une fausse impression de tendance.
 */
export function trend(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * Période immédiatement antérieure, de même durée, pour la comparaison.
 * Bornes en `YYYY-MM-DD`, comme les filtres.
 */
export function previousPeriod(
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;

  const span = end - start + DAY_MS;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(start - span), to: iso(start - DAY_MS) };
}
