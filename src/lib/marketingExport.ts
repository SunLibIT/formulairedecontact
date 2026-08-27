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
 * Deux familles de colonnes :
 *  - les champs bruts, tels qu'Airtable les stocke ;
 *  - les colonnes **dérivées** — segment, géographie, ancienneté — calculées
 *    ici et nulle part ailleurs. Elles n'existent pas dans la base et n'ont
 *    pas à y être écrites : ce sont des vues de la donnée, pas de la donnée.
 *
 * Tout est pur et sans dépendance au DOM, sauf `downloadCsv` en fin de
 * fichier. C'est ce qui rend le contenu de l'export testable ligne à ligne.
 */
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
 * Vrai si le contact peut légitimement recevoir une campagne.
 *
 * Le seul critère est le consentement recueilli à la soumission. Un
 * enregistrement sans consentement vérifiable — case décochée **ou** reprise
 * historique où la colonne est vide, indistinguables en base — n'est pas
 * exporté. Ce n'est pas un réglage : un export marketing sans base légale
 * n'est pas un export marketing dégradé, c'est une infraction.
 *
 * Volontairement séparé du reste pour être lisible d'un coup d'œil, et
 * testable seul.
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

interface Column {
  header: string;
  value: (lead: Lead, now: number) => string;
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
  { header: 'Ancienneté (jours)', value: (l, now) => String(ageInDays(l.date, now) ?? '') },
  { header: 'Mois', value: (l) => monthKey(l.date) },
  { header: 'Trimestre', value: (l) => quarterKey(l.date) },

  // — Suivi commercial, pour exclure ou prioriser une cible
  { header: 'Statut', value: (l) => l.status },
  { header: 'Priorité', value: (l) => l.priority },
  { header: 'Partenaire', value: (l) => l.partner.trim() },
  { header: 'Assigné à', value: (l) => l.assigneeNames.join(', ') },
  { header: 'Source', value: (l) => SOURCE_LABEL[l.source] },
  { header: 'Référence', value: (l) => l.ref },
];

/* ------------------------------------------------------------ construction */

export interface MarketingExport {
  headers: string[];
  rows: string[][];
  /** Écartés faute de consentement vérifiable. */
  excluded: number;
  /**
   * Exportés mais sans adresse email : inutilisables en campagne email,
   * exploitables en SMS ou en appel. Signalé plutôt que filtré — c'est au
   * marketing de décider, pas à l'export.
   */
  withoutEmail: number;
  /** Adresses distinctes, doublons compris dans `rows`. */
  uniqueEmails: number;
}

/**
 * Construit les lignes de l'export à partir des leads **déjà filtrés**.
 *
 * `now` est un paramètre et non un appel direct à l'horloge : l'ancienneté
 * serait sinon intestable, et deux lignes du même fichier pourraient être
 * calculées à des instants différents.
 */
export function buildMarketingExport(
  leads: Lead[],
  now: number = Date.now(),
): MarketingExport {
  const eligible = leads.filter(eligibleForCampaign);
  const emails = new Set<string>();
  let withoutEmail = 0;

  for (const lead of eligible) {
    const email = normaliseEmail(lead.email);
    if (email) emails.add(email);
    else withoutEmail++;
  }

  return {
    headers: MARKETING_COLUMNS.map((c) => c.header),
    rows: eligible.map((lead) => MARKETING_COLUMNS.map((c) => c.value(lead, now))),
    excluded: leads.length - eligible.length,
    withoutEmail,
    uniqueEmails: emails.size,
  };
}

/* -------------------------------------------------------------------- CSV */

/** Séparateur point-virgule : c'est celui qu'attend Excel en locale française. */
const DELIMITER = ';';

/** Marque d'ordre des octets, écrite en tête de fichier. Voir `toCsv`. */
const BOM = '﻿';

/**
 * Neutralise une cellule que le tableur pourrait exécuter.
 *
 * Les données viennent d'un formulaire public : un visiteur peut saisir
 * `=HYPERLINK(...)` dans un champ nom, et Excel l'évaluerait à l'ouverture.
 * Le préfixe apostrophe force l'interprétation en texte.
 *
 * On ne neutralise **pas** les valeurs purement numériques, alors qu'elles
 * commencent parfois par `+` ou `-` : un `+33612345678` n'est pas exécutable,
 * et le préfixer produirait exactement l'apostrophe parasite que `formatPhone`
 * doit aujourd'hui nettoyer à l'import. La règle est donc : caractère de tête
 * dangereux **et** contenu non numérique.
 */
function sanitiseCell(value: string): string {
  if (!value) return '';
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  if (/^[+-]?[\d\s().+-]+$/.test(value)) return value;
  return `'${value}`;
}

/** Entoure de guillemets uniquement quand c'est nécessaire, et double les guillemets. */
function quote(value: string): string {
  if (!/[";\r\n]/.test(value) && value === value.trim()) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Sérialise un export en CSV.
 *
 * Fins de ligne CRLF conformes à la RFC 4180, et **BOM UTF-8** en tête : sans
 * lui, Excel sous Windows lit le fichier en ANSI et rend « Sébastien » en
 * « SÃ©bastien ». Le BOM est le seul moyen fiable de l'éviter sans passer par
 * l'assistant d'importation.
 */
export function toCsv({ headers, rows }: Pick<MarketingExport, 'headers' | 'rows'>): string {
  const line = (cells: string[]) =>
    cells.map((c) => quote(sanitiseCell(c))).join(DELIMITER);

  return `${BOM}${[headers, ...rows].map(line).join('\r\n')}\r\n`;
}

/**
 * Nom de fichier daté, sans espace ni accent.
 *
 * La date est celle de l'extraction, pas celle des données : deux exports du
 * même jour se remplacent dans le dossier de téléchargement, ce qui est le
 * comportement voulu — on veut la dernière liste, pas douze variantes.
 */
export function exportFilename(source: LeadSource, now: number = Date.now()): string {
  const stamp = new Date(now).toISOString().slice(0, 10);
  const scope = source === 'contact' ? 'demandes-contact' : 'leads-simulateur';
  return `sunlib-marketing-${scope}-${stamp}.csv`;
}

/**
 * Déclenche le téléchargement du fichier.
 *
 * Seule fonction du module à toucher le DOM, et le seul endroit à adapter si
 * l'export devait un jour passer par le serveur.
 *
 * L'application tourne dans un iframe tiers Softr : le téléchargement suppose
 * que l'iframe autorise `allow-downloads`. Si ce n'est pas le cas le navigateur
 * bloque silencieusement, sans exception à intercepter — l'appelant ne peut
 * donc pas distinguer ce cas d'un succès, et c'est pourquoi l'interface
 * annonce le nombre de lignes exportées : voir le compte confirme au moins que
 * le fichier a été produit.
 */
export function downloadCsv(filename: string, csv: string): boolean {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    // Révocation différée : Safari annule un téléchargement encore en vol si
    // l'URL disparaît dans la même tâche que le clic.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
