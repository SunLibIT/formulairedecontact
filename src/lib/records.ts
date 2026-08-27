/**
 * Normalisation des enregistrements Airtable vers une forme commune.
 *
 * Les deux tables décrivent la même chose au fond — une personne, un statut,
 * une priorité, un assigné, une date — mais avec des noms de champs sans
 * rapport. En les ramenant à un type unique, le filtrage, le tri, les
 * statistiques et les cartes ne s'écrivent **qu'une fois** au lieu d'être
 * dupliqués par onglet, comme c'était le cas jusqu'ici.
 */
import type { AirtableRecord } from './airtable';
import { departmentFromPostalCode, normalisePostalCode } from './geo';
import { CONTACT, LEAD, STAFF, TERRITORY, type Priority, type Status } from './schema';

export type LeadSource = 'contact' | 'solar';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  group: string;
  active: boolean;
}

/** Un département de la sectorisation commerciale et le commercial qui le couvre. */
export interface Territory {
  id: string;
  /** Code sur deux caractères, zéro initial compris — « 01 », « 20 » pour la Corse. */
  code: string;
  name: string;
  region: string;
  /** Identifiants RH liés. Plusieurs commerciaux sur un même département est légal. */
  staffIds: string[];
  active: boolean;
}

export interface Lead {
  /** Identifiant de l'enregistrement Airtable. */
  id: string;
  source: LeadSource;
  /** Référence métier affichable : `Response ID` Typeform, sinon l'id Airtable. */
  ref: string;
  /** Date de référence en ISO — soumission Typeform ou création du lead. */
  date: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  /** Type de demandeur (contact) ou type de client (simulateur). */
  category: string;
  motive: string;
  message: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    postalCode: string;
    department: string;
    region: string;
    country: string;
  };
  status: Status;
  priority: Priority;
  partner: string;
  /** Identifiants d'enregistrement RH liés. */
  assigneeIds: string[];
  /** Noms résolus, dans le même ordre. */
  assigneeNames: string[];
  notes: string;
  /**
   * Consentement RGPD coché à la soumission.
   *
   * **Faux vaut « pas de consentement vérifiable », pas « refus »** : les
   * reprises historiques ont le champ vide, et une case décochée est stockée
   * de la même façon qu'une case jamais posée. On ne sait pas distinguer les
   * deux, donc l'export marketing exclut les deux — c'est le seul choix
   * défendable quand la base légale n'est pas prouvable.
   */
  gdprConsent: boolean;
  /** Chiffres propres au simulateur solaire. */
  metrics?: {
    annualConsumption?: number;
    monthlyBill?: number;
    recommendedPower?: number;
  };
}

const str = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  // Airtable renvoie les listes déroulantes en objet {id, name, color}.
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return String((v as { name: unknown }).name ?? '');
  }
  return '';
};

const num = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : undefined;

/** Libellés textuels valant « vrai » — les deux tables n'ont pas le même type. */
const TRUTHY = new Set(['true', 'oui', 'yes', '1', 'x', 'checked', 'coché', 'coche']);

/**
 * Lit un booléen tolérant au type de stockage.
 *
 * Les deux colonnes de consentement sont aujourd'hui des cases à cocher
 * Airtable : la valeur est `true`, ou le champ est absent de la réponse. La
 * tolérance aux formes textuelles couvre le cas où la colonne serait un jour
 * remplie par un import ou une automatisation, qui écrivent volontiers `"Oui"`
 * ou `"1"`. Un faux négatif ici retirerait des contacts légitimes de toutes
 * les campagnes, sans erreur visible.
 */
const bool = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return TRUTHY.has(v.trim().toLowerCase());
  return false;
};

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Défaut sûr : un statut absent vaut « Nouveau », pas une valeur vide. */
const asStatus = (v: unknown): Status => (str(v) || 'Nouveau') as Status;
const asPriority = (v: unknown): Priority => (str(v) || 'Moyenne') as Priority;

export function toStaffMember(record: AirtableRecord): StaffMember {
  return {
    id: record.id,
    name: str(record.fields[STAFF.name]),
    email: str(record.fields[STAFF.email]),
    group: str(record.fields[STAFF.group]),
    active: record.fields[STAFF.inactive] !== true,
  };
}

/**
 * Une ligne de sectorisation.
 *
 * Le code est relu par `str` puis retaillé : la colonne est un texte, mais un
 * import ou une automatisation peut y laisser « 1 » là où la table dit « 01 ».
 * On restitue le zéro plutôt que de rater le rapprochement en silence.
 */
export function toTerritory(record: AirtableRecord): Territory {
  const raw = str(record.fields[TERRITORY.code]).trim();
  return {
    id: record.id,
    code: raw.length === 1 ? `0${raw}` : raw,
    name: str(record.fields[TERRITORY.name]),
    region: str(record.fields[TERRITORY.region]),
    staffIds: ids(record.fields[TERRITORY.salesRep]),
    // Une ligne sans case cochée est traitée comme active : le défaut d'une
    // case Airtable est « vide », et un département muet vaudrait mieux qu'un
    // département sans commercial.
    active: record.fields[TERRITORY.active] !== false,
  };
}

function resolveNames(assigneeIds: string[], staff: Map<string, string>): string[] {
  return assigneeIds.map((id) => staff.get(id) ?? id);
}

/** Une demande du formulaire de contact Typeform. */
export function toContactLead(
  record: AirtableRecord,
  staff: Map<string, string>,
): Lead {
  const f = record.fields;
  const firstName = str(f[CONTACT.firstName]);
  const lastName = str(f[CONTACT.lastName]);
  const assigneeIds = ids(f[CONTACT.assignee]);

  return {
    id: record.id,
    source: 'contact',
    ref: str(f[CONTACT.responseId]) || record.id,
    // La date de soumission est la vérité métier ; la date de création de
    // l'enregistrement Airtable n'est qu'un repli pour les cas incomplets.
    date: str(f[CONTACT.submittedAt]) || record.createdTime,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || 'Sans nom',
    email: str(f[CONTACT.email]),
    phone: str(f[CONTACT.phone]),
    company: str(f[CONTACT.company]),
    category: str(f[CONTACT.requesterType]),
    motive: str(f[CONTACT.motive]),
    message: str(f[CONTACT.message]),
    address: {
      line1: str(f[CONTACT.address]),
      line2: str(f[CONTACT.addressLine2]),
      city: str(f[CONTACT.city]),
      postalCode: str(f[CONTACT.postalCode]),
      department: str(f[CONTACT.department]),
      region: str(f[CONTACT.region]),
      country: str(f[CONTACT.country]),
    },
    status: asStatus(f[CONTACT.status]),
    priority: asPriority(f[CONTACT.priority]),
    partner: str(f[CONTACT.partner]),
    assigneeIds,
    assigneeNames: resolveNames(assigneeIds, staff),
    notes: str(f[CONTACT.notes]),
    gdprConsent: bool(f[CONTACT.gdprConsent]),
  };
}

/** Un lead issu du simulateur solaire. */
export function toSolarLead(
  record: AirtableRecord,
  staff: Map<string, string>,
): Lead {
  const f = record.fields;
  const firstName = str(f[LEAD.firstName]);
  const lastName = str(f[LEAD.lastName]);
  const assigneeIds = ids(f[LEAD.assignee]);
  const names = resolveNames(assigneeIds, staff);
  // Cette table a aussi un champ texte libre historique : on ne l'utilise
  // qu'en l'absence de lien RH, pour ne pas perdre les anciennes saisies.
  const legacyAssignee = str(f[LEAD.assigneeText]);

  return {
    id: record.id,
    source: 'solar',
    ref: record.id,
    date: str(f[LEAD.createdOn]) || record.createdTime,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || 'Sans nom',
    email: str(f[LEAD.email]),
    phone: str(f[LEAD.phone]),
    company: '',
    category: str(f[LEAD.customerType]),
    motive: '',
    message: '',
    address: {
      line1: str(f[LEAD.address]),
      line2: '',
      city: str(f[LEAD.city]),
      postalCode: str(f[LEAD.postalCode]),
      // Cette table n'a pas de colonne « Département » : on la déduit. Un
      // `slice(0, 2)` brut donnait « 24 » pour un code saisi `2456` et
      // écrasait les trois chiffres de l'outre-mer.
      department: departmentFromPostalCode(str(f[LEAD.postalCode])),
      region: '',
      country: '',
    },
    status: asStatus(f[LEAD.status]),
    priority: asPriority(f[LEAD.priority]),
    partner: str(f[LEAD.partner]),
    assigneeIds,
    assigneeNames: names.length ? names : legacyAssignee ? [legacyAssignee] : [],
    notes: str(f[LEAD.notes]),
    gdprConsent: bool(f[LEAD.gdprConsent]),
    metrics: {
      annualConsumption: num(f[LEAD.annualConsumption]),
      monthlyBill: num(f[LEAD.monthlyBill]),
      recommendedPower: num(f[LEAD.recommendedPower]),
    },
  };
}

/**
 * Localité sur une ligne — « 69100 Villeurbanne ».
 *
 * Le code postal passe par `normalisePostalCode` comme partout ailleurs :
 * affiché brut, un import tableur donnerait « 1000 Bourg-en-Bresse ». Chacun
 * des deux morceaux peut manquer sans laisser de blanc.
 */
export function formatLocality(a: Lead['address']): string {
  return [normalisePostalCode(a.postalCode), a.city].filter(Boolean).join(' ');
}

/** Adresse sur une ligne, sans virgule orpheline quand un morceau manque. */
export function formatAddress(a: Lead['address']): string {
  const street = [a.line1, a.line2].filter(Boolean).join(', ');
  return [street, formatLocality(a), a.country].filter(Boolean).join(', ');
}
