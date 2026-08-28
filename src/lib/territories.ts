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
import { formatPersonName } from './format';
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

/** Codes départements couverts par un collaborateur, triés. */
export type CoverageIndex = ReadonlyMap<string, string[]>;

/**
 * Départements couverts par chaque collaborateur.
 *
 * Sert de complément d'information dans les listes de collaborateurs, où le
 * service (« Commercial ») ne dit rien du territoire.
 */
export function coverageByStaff(territories: Territory[]): CoverageIndex {
  const codesByStaff = new Map<string, Set<string>>();

  for (const t of territories) {
    if (!t.active) continue;
    const key = sectorKey(t.code);
    if (!key) continue;

    for (const id of t.staffIds) {
      let codes = codesByStaff.get(id);
      if (!codes) {
        codes = new Set();
        codesByStaff.set(id, codes);
      }
      // `Set` plutôt qu'un `includes` : deux lignes peuvent partager une clé,
      // la Corse par exemple si 2A et 2B y étaient saisis séparément.
      codes.add(key);
    }
  }

  const byStaff = new Map<string, string[]>();
  for (const [id, codes] of codesByStaff) byStaff.set(id, [...codes].sort());
  return byStaff;
}

/**
 * Territoire d'un collaborateur pour une ligne de liste déroulante : ses codes
 * départements, **tous**, dans l'ordre.
 *
 * Aucune troncature ici, volontairement. Un commercial en couvre une douzaine,
 * et « 01, 03, 07 +9 » ne répond pas à la question posée — savoir si la
 * personne couvre le département de la demande suppose de voir la liste. La
 * place manque parfois (la barre de sélection multiple est étroite) : c'est
 * l'affichage qui coupe, avec des points de suspension, plutôt que le
 * formatage qui décide d'avance ce qui mérite d'être lu.
 *
 * Effet de bord utile : les codes étant dans le complément, la recherche de la
 * liste — qui lit libellé et complément — trouve un commercial en tapant « 47 ».
 */
export function formatCoverage(codes: string[] | undefined): string {
  return (codes ?? []).join(', ');
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
  /** Départements couverts, cherchés même quand le complément dit autre chose. */
  keywords?: string;
  /** Vrai si le collaborateur couvre le département de la demande. */
  pinned?: boolean;
}

export function staffOptionsFor(
  staff: StaffMember[],
  sector: Sector | null,
  coverage: CoverageIndex,
): StaffOption[] {
  return staff.map((s) => {
    const inSector = Boolean(sector?.staffIds.includes(s.id));
    const territory = formatCoverage(coverage.get(s.id));
    return {
      value: s.id,
      // Même casse que partout ailleurs dans l'écran : la table RH contient
      // aussi bien « Thibaut BONNET » que « rania kamal », et une liste où la
      // moitié des lignes crie se lit mal.
      label: formatPersonName(s.name),
      // Le complément dit le territoire, et rien d'autre : dans une modale
      // d'assignation, « 33, 40, 47 » répond à la question posée, là où
      // « Directeur » ou « Commercial » ne dit rien du périmètre. Un
      // collaborateur non sectorisé n'a donc pas de complément — mieux vaut
      // rien qu'un service qui n'aide pas à choisir.
      // Le commercial du secteur garde sa mention propre — c'est le signal le
      // plus fort de la liste, et il ne doit dépendre d'aucun regroupement,
      // que tous les appelants ne demandent pas.
      hint: inSector ? `Secteur ${sector?.code}` : territory || undefined,
      // Ses départements restent cherchables malgré tout : on tape le numéro
      // du client pour trouver qui le couvre, et « Secteur 33 » aurait exclu
      // de la recherche un « 47 » que ce commercial couvre pourtant.
      keywords: territory || undefined,
      pinned: inSector,
    };
  });
}
