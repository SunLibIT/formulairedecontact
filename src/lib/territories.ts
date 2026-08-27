/**
 * Sectorisation commerciale — rapprochement d'une demande et de son commercial.
 *
 * La table Airtable donne un commercial par département ; ce module en fait un
 * index et répond à la seule question que pose l'interface : *qui couvre cette
 * demande ?* Aucune écriture — la sectorisation est une donnée de référence,
 * jamais recopiée sur la demande.
 *
 * Deux précautions qui expliquent la forme du code :
 *
 * **Le rapprochement se fait sur deux caractères.** Les tables ne s'accordent
 * pas : `Demandes de contact` stocke les deux premiers chiffres du code postal,
 * tandis que `departmentFromPostalCode` rend trois chiffres en outre-mer, où le
 * département est réellement 971…978. On tronque donc des deux côtés — un
 * `971` cherche « 97 », ne trouve rien puisque les DOM ne sont pas sectorisés,
 * et l'interface le dit au lieu de proposer un commercial métropolitain au
 * hasard.
 *
 * **Le département d'une demande passe par `departmentCodeOf`.** Le champ
 * Airtable prime, le code postal sert de repli : les leads solaires n'ont pas
 * de colonne « Département », et une partie des demandes reprises de l'export
 * historique l'a vide alors que leur code postal est renseigné.
 */
import { departmentCodeOf } from './geo';
import type { Lead, StaffMember, Territory } from './records';

/** Un département sectorisé, vu depuis l'interface. */
export interface Sector {
  /** Clé de rapprochement, deux caractères. */
  code: string;
  /** Nom du département, s'il est renseigné. */
  name: string;
  region: string;
  /** Commerciaux qui le couvrent — un, en pratique. */
  staffIds: string[];
}

/** Index code → secteur, seule structure que l'interface manipule. */
export type SectorIndex = ReadonlyMap<string, Sector>;

/**
 * Clé de rapprochement d'un code de département.
 *
 * Chaîne vide si le code est inexploitable : mieux vaut « pas de secteur » que
 * la clé d'un département voisin.
 */
export function sectorKey(department: string): string {
  const code = (department ?? '').trim().toUpperCase();
  if (code.length < 2) return '';
  const key = code.slice(0, 2);
  // La table dit « 20 » pour la Corse, comme le champ « Département » des
  // demandes. Un 2A ou 2B saisi malgré tout y est ramené, faute de quoi la
  // ligne ne serait jamais rapprochée d'aucune demande.
  return key === '2A' || key === '2B' ? '20' : key;
}

/** Clé de rapprochement d'une demande — champ Airtable, sinon code postal. */
export function sectorKeyOf(lead: Lead): string {
  return sectorKey(departmentCodeOf(lead.address.department, lead.address.postalCode));
}

/**
 * Construit l'index.
 *
 * Les lignes désactivées sont ignorées : une sectorisation retirée ne doit plus
 * orienter une assignation. Deux lignes partageant une clé — la Corse, si 2A et
 * 2B y étaient un jour saisis séparément — fusionnent leurs commerciaux au lieu
 * que la dernière lue écrase la première.
 */
export function buildSectorIndex(territories: Territory[]): SectorIndex {
  const index = new Map<string, Sector>();

  for (const t of territories) {
    if (!t.active) continue;
    const key = sectorKey(t.code);
    if (!key) continue;

    const existing = index.get(key);
    if (!existing) {
      index.set(key, {
        code: key,
        name: t.name,
        region: t.region,
        staffIds: [...t.staffIds],
      });
      continue;
    }
    for (const id of t.staffIds) {
      if (!existing.staffIds.includes(id)) existing.staffIds.push(id);
    }
  }

  return index;
}

/** Secteur d'une demande, ou `null` si son département n'est pas couvert. */
export function sectorForLead(lead: Lead, index: SectorIndex): Sector | null {
  const key = sectorKeyOf(lead);
  return key ? index.get(key) ?? null : null;
}

/**
 * Départements couverts par chaque collaborateur, triés.
 *
 * Sert de complément d'information dans les listes de collaborateurs, où le
 * service (« Commercial ») ne dit rien du territoire.
 */
export function coverageByStaff(territories: Territory[]): ReadonlyMap<string, string[]> {
  const byStaff = new Map<string, string[]>();

  for (const t of territories) {
    if (!t.active) continue;
    const key = sectorKey(t.code);
    if (!key) continue;
    for (const id of t.staffIds) {
      const codes = byStaff.get(id);
      if (!codes) byStaff.set(id, [key]);
      else if (!codes.includes(key)) codes.push(key);
    }
  }

  for (const codes of byStaff.values()) codes.sort();
  return byStaff;
}

/**
 * Résumé des départements d'un commercial — « 33, 40, 47 », abrégé au-delà de
 * quatre codes pour ne pas déborder d'une ligne de liste déroulante.
 */
export function formatCoverage(codes: readonly string[] | undefined): string {
  if (!codes?.length) return '';
  if (codes.length <= 4) return codes.join(', ');
  return `${codes.slice(0, 3).join(', ')} +${codes.length - 3}`;
}

/** Libellé d'un secteur — « 33 · Gironde », le nom seulement s'il est connu. */
export function formatSector(sector: Sector): string {
  return sector.name ? `${sector.code} · ${sector.name}` : sector.code;
}

/**
 * Options de collaborateurs pour une demande : ceux du secteur d'abord.
 *
 * Le tri alphabétique reste celui de la liste déroulante ; on ne fait ici que
 * marquer l'appartenance au secteur, à charge pour elle de regrouper. Un
 * collaborateur inactif déjà assigné reste dans la liste — c'est la règle
 * appliquée par la fiche complète, on ne la contredit pas.
 */
export interface StaffOption {
  value: string;
  label: string;
  hint?: string;
  /** Vrai si le collaborateur couvre le département de la demande. */
  pinned?: boolean;
}

export function staffOptionsFor(
  staff: StaffMember[],
  sector: Sector | null,
  coverage: ReadonlyMap<string, string[]>,
): StaffOption[] {
  return staff.map((s) => {
    const inSector = Boolean(sector?.staffIds.includes(s.id));
    const codes = formatCoverage(coverage.get(s.id));
    return {
      value: s.id,
      label: s.name,
      // Le secteur remplace le service dans le complément : dans une modale
      // d'assignation, « couvre le 33 » informe plus que « Commercial ».
      hint: inSector ? `Secteur ${sector?.code}` : codes || s.group,
      pinned: inSector,
    };
  });
}
