/**
 * Calculs des indicateurs. Fonctions pures, sans React ni appel réseau :
 * tout se déduit des `Lead[]` déjà chargés, donc l'onglet KPI n'ajoute
 * aucune requête.
 */
import { dayIso, dayNumber } from './dates';
import { ageInDays } from './format';
import type { Lead } from './records';
import { PRIORITIES, STATUSES, type Priority, type Status } from './schema';

/**
 * Seuil d'alerte sur une demande non traitée, en jours.
 *
 * Exporté pour que la tuile qui l'affiche lise la même valeur que le calcul :
 * un « > 14 jours » écrit en dur dans le libellé finit par mentir le jour où
 * le seuil bouge.
 */
export const STALE_DAYS = 14;

export interface Slice {
  label: string;
  count: number;
}

/**
 * Une répartition, **et sa couverture**.
 *
 * `covered` est le nombre de demandes qui portent réellement la valeur, `total`
 * l'effectif de départ. Les deux sont indispensables ensemble : sans `covered`,
 * l'appelant divise par `total` et obtient des parts qui ne totalisent jamais
 * 100 %. C'est exactement ce qui se passait sur le graphique des motifs, où 283
 * demandes sur 440 n'ont aucun motif — un motif présent 80 fois s'affichait
 * « 18 % » au lieu de 51 % des motifs renseignés.
 */
export interface Distribution {
  slices: Slice[];
  /** Demandes portant la valeur. Dénominateur des parts. */
  covered: number;
  /** Effectif total examiné, couverture comprise. */
  total: number;
}

/** Comptage par clé, trié du plus fréquent au plus rare, vides exclus. */
export function countBy(leads: Lead[], key: (l: Lead) => string): Distribution {
  const tally = new Map<string, number>();
  let covered = 0;
  for (const lead of leads) {
    const k = (key(lead) ?? '').trim();
    if (!k) continue;
    covered++;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const slices = [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));

  return { slices, covered, total: leads.length };
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

/**
 * `countBy` puis repli de la queue, en conservant la couverture.
 *
 * Les deux vont toujours ensemble côté graphique ; les séparer obligeait
 * l'appelant à reconstruire la `Distribution` à la main, ce qui est
 * précisément l'endroit où le dénominateur s'était perdu.
 */
export function distribution(
  leads: Lead[],
  key: (l: Lead) => string,
  keep?: number,
): Distribution {
  const dist = countBy(leads, key);
  return keep == null ? dist : { ...dist, slices: withTail(dist.slices, keep) };
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
  /** Statut « Signé » : une demande qualifiée qui a abouti. */
  signed: number;
  rejected: number;
  /**
   * Part de retenues parmi les demandes **tranchées** — retenues étant
   * « Qualifié » **et** « Signé », tranchées y ajoutant « Hors Critères ».
   *
   * Calculer sur le total ferait baisser le taux à chaque nouvelle demande non
   * encore traitée, ce qui ne mesurerait rien. Et compter les signées avec les
   * qualifiées n'est pas un arrangement : une demande signée a été qualifiée,
   * elle a seulement avancé d'un cran depuis. Les exclure ferait *baisser* le
   * taux de qualification à chaque signature — l'indicateur dirait le
   * contraire de ce qui se passe.
   */
  qualificationRate: number | null;
  /** Part de demandes déjà sorties de « Nouveau ». */
  handledRate: number | null;
  /** Ancienneté médiane, en jours, des demandes non traitées. */
  medianUntouchedAge: number | null;
  /** Non traitées depuis plus de 14 jours. */
  staleCount: number;
  /**
   * Demandes dont le statut n'est dans aucune option connue.
   *
   * Elles comptent dans `total` mais dans aucune case de `byStatus`, ce qui
   * ferait diverger la somme des barres du total sans que rien ne le signale.
   * La base est propre aujourd'hui ; elle ne l'était pas — un import raté y a
   * déjà créé des options `Statut` parasites, horodatages compris. On expose
   * donc le compteur au lieu de l'absorber.
   */
  unknownStatus: number;
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
  let unknownStatus = 0;
  const untouchedAges: number[] = [];
  let staleCount = 0;

  for (const lead of leads) {
    if (lead.status in byStatus) byStatus[lead.status]++;
    else unknownStatus++;
    if (lead.priority in byPriority) byPriority[lead.priority]++;
    if (!lead.assigneeIds.length && !lead.assigneeNames.length) unassigned++;

    if (lead.status === 'Nouveau') {
      const age = ageInDays(lead.date, now);
      if (age != null) {
        untouchedAges.push(age);
        if (age > STALE_DAYS) staleCount++;
      }
    }
  }

  const qualified = byStatus['Qualifié'];
  const signed = byStatus['Signé'];
  const rejected = byStatus['Hors Critères'];
  // Une signature ne sort pas une demande du décompte des retenues : elle la
  // fait avancer. Sans ce `+ signed`, signer ferait baisser le taux.
  const kept = qualified + signed;
  const decided = kept + rejected;
  const untouched = byStatus['Nouveau'];
  // Base du taux de traitement : les demandes dont on sait lire le statut. Un
  // statut inconnu n'est pas « traité », il est illisible — le compter comme
  // traité gonflerait le taux à chaque import douteux.
  const readable = leads.length - unknownStatus;

  return {
    total: leads.length,
    byStatus,
    byPriority,
    unassigned,
    untouched,
    qualified,
    signed,
    rejected,
    qualificationRate: decided ? kept / decided : null,
    handledRate: readable > 0 ? (readable - untouched) / readable : null,
    medianUntouchedAge: median(untouchedAges),
    staleCount,
    unknownStatus,
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
 * Bornes en `YYYY-MM-DD`, comme les filtres, et **inclusives des deux côtés**
 * comme `applyPeriod`.
 *
 * Le calcul se fait en numéros de jour, pas en millisecondes. La version
 * précédente interprétait les bornes en heure locale puis les réécrivait avec
 * `toISOString()`, donc en UTC : à Paris, chaque borne reculait d'un jour, et
 * le `span` calculé en millisecondes en perdait un second. Août se comparait à
 * `30 juin → 30 juillet` au lieu de `1er → 31 juillet`, et un jour entier de
 * données tombait entre les deux fenêtres. Le passage à l'heure d'été ajoutait
 * une heure d'écart qui pouvait décaler une borne de plus.
 */
export function previousPeriod(
  from: string,
  to: string,
): { from: string; to: string } | null {
  const start = dayNumber(from);
  const end = dayNumber(to);
  if (start == null || end == null || end < start) return null;

  const span = end - start + 1;
  return { from: dayIso(start - span), to: dayIso(start - 1) };
}
