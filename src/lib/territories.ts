/**
 * Sectorisation commerciale — rapprochement d'une demande et de son commercial.
 *
 * La table Airtable donne un commercial par département ; ce module en fait un
 * index et répond à la seule question que pose l'interface : *qui couvre cette
 * demande ?* Aucune écriture — la sectorisation est une donnée de référence,
 * jamais recopiée sur la demande.
 *
 * **Une ligne porte un département ou un code postal.** Le code sur deux
 * caractères couvre tout le département ; un code sur cinq chiffres ne couvre
 * que ce code postal et **prime** sur la ligne de son département. C'est ce
 * qui permet de découper un département entre plusieurs commerciaux — le 69,
 * où Lyon est réparti par code postal — sans renoncer au rattachement par
 * département partout ailleurs : on ne saisit que les exceptions, et un code
 * postal sans ligne à lui retombe sur son département.
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
import { departmentCodeOf, normalisePostalCode } from './geo';
import type { Lead, StaffMember, Territory } from './records';

/** Un secteur — département ou code postal — vu depuis l'interface. */
export interface Sector {
  /** Clé de rapprochement : deux caractères, ou cinq chiffres pour un code postal. */
  code: string;
  /** Granularité de la ligne. Un code postal prime sur son département. */
  scope: 'department' | 'postalCode';
  /** Nom du département ou de la zone, s'il est renseigné. */
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

/**
 * Clé de rapprochement d'une ligne de la table.
 *
 * Quatre ou cinq chiffres désignent un code postal — quatre, c'est un zéro
 * initial mangé par un tableur, « 1000 » pour 01000. Tout le reste est un code
 * de département, lu par `sectorKey`.
 */
export function territoryKey(code: string): string {
  const raw = (code ?? '').trim();
  return /^\d{4,5}$/.test(raw) ? normalisePostalCode(raw) : sectorKey(raw);
}

/** Vrai si la clé désigne un code postal plutôt qu'un département. */
export function isPostalKey(key: string): boolean {
  return key.length === 5;
}

/** Clé départementale d'une demande — champ Airtable, sinon code postal. */
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
    const key = territoryKey(t.code);
    if (!key) continue;

    const existing = index.get(key);
    if (!existing) {
      index.set(key, {
        code: key,
        scope: isPostalKey(key) ? 'postalCode' : 'department',
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

/**
 * Secteur d'une demande, ou `null` si ni son code postal ni son département
 * ne sont couverts.
 *
 * Le code postal d'abord : une ligne à cinq chiffres est une exception
 * délibérée au découpage départemental, elle doit l'emporter. Sans ligne à
 * lui, on retombe sur le département — c'est le cas de la très grande majorité
 * des demandes.
 */
export function sectorForLead(lead: Lead, index: SectorIndex): Sector | null {
  const postalCode = normalisePostalCode(lead.address.postalCode);
  if (postalCode.length === 5) {
    const exact = index.get(postalCode);
    if (exact) return exact;
  }
  const key = sectorKeyOf(lead);
  return key ? index.get(key) ?? null : null;
}

/** Codes — départements et codes postaux — couverts par un collaborateur, triés. */
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
    const key = territoryKey(t.code);
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

/** Intertitre des commerciaux présents dans la sectorisation. */
export const SECTORISED_GROUP = 'Commerciaux (sectorisation)';
/** Intertitre de tous les autres collaborateurs. */
export const OTHER_GROUP = 'Autres collaborateurs';

/**
 * Groupes de la liste d'assignation, dans l'ordre.
 *
 * Trois niveaux, parce que trois questions différentes se posent : qui couvre
 * *cette* demande, qui couvre un secteur en général, et qui n'est pas
 * commercial. Sans secteur connu — les DOM, une demande sans adresse — le
 * premier niveau disparaît au lieu d'annoncer une section vide.
 */
export function staffGroups(sector: Sector | null): string[] {
  return sector
    ? [`Secteur ${sector.code}`, SECTORISED_GROUP, OTHER_GROUP]
    : [SECTORISED_GROUP, OTHER_GROUP];
}

/**
 * Options de collaborateurs pour une demande : ceux du secteur d'abord.
 *
 * **La sectorisation ordonne la liste, elle ne la restreint pas.** Les huit
 * commerciaux sectorisés viennent en tête, mais les 27 autres collaborateurs
 * restent assignables : une demande d'abonné part au service client, et un
 * commercial fraîchement arrivé n'a pas encore de secteur. Filtrer la liste
 * sur la sectorisation rendrait ces deux cas impossibles depuis l'application,
 * alors qu'ils sont légitimes.
 *
 * Le tri alphabétique reste celui de la liste déroulante ; on ne fait ici que
 * désigner le groupe de chacun. Un collaborateur inactif déjà assigné reste
 * dans la liste — c'est la règle appliquée par la fiche complète, on ne la
 * contredit pas.
 */
export interface StaffOption {
  value: string;
  label: string;
  hint?: string;
  /** Départements couverts, cherchés même quand le complément dit autre chose. */
  keywords?: string;
  /** Intertitre sous lequel ranger l'option. Voir `staffGroups`. */
  group: string;
}

export function staffOptionsFor(
  staff: StaffMember[],
  sector: Sector | null,
  coverage: CoverageIndex,
): StaffOption[] {
  return staff.map((s) => {
    const inSector = Boolean(sector?.staffIds.includes(s.id));
    const territory = formatCoverage(coverage.get(s.id));
    // Le complément dit le territoire, et rien d'autre : dans une modale
    // d'assignation, « 33, 40, 47 » répond à la question posée, là où
    // « Directeur » ou « Commercial » ne dit rien du périmètre. Un
    // collaborateur non sectorisé n'a donc pas de complément — mieux vaut
    // rien qu'un service qui n'aide pas à choisir.
    // Le commercial du secteur garde sa mention propre — c'est le signal le
    // plus fort de la liste, et il ne doit dépendre d'aucun regroupement,
    // que tous les appelants ne demandent pas.
    const scope = inSector ? `Secteur ${sector?.code}` : territory;
    // L'absence d'email se dit ici, à l'endroit où l'on choisit : assigner
    // déclenche un mail côté Airtable, et sans adresse il ne part pas — en
    // silence. Voir `lib/staffAudit.ts`.
    const hint = [scope, s.email.trim() ? '' : 'sans email'].filter(Boolean).join(' · ');

    return {
      value: s.id,
      // Même casse que partout ailleurs dans l'écran : la table RH contient
      // aussi bien « Thibaut BONNET » que « rania kamal », et une liste où la
      // moitié des lignes crie se lit mal.
      label: formatPersonName(s.name),
      hint: hint || undefined,
      // Ses départements restent cherchables malgré tout : on tape le numéro
      // du client pour trouver qui le couvre, et « Secteur 33 » aurait exclu
      // de la recherche un « 47 » que ce commercial couvre pourtant.
      keywords: territory || undefined,
      group: inSector
        ? `Secteur ${sector?.code}`
        : (coverage.get(s.id)?.length ?? 0) > 0
          ? SECTORISED_GROUP
          : OTHER_GROUP,
    };
  });
}
