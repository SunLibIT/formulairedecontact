/**
 * Repérage des demandes répétées d'une même personne.
 *
 * Deux demandes portant la même adresse email sont deux demandes de la même
 * personne. C'est courant : sur les 440 demandes de contact, 37 adresses en
 * portent 61 de trop — une seule adresse en compte 18.
 *
 * Ce module ne fusionne rien et n'écrit rien. Il **désigne** les lignes
 * concernées pour que l'écran les rassemble et qu'on puisse trancher à la
 * main. C'est délibéré : sur 19 de ces 37 groupes les statuts se contredisent
 * — « Qualifié » d'un côté, « Hors Critères » de l'autre — donc une règle
 * automatique du type « garder la plus récente » écraserait une décision
 * commerciale. Seul un humain sait laquelle compte.
 *
 * À ne pas confondre avec `dedupeByEmail` de `marketingExport.ts`, qui écarte
 * effectivement des lignes du fichier CSV. Ici on les met en avant.
 */
import { normaliseEmail } from './marketingExport';
import type { Lead } from './records';

/** Ce qu'on sait d'une ligne appartenant à un groupe de doublons. */
export interface DuplicateMark {
  /** Adresse normalisée qui rassemble le groupe. */
  email: string;
  /** Nombre de demandes portées par cette adresse. Toujours ≥ 2. */
  count: number;
  /** Rang chronologique dans le groupe, 1 étant la demande la plus récente. */
  rank: number;
}

export interface DuplicateIndex {
  /** Lignes en doublon, indexées par identifiant d'enregistrement. */
  marks: Map<string, DuplicateMark>;
  /** Adresses concernées — le compteur à afficher dans le filtre. */
  addresses: number;
  /** Lignes concernées, groupes entiers compris. */
  rows: number;
}

const EMPTY: DuplicateIndex = { marks: new Map(), addresses: 0, rows: 0 };

/**
 * Construit l'index des doublons.
 *
 * **À calculer sur la table entière**, jamais sur une liste déjà filtrée : un
 * filtre sur « Qualifié » masquerait le jumeau « Hors Critères » et le doublon
 * cesserait d'apparaître, alors que c'est précisément le cas qu'on cherche.
 *
 * Les lignes sans email sont ignorées : sans clé commune, rien ne permet
 * d'affirmer que deux d'entre elles concernent la même personne.
 */
export function buildDuplicateIndex(leads: Lead[]): DuplicateIndex {
  if (!leads.length) return EMPTY;

  const groups = new Map<string, Lead[]>();
  for (const lead of leads) {
    const email = normaliseEmail(lead.email);
    if (!email) continue;
    const group = groups.get(email);
    if (group) group.push(lead);
    else groups.set(email, [lead]);
  }

  const marks = new Map<string, DuplicateMark>();
  let addresses = 0;
  let rows = 0;

  for (const [email, group] of groups) {
    if (group.length < 2) continue;
    addresses++;
    rows += group.length;

    // Rang chronologique décroissant : le rang 1 est la demande la plus
    // récente, celle qui décrit l'état actuel de la personne.
    const ordered = [...group].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    ordered.forEach((lead, i) => {
      marks.set(lead.id, { email, count: group.length, rank: i + 1 });
    });
  }

  return { marks, addresses, rows };
}

/** Ne garde que les lignes appartenant à un groupe de doublons. */
export function keepDuplicates(leads: Lead[], index: DuplicateIndex): Lead[] {
  return leads.filter((l) => index.marks.has(l.id));
}

/**
 * Rassemble les lignes d'une même adresse, **sans imposer d'ordre interne**.
 *
 * Le tri choisi à l'écran est conservé : il ordonne les groupes entre eux —
 * par leur première ligne rencontrée — et les lignes à l'intérieur de chaque
 * groupe. Cliquer sur un en-tête de colonne continue donc d'avoir un effet
 * visible, ce qui ne serait pas le cas si le regroupement écrasait le tri.
 *
 * L'entrée est supposée déjà triée. Le regroupement est stable.
 */
export function groupByAddress(leads: Lead[], index: DuplicateIndex): Lead[] {
  const groups = new Map<string, Lead[]>();
  const loose: Lead[] = [];

  for (const lead of leads) {
    const email = index.marks.get(lead.id)?.email;
    if (!email) {
      loose.push(lead);
      continue;
    }
    const group = groups.get(email);
    if (group) group.push(lead);
    else groups.set(email, [lead]);
  }

  // Les groupes sortent dans l'ordre de première apparition, donc dans l'ordre
  // du tri courant. Les lignes hors groupe suivent : quand le filtre
  // « doublons » est actif il n'y en a aucune, et sinon elles ne doivent pas
  // s'intercaler au milieu des groupes.
  return [...[...groups.values()].flat(), ...loose];
}
