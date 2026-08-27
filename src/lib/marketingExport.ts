/**
 * Extraction enrichie pour les campagnes marketing.
 *
 * Produit un CSV importable tel quel dans un outil d'emailing (Brevo,
 * Mailchimp) ou dans Excel, à partir de ce que la vue affiche déjà — mêmes
 * filtres, même période, même tri. L'export n'est donc pas une seconde requête
 * avec sa propre logique de sélection : c'est une **sérialisation de la liste
 * à l'écran**, ce qui évite qu'un jour l'export et l'affichage ne racontent
 * plus la même chose.
 *
 * Une ligne par personne : les demandes répétées sont fusionnées sur l'adresse
 * email, en gardant la plus récente et en comptant les autres dans la colonne
 * « Demandes ». Sur les données réelles, 440 demandes de contact se ramènent
 * ainsi à 379 lignes.
 *
 * Deux familles de colonnes :
 *  - les champs bruts, tels qu'Airtable les stocke ;
 *  - les colonnes **dérivées** — segment, géographie, ancienneté — calculées
 *    ici et nulle part ailleurs. Elles n'existent pas dans la base et n'ont
 *    pas à y être écrites : ce sont des vues de la donnée, pas de la donnée.
 *
 * Tout est pur et sans dépendance au DOM ; la sérialisation et le
 * téléchargement vivent dans `lib/csv.ts`. C'est ce qui rend le contenu de
 * l'export testable ligne à ligne.
 */
import { stamp } from './csv';
import { ageInDays, formatPersonName } from './format';
import { departmentCodeOf, normalisePostalCode } from './geo';
import { categoryLabel } from './leadActions';
import { normaliseLabel, shortMotive } from './motives';
import type { Lead, LeadSource } from './records';

// Ré-exporté pour que l'export reste le point d'entrée unique de ses propres
// colonnes : `COLUMNS` s'en sert, et les tests du CSV le vérifient ici.
export { normalisePostalCode };

/* ------------------------------------------------------- éligibilité RGPD */

/**
 * Vrai si le contact peut légitimement recevoir une campagne d'emailing.
 *
 * Le critère est le consentement recueilli à la soumission. Un enregistrement
 * sans consentement vérifiable — case décochée **ou** reprise historique où la
 * colonne est vide, indistinguables en base — n'y répond pas.
 *
 * Ce prédicat **ne filtre pas** l'export : il alimente la seule colonne
 * « Consentement RGPD ». C'est un choix produit assumé — l'export sert d'abord
 * à travailler la liste, et le gater sur le consentement ne renvoyait que
 * 2 lignes sur 440, ce qui se lisait comme une panne. L'information reste donc
 * dans le fichier, ligne à ligne, sans décider à la place de qui l'utilise.
 */
export function eligibleForCampaign(lead: Lead): boolean {
  return lead.gdprConsent === true;
}

/* ------------------------------------------------------------ segmentation */

/** Segments de campagne — un ciblage, pas une reprise du vocabulaire du formulaire. */
export const SEGMENTS = [
  'Particulier',
  'Professionnel',
  'Installateur',
  'Collectivité',
  'Abonné',
  'Indéterminé',
] as const;
export type Segment = (typeof SEGMENTS)[number];

/**
 * Catégorie normalisée → segment.
 *
 * Couvre les deux tables : `REQUESTER_TYPES` côté formulaire de contact et le
 * type de client du simulateur, qui n'emploie pas les mêmes mots pour les
 * mêmes personnes. Les rapprocher ici est précisément l'intérêt d'un segment :
 * une campagne « particuliers » doit toucher les deux tunnels.
 */
const CATEGORY_SEGMENT: Record<string, Segment> = {
  'un installateur': 'Installateur',
  installateur: 'Installateur',
  'un particulier': 'Particulier',
  particulier: 'Particulier',
  'une entreprise': 'Professionnel',
  entreprise: 'Professionnel',
  professionnel: 'Professionnel',
  pro: 'Professionnel',
  'une collectivite': 'Collectivité',
  collectivite: 'Collectivité',
  'abonne sunlib': 'Abonné',
  abonne: 'Abonné',
};

/** Motifs qui trahissent un installateur quel que soit le type déclaré. */
const INSTALLER_MOTIVES = new Set([
  'devenir partenaire installateur sunlib',
  'partenariat installateur',
]);

/**
 * Segment de campagne d'un lead.
 *
 * Ordre de décision, du signal le plus fiable au plus faible :
 *  1. le type déclaré, quand il est reconnu ;
 *  2. le motif, qui rattrape les demandes de partenariat déposées sans type ;
 *  3. la présence d'une raison sociale, faute de mieux.
 *
 * Le repli est `Indéterminé` et non `Particulier` : un segment inventé se
 * retrouverait dans une campagne, alors qu'une valeur explicitement inconnue
 * se filtre dans l'outil d'emailing. Une donnée manquante doit rester visible.
 */
export function marketingSegment(lead: Lead): Segment {
  const byCategory = CATEGORY_SEGMENT[normaliseLabel(lead.category)];
  if (byCategory) return byCategory;

  if (INSTALLER_MOTIVES.has(normaliseLabel(lead.motive))) return 'Installateur';
  if (lead.company.trim()) return 'Professionnel';

  return 'Indéterminé';
}

/* --------------------------------------------------------------- géographie */

/**
 * Code de département de l'adresse.
 *
 * Les règles vivent dans `lib/geo.ts` : l'onglet KPI et la normalisation des
 * leads solaires en ont besoin aussi, et les trois divergeaient — l'export
 * gérait l'outre-mer, `toSolarLead` tronquait le code postal à deux
 * caractères. Une seule définition, trois lecteurs.
 */
export function departmentCode(lead: Lead): string {
  return departmentCodeOf(lead.address.department, lead.address.postalCode);
}

/* ------------------------------------------------------- temps et cadence */

/** `2026-08` — un mois triable comme du texte, contrairement à « août 2026 ». */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026-T3` — la maille de pilotage des campagnes. */
export function quarterKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
}

/** Date seule, sans heure ni fuseau — ce qu'attend un import de liste. */
function dateOnly(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------- identité et joignabilité */

/** Adresse comparable : minuscules, sans espaces parasites. */
export function normaliseEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

/**
 * Téléphone au format international.
 *
 * Les plateformes d'envoi SMS exigent l'E.164 (`+33612345678`) et rejettent la
 * forme nationale groupée que l'application affiche. On ne réutilise donc pas
 * `formatPhone`, qui poursuit l'objectif inverse — être lu par un humain.
 *
 * Un numéro non reconnu ressort **tel quel** plutôt que mutilé : l'outil
 * d'import le signalera, ce qui est réparable, là où un numéro faussement
 * corrigé partirait à un inconnu.
 */
export function phoneE164(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  // Déjà international, sous une forme ou une autre.
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  // National français : 0X XX… → +33X XX…
  if (/^0\d{9}$/.test(digits)) return `+33${digits.slice(1)}`;
  if (/^33\d{9}$/.test(digits)) return `+${digits}`;

  return trimmed;
}

const SOURCE_LABEL: Record<LeadSource, string> = {
  contact: 'Formulaire de contact',
  solar: 'Simulateur solaire',
};

/* -------------------------------------------------------------- colonnes */

/**
 * Ce qu'une colonne sait en plus du lead lui-même.
 *
 * `now` est passé plutôt que lu de l'horloge pour que toutes les lignes d'un
 * fichier soient datées du même instant. `requests` vient du dédoublonnage :
 * la ligne conservée doit pouvoir dire combien de demandes elle résume.
 */
export interface RowContext {
  now: number;
  requests: number;
}

interface Column {
  header: string;
  value: (lead: Lead, ctx: RowContext) => string;
}

/**
 * Les colonnes de l'export, dans l'ordre du fichier.
 *
 * Déclaratif à dessein : ajouter une colonne est une ligne, et l'en-tête ne
 * peut pas se désynchroniser de la valeur puisque les deux sont écrits au même
 * endroit. Les en-têtes sont stables — un mapping enregistré dans l'outil
 * d'emailing survit donc aux exports suivants ; ne les renommer qu'en sachant
 * qu'un mapping sera à refaire.
 */
export const MARKETING_COLUMNS: readonly Column[] = [
  // — Identité et joignabilité
  { header: 'Email', value: (l) => normaliseEmail(l.email) },
  { header: 'Prénom', value: (l) => formatPersonName(l.firstName) },
  { header: 'Nom', value: (l) => formatPersonName(l.lastName) },
  { header: 'Téléphone', value: (l) => phoneE164(l.phone) },
  { header: 'Société', value: (l) => l.company.trim() },

  // — Segmentation
  { header: 'Segment', value: marketingSegment },
  { header: 'Catégorie', value: (l) => categoryLabel(l) },
  { header: 'Motif', value: (l) => shortMotive(l.motive) },

  // — Géographie
  { header: 'Code postal', value: (l) => normalisePostalCode(l.address.postalCode) },
  { header: 'Ville', value: (l) => l.address.city.trim() },
  { header: 'Département', value: departmentCode },
  { header: 'Région', value: (l) => l.address.region.trim() },
  { header: 'Pays', value: (l) => l.address.country.trim() },

  // — Ancienneté et cadence
  { header: 'Date de la demande', value: (l) => dateOnly(l.date) },
  {
    header: 'Ancienneté (jours)',
    value: (l, ctx) => String(ageInDays(l.date, ctx.now) ?? ''),
  },
  { header: 'Mois', value: (l) => monthKey(l.date) },
  { header: 'Trimestre', value: (l) => quarterKey(l.date) },
  // Nombre de demandes fusionnées sous cette adresse. `1` pour la plupart des
  // lignes ; au-delà, c'est un signal d'intérêt exploitable en ciblage —
  // quelqu'un qui revient quatre fois n'est pas un contact froid.
  { header: 'Demandes', value: (_l, ctx) => String(ctx.requests) },

  // — Suivi commercial, pour exclure ou prioriser une cible
  { header: 'Statut', value: (l) => l.status },
  { header: 'Priorité', value: (l) => l.priority },
  { header: 'Partenaire', value: (l) => l.partner.trim() },
  { header: 'Assigné à', value: (l) => l.assigneeNames.join(', ') },
  { header: 'Source', value: (l) => SOURCE_LABEL[l.source] },
  { header: 'Référence', value: (l) => l.ref },
  // Reportée, jamais filtrante : le fichier porte l'information pour qui
  // prépare un envoi, sans retirer de lignes à qui travaille la liste.
  {
    header: 'Consentement RGPD',
    value: (l) => (eligibleForCampaign(l) ? 'Oui' : 'Non'),
  },
];

/* ------------------------------------------------------------ construction */

/* ------------------------------------------------------- dédoublonnage */

export interface Deduped {
  /** Une ligne par adresse, dans l'ordre de la liste reçue. */
  kept: Lead[];
  /** Nombre de demandes portées par l'adresse d'un lead, indexé par id. */
  requests: Map<string, number>;
  /** Lignes absorbées par la fusion. */
  merged: number;
}

/**
 * Une ligne par adresse email, en conservant la demande **la plus récente**.
 *
 * Pourquoi la plus récente : toutes les colonnes dérivées décrivent une
 * demande précise — ancienneté, statut, ville, segment. En garder une au
 * hasard segmenterait la personne sur une demande périmée. La plus récente est
 * la seule qui décrive son état actuel.
 *
 * Les lignes **sans email ne sont jamais fusionnées entre elles** : elles
 * n'ont aucune clé commune, et les regrouper reviendrait à confondre des
 * personnes différentes.
 *
 * L'ordre d'origine est préservé, celui de la liste affichée : le fichier se
 * relit à côté de l'écran dont il sort.
 */
export function dedupeByEmail(leads: Lead[]): Deduped {
  /** email → lead retenu jusqu'ici. */
  const best = new Map<string, Lead>();
  const counts = new Map<string, number>();

  for (const lead of leads) {
    const email = normaliseEmail(lead.email);
    if (!email) continue;

    counts.set(email, (counts.get(email) ?? 0) + 1);
    const current = best.get(email);
    // `>` et non `>=` : à date égale, la première rencontrée gagne, ce qui rend
    // le résultat stable d'un export à l'autre.
    if (!current || new Date(lead.date).getTime() > new Date(current.date).getTime()) {
      best.set(email, lead);
    }
  }

  const keptIds = new Set([...best.values()].map((l) => l.id));
  const kept = leads.filter((l) => !normaliseEmail(l.email) || keptIds.has(l.id));

  const requests = new Map<string, number>();
  for (const lead of kept) {
    requests.set(lead.id, counts.get(normaliseEmail(lead.email)) ?? 1);
  }

  return { kept, requests, merged: leads.length - kept.length };
}

export interface MarketingExport {
  headers: string[];
  rows: string[][];
  /** Lignes absorbées par le dédoublonnage sur l'email. */
  merged: number;
  /**
   * Exportés mais sans adresse email : inutilisables en campagne email,
   * exploitables en SMS ou en appel. Signalé plutôt que filtré — c'est au
   * marketing de décider, pas à l'export.
   */
  withoutEmail: number;
  /**
   * Adresses distinctes. Égal au nombre de lignes moins celles sans email,
   * puisque `rows` est dédoublonné — conservé comme vérification, et comme
   * chiffre à annoncer : c'est le nombre réel de destinataires.
   */
  uniqueEmails: number;
}

export interface ExportOptions {
  /**
   * Instant de référence de l'extraction.
   *
   * Paramètre et non appel direct à l'horloge : l'ancienneté serait sinon
   * intestable, et deux lignes du même fichier pourraient être calculées à des
   * instants différents.
   */
  now?: number;
}

/**
 * Construit les lignes de l'export à partir des leads **déjà filtrés**.
 *
 * Toute la liste reçue est exportée. Le seul écart possible avec l'affichage
 * est la fusion des demandes répétées d'une même adresse.
 */
export function buildMarketingExport(
  leads: Lead[],
  { now = Date.now() }: ExportOptions = {},
): MarketingExport {
  const { kept, requests, merged } = dedupeByEmail(leads);

  const emails = new Set<string>();
  let withoutEmail = 0;
  for (const lead of kept) {
    const email = normaliseEmail(lead.email);
    if (email) emails.add(email);
    else withoutEmail++;
  }

  return {
    headers: MARKETING_COLUMNS.map((c) => c.header),
    rows: kept.map((lead) =>
      MARKETING_COLUMNS.map((c) =>
        c.value(lead, { now, requests: requests.get(lead.id) ?? 1 }),
      ),
    ),
    merged,
    withoutEmail,
    uniqueEmails: emails.size,
  };
}

/* -------------------------------------------------------------- fichier */

/**
 * Nom de fichier daté, sans espace ni accent.
 *
 * La date est celle de l'extraction, pas celle des données : deux exports du
 * même jour se remplacent dans le dossier de téléchargement, ce qui est le
 * comportement voulu — on veut la dernière liste, pas douze variantes.
 */
export function exportFilename(source: LeadSource, now: number = Date.now()): string {
  const scope = source === 'contact' ? 'demandes-contact' : 'leads-simulateur';
  return `sunlib-marketing-${scope}-${stamp(now)}.csv`;
}
