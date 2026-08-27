/**
 * Extraction du tableau de bord KPI.
 *
 * Reprend **les fonctions d'agrégation de `lib/kpi.ts`**, celles-là mêmes que
 * l'onglet affiche. C'est la condition pour que le fichier et l'écran ne
 * puissent pas raconter deux choses différentes : il n'y a pas ici un second
 * calcul de taux de qualification, seulement une mise en forme du premier.
 *
 * Format : un **tableau long** de quatre colonnes — bloc, indicateur, valeur,
 * part — et non un tableau large avec une colonne par indicateur. Un tableau
 * long se recompose en tableau croisé dynamique, se filtre par bloc, et
 * surtout accepte qu'on ajoute un indicateur sans réécrire l'en-tête. Un
 * tableau large impose une colonne par mois et par collaborateur, donc un
 * fichier dont la forme change à chaque période extraite.
 *
 * Les nombres sortent au format français, virgule décimale comprise : sans
 * cela Excel en locale française les lit comme du texte, et une colonne de
 * texte ne se somme pas.
 */
import { frNumber, frPercent, stamp, type Table } from './csv';
import { formatAge } from './format';
import {
  byMonth,
  distribution,
  perAssignee,
  STALE_DAYS,
  summarise,
  trend,
  type Distribution,
} from './kpi';
import type { Lead } from './records';
import { PRIORITIES, STATUSES } from './schema';

/** Ce que le panneau KPI a sous les yeux, pour que le fichier le rappelle. */
export interface KpiScope {
  /** Libellé de la source : « Demandes », « Simulateur », « Les deux ». */
  source: string;
  /** Nom du collaborateur filtré, ou vide pour l'ensemble. */
  assignee?: string;
  from?: string;
  to?: string;
  /**
   * Effectif de la période antérieure de même durée, quand elle existe.
   * Sert à reporter la variation affichée à l'écran.
   */
  previousTotal?: number | null;
}

const HEADERS = ['Bloc', 'Indicateur', 'Valeur', 'Part (%)'] as const;

type Row = [bloc: string, indicateur: string, valeur: string, part: string];

/** Une ligne de comptage avec sa part d'un dénominateur explicite. */
function countRow(bloc: string, label: string, count: number, base: number): Row {
  return [bloc, label, frNumber(count), base > 0 ? frPercent(count / base) : ''];
}

/**
 * Les tranches d'une répartition, rapportées à **sa couverture** et non à
 * l'effectif total.
 *
 * C'est la même règle qu'à l'écran : sur les motifs, 283 demandes sur 440 n'en
 * portent aucun, donc diviser par 440 donnerait des parts qui ne totalisent
 * jamais 100 %. La couverture est écrite en clair dans le fichier pour que le
 * dénominateur soit vérifiable.
 */
function distributionRows(bloc: string, dist: Distribution): Row[] {
  const rows: Row[] = [
    [bloc, 'Renseigné', frNumber(dist.covered), frPercent(dist.covered / (dist.total || 1))],
  ];
  const missing = dist.total - dist.covered;
  if (missing > 0) {
    rows.push([bloc, 'Non renseigné', frNumber(missing), frPercent(missing / (dist.total || 1))]);
  }
  for (const slice of dist.slices) {
    rows.push(countRow(bloc, slice.label, slice.count, dist.covered));
  }
  return rows;
}

/**
 * Construit le tableau du fichier KPI.
 *
 * `leads` est la sélection déjà filtrée par le panneau — source, collaborateur
 * et période comprises. Aucun filtre n'est appliqué ici : ce que l'écran
 * montre est ce que le fichier contient.
 */
export function buildKpiExport(
  leads: Lead[],
  scope: KpiScope,
  now: number = Date.now(),
): Table {
  const summary = summarise(leads, now);
  const rows: Row[] = [];

  /* ------------------------------------------------------------- contexte */
  // En tête de fichier parce qu'un export de KPI sans son périmètre n'est pas
  // interprétable : 214 demandes « au total » ou « en juillet, pour Marie »
  // ne se comparent pas.
  rows.push(['Contexte', 'Extraction du', stamp(now), '']);
  rows.push(['Contexte', 'Source', scope.source, '']);
  rows.push(['Contexte', 'Collaborateur', scope.assignee || 'Tous', '']);
  rows.push([
    'Contexte',
    'Période',
    scope.from || scope.to ? `${scope.from || '…'} → ${scope.to || '…'}` : 'Depuis le début',
    '',
  ]);

  /* ------------------------------------------------------------- synthèse */
  rows.push(['Synthèse', 'Demandes', frNumber(summary.total), '']);

  const previousTotal = scope.previousTotal;
  const variation = previousTotal != null ? trend(summary.total, previousTotal) : null;
  if (previousTotal != null && variation != null) {
    // Le signe est porté par la part : c'est la colonne où vivent tous les
    // taux du fichier, et une variation est un taux.
    rows.push([
      'Synthèse',
      'Variation vs période précédente',
      '',
      `${variation > 0 ? '+' : ''}${frPercent(variation)}`,
    ]);
    rows.push(['Synthèse', 'Effectif période précédente', frNumber(previousTotal), '']);
  }

  rows.push(countRow('Synthèse', 'Non assignées', summary.unassigned, summary.total));
  rows.push(countRow('Synthèse', 'À traiter (statut Nouveau)', summary.untouched, summary.total));
  rows.push(
    countRow('Synthèse', `Non traitées depuis plus de ${STALE_DAYS} jours`, summary.staleCount, summary.total),
  );

  // Taux repris tels que définis dans `kpi.ts` : le taux de qualification se
  // calcule sur les demandes tranchées, pas sur le total, sinon il baisse à
  // chaque nouvelle demande non encore traitée.
  rows.push([
    'Synthèse',
    'Taux de qualification (sur demandes tranchées)',
    '',
    frPercent(summary.qualificationRate),
  ]);
  rows.push(['Synthèse', 'Taux de traitement', '', frPercent(summary.handledRate)]);
  rows.push([
    'Synthèse',
    'Ancienneté médiane des demandes à traiter',
    summary.medianUntouchedAge == null ? '' : formatAge(summary.medianUntouchedAge),
    '',
  ]);

  // Exposé même à zéro : c'est un contrôle d'intégrité. Ces demandes comptent
  // dans le total mais dans aucun statut, ce qui ferait diverger la somme des
  // lignes « Statut » du total sans que rien ne le signale.
  rows.push(['Synthèse', 'Statut non reconnu', frNumber(summary.unknownStatus), '']);

  /* -------------------------------------------------------------- statuts */
  for (const status of STATUSES) {
    rows.push(countRow('Statut', status, summary.byStatus[status], summary.total));
  }

  for (const priority of PRIORITIES) {
    rows.push(countRow('Priorité', priority, summary.byPriority[priority], summary.total));
  }

  /* -------------------------------------------------------- répartitions */
  rows.push(...distributionRows('Catégorie', distribution(leads, (l) => l.category)));
  rows.push(...distributionRows('Motif', distribution(leads, (l) => l.motive)));
  rows.push(...distributionRows('Département', distribution(leads, (l) => l.address.department)));
  rows.push(...distributionRows('Partenaire', distribution(leads, (l) => l.partner)));

  // Répartitions complètes, sans regroupement en « Autres » : le graphique
  // tronque à 6 ou 8 tranches pour rester lisible, un fichier n'a pas cette
  // contrainte et sert justement à retrouver la queue de distribution.

  /* ---------------------------------------------------------- par mois */
  for (const point of byMonth(leads)) {
    rows.push(['Mois', point.key, frNumber(point.count), '']);
  }

  /* -------------------------------------------------- par collaborateur */
  for (const load of perAssignee(leads)) {
    rows.push(countRow('Collaborateur', load.name, load.total, summary.total));
    if (load.untouched) {
      rows.push([
        'Collaborateur',
        `${load.name} — à traiter`,
        frNumber(load.untouched),
        load.total > 0 ? frPercent(load.untouched / load.total) : '',
      ]);
    }
  }

  return { headers: [...HEADERS], rows };
}

/** Nom de fichier daté, sur le même modèle que l'export marketing. */
export function kpiExportFilename(now: number = Date.now()): string {
  return `sunlib-kpi-${stamp(now)}.csv`;
}
