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
 * Territoire d'un collaborateur, dans ses deux échelles.
 *
 * Les deux sont conservées parce qu'elles ne servent pas à la même chose : la
 * **région** se lit, le **département** se rapproche. Un commercial en couvre
 * une douzaine — « 01, 03, 07 +9 » ne dit rien à personne, là où
 * « Auvergne-Rhône-Alpes » situe immédiatement.
 */
export interface StaffCoverage {
  /** Codes départements couverts, triés. Sert la recherche et le rapprochement. */
  codes: string[];
  /**
   * Régions couvertes, sans doublon, **de la plus fournie à la moins fournie**.
   *
   * Cet ordre-là et pas l'alphabet, parce que l'affichage est tronqué : Ilan
   * couvre Centre-Val de Loire (6 départements), Hauts-de-France (5) et
   * Île-de-France (8). Par ordre alphabétique, la troncature à deux régions
   * masquerait justement l'Île-de-France — la principale. À nombre égal, on
   * retombe sur l'alphabet français.
   */
  regions: string[];
}

export type CoverageIndex = ReadonlyMap<string, StaffCoverage>;

/**
 * Territoire couvert par chaque collaborateur.
 *
 * Sert de complément d'information dans les listes de collaborateurs, où le
 * service (« Commercial ») ne dit rien du territoire.
 */
export function coverageByStaff(territories: Territory[]): CoverageIndex {
  const codesByStaff = new Map<string, Set<string>>();
  // Compté, et pas seulement collecté : c'est ce nombre qui ordonne les
  // régions, donc ce que la troncature d'affichage conserve.
  const regionWeight = new Map<string, Map<string, number>>();

  for (const t of territories) {
    if (!t.active) continue;
    const key = sectorKey(t.code);
    if (!key) continue;
    const region = t.region.trim();

    for (const id of t.staffIds) {
      let codes = codesByStaff.get(id);
      if (!codes) {
        codes = new Set();
        codesByStaff.set(id, codes);
      }
      // `Set` plutôt qu'un `includes` : deux lignes peuvent partager une clé,
      // la Corse par exemple si 2A et 2B y étaient saisis séparément.
      const isNewCode = !codes.has(key);
      codes.add(key);

      if (!region || !isNewCode) continue;
      let weights = regionWeight.get(id);
      if (!weights) {
        weights = new Map();
        regionWeight.set(id, weights);
      }
      weights.set(region, (weights.get(region) ?? 0) + 1);
    }
  }

  const collator = new Intl.Collator('fr');
  const byStaff = new Map<string, StaffCoverage>();
  for (const [id, codes] of codesByStaff) {
    const weights = regionWeight.get(id) ?? new Map<string, number>();
    const regions = [...weights.entries()]
      .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
      .map(([region]) => region);
    byStaff.set(id, { codes: [...codes].sort(), regions });
  }
  return byStaff;
}

/**
 * Résumé du territoire d'un commercial, pour une ligne de liste déroulante.
 *
 * Les **régions** d'abord : c'est l'échelle que l'on reconnaît sans réfléchir.
 * Deux au plus, le reste compté — les commerciaux en couvrent deux ou trois, et
 * une ligne de liste n'a pas la place d'en afficher davantage.
 *
 * Les codes départements ne servent de repli que si la région manque, ce qui
 * n'arrive que sur une ligne de sectorisation incomplète. Ils restent
 * interrogeables par la recherche, qui lit le champ complet.
 */
export function formatCoverage(coverage: StaffCoverage | undefined): string {
  const regions = coverage?.regions ?? [];
  if (regions.length) {
    if (regions.length <= 2) return regions.join(', ');
    return `${regions.slice(0, 2).join(', ')} +${regions.length - 2}`;
  }

  const codes = coverage?.codes ?? [];
  if (!codes.length) return '';
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
  coverage: CoverageIndex,
): StaffOption[] {
  return staff.map((s) => {
    const inSector = Boolean(sector?.staffIds.includes(s.id));
    const territory = formatCoverage(coverage.get(s.id));
    return {
      value: s.id,
      label: s.name,
      // Le territoire remplace le service dans le complément : dans une modale
      // d'assignation, « Nouvelle-Aquitaine » informe plus que « Commercial ».
      // Le commercial du secteur garde sa mention propre — c'est le signal le
      // plus fort de la liste, et il ne doit dépendre d'aucun regroupement,
      // que tous les appelants ne demandent pas.
      hint: inSector ? `Secteur ${sector?.code}` : territory || s.group,
      pinned: inSector,
    };
  });
}
