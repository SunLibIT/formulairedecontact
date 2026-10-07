/**
 * Source unique de vérité du schéma Airtable.
 *
 * Toutes les lectures et écritures passent par les **identifiants** de champ
 * (`fld…`), jamais par leurs noms : un renommage dans Airtable ne casse plus
 * l'application. Les requêtes utilisent `returnFieldsByFieldId=true` pour que
 * les réponses soient elles aussi indexées par identifiant.
 *
 * Si un champ ou une option change dans Airtable, ce fichier est le seul à
 * modifier.
 */

export const BASE_ID = 'appYjCP9BUY8Zj5Ni'; // Simulateur Solaire

export const TABLES = {
  /** Demandes du formulaire de contact Typeform — source unique depuis l'abandon de Supabase. */
  contactRequests: 'tblcgBrFfVCBrczdl',
  /** Leads issus du simulateur solaire — tunnel d'acquisition distinct. */
  solarLeads: 'tblg8uig0z4oPUC1x',
  /** Collaborateurs SunLib, cible des champs « Assigné à ». */
  staff: 'tblySHLLDvHjk2ktK',
  /** Sectorisation commerciale : un département, le commercial qui le couvre. */
  territories: 'tblw11IuaIggSkNu5',
  /** Statuts de suivi commercial, gérés depuis l'app par les admins. Voir `lib/statuses.ts`. */
  statuses: 'tblipMIYgKRdFOI3y',
} as const;

/** Champs de la table « Demandes de contact ». */
export const CONTACT = {
  responseId: 'fld2EHfUcopGI4FzO',
  formId: 'fldV3UrrOh3BgL6OW',
  submittedAt: 'fldTeBIok4t5SzchH',
  lastName: 'fldJsJt1mbsDzllwp',
  firstName: 'fldi2fllcOjhkdnez',
  email: 'fldrwQjAaZVAqgqrH',
  phone: 'fld7719at95masMxZ',
  company: 'fldbvUdmsqD5fQKwX',
  requesterType: 'fld02pk6STDA7s6Vx',
  motive: 'fldW2YL0mDOt9we64',
  message: 'fld5XFRNvY4ujHWVc',
  address: 'fldhcCA8eAcwBcpDT',
  addressLine2: 'fld9mIzjniYLw7SQn',
  city: 'fldRJCOMCIJt32nGT',
  postalCode: 'fldbzJLzPQEqM2q6t',
  department: 'fldO9LPuTO0PRIPt6',
  region: 'fldZSqh21vXrfsBq4',
  country: 'fldGhnX2PkchpW76f',
  /** Lien vers la table Statuts — le statut de la demande. */
  statusLink: 'fldJ1o4Y2cIb9qq9o',
  /**
   * Ancien single select « Statut », en **lecture seule**. Relu en repli tant
   * qu'une demande n'a pas de lien ; plus jamais écrit.
   */
  statusLegacy: 'fldZjSSAAZVhcVEeH',
  priority: 'fldiFRpsqZWu50Puz',
  partner: 'fldckAwd6C9Fi6Cdm',
  assignee: 'fldzJnDK7zuZ8eExl',
  notes: 'fldQFmXnHOw4Mk3N1',
  rawJson: 'fld5f69tU2LDEx8Ni',
  /** Consentement coché dans le formulaire. Vide sur les reprises historiques. */
  gdprConsent: 'flddNjogfg4QRpqeu',

  /* ----------------------------------- scoring et enrichissement Typeform
   * Écrits par le webhook depuis `calculated` et `variables`, deux blocs que
   * Typeform transmet **à côté** des réponses et que rien ne lisait jusqu'ici.
   * Vides sur les 438 reprises historiques : l'information n'existe pas pour
   * elles, elle n'était pas dans l'export Excel. */
  score: 'fld73gLKvmodz1Ecr',
  leadQuality: 'fldhSF087rixbmQx8',
  companyName: 'fldzzhUYJteYZTkn4',
  companyDomain: 'flddiNLYrRSPEl3v9',
  companyIndustry: 'fldZOFwTHa6qnAPKD',
  companyEmployees: 'fldemUMaP32aJfXY4',
  companyRevenue: 'fldmMv80gHcf3YyVJ',
  companyLinkedIn: 'fldi0d1TK7w89QeSt',
} as const;

/**
 * Noms de champs — à n'utiliser que là où l'API Airtable l'impose.
 *
 * `filterByFormula` est la seule surface qui n'accepte pas les identifiants :
 * une formule référence toujours `{Nom du champ}`. Renommer ce champ dans
 * Airtable casserait donc le filtre, contrairement à tout le reste du code.
 */
export const FIELD_NAMES = {
  contactResponseId: 'Response ID',
  /** Requis par `api/_lib/auth.ts` pour retrouver un collaborateur par email. */
  staffEmail: 'Email',
} as const;

/** Champs de la table « Leads Solaires ». */
export const LEAD = {
  lastName: 'fldnruhlv8yseJ6CV',
  firstName: 'fldE0cyg8Prbjfl7o',
  customerType: 'fldZY1wpZR5PlF9SQ',
  email: 'fldJzTTQkF62cAiGw',
  phone: 'fldbzDT4g20G4aLBq',
  postalCode: 'fldHbxSNpARzjzx4U',
  address: 'fldwkxXCNXUNHbc5a',
  city: 'fld1mt7gtT4dhGwO5',
  contactPreference: 'fldU8guiY9YX3dZiK',
  annualConsumption: 'fldFKzyXQe2ZdNNP3',
  monthlyBill: 'fldvvjiCGcM7XJsF7',
  recommendedPower: 'fld3LX5WHjveMC7fd',
  createdOn: 'fld0a0KT5yytGuyZF',
  /** Lien vers la table Statuts — le statut du lead. */
  statusLink: 'fldnUeIkyfvfsrM72',
  /** Ancien single select « Statut », en lecture seule. Voir `CONTACT.statusLegacy`. */
  statusLegacy: 'fldE04cmRvQCtJEHY',
  priority: 'fldyMVACirNJuXrmP',
  assigneeText: 'fldQoya2KNtmgq3Nx',
  notes: 'fldF946cmgvi0z5U0',
  assignee: 'fldmf8mnMW7VhlVuA',
  partner: 'fldwHw89pEI8SX8Kv',
  gdprConsent: 'fldADSz4AckvWiPCO',
} as const;

/**
 * Champs de la table « Sectorisation commerciale ».
 *
 * Une ligne par département métropolitain — 95 lignes, 8 commerciaux — créée
 * le 27/08/2026 à partir du fichier RH ; ce découpage n'existait auparavant
 * dans aucune base. Depuis septembre 2026, une ligne peut aussi porter un code
 * postal sur cinq chiffres, qui prime sur son département : c'est ainsi que le
 * 69 se découpe entre commerciaux sans renoncer au rattachement départemental. Ne pas le confondre avec les champs « Département
 * couvert » des tables installateurs, qui décrivent les partenaires poseurs.
 *
 * `code` est un **texte** : deux caractères, zéro initial compris (« 01 »),
 * ou cinq chiffres pour un code postal (« 69003 »).
 * Jamais un nombre : un node Airtable n8n en mise à jour pré-remplit les
 * champs numériques à 0 et écraserait les codes. La Corse y vaut « 20 » et non
 * 2A/2B, pour coller au champ « Département » des demandes, qui n'est que les
 * deux premiers chiffres du code postal.
 *
 * `salesRep` est un champ de liaison vers RH : l'email du commercial se lit en
 * lookup, il n'est jamais recopié en texte.
 */
export const TERRITORY = {
  code: 'flds31Paku304s0Z6',
  name: 'fldpSQXxlL1pLyc53',
  region: 'fldfuhMEJgXxLujHJ',
  salesRep: 'fldUItpTihZaVfdto',
  active: 'fld9l52OdNgb85eQ0',
} as const;

/**
 * Régions de la table « Sectorisation commerciale », à l'accent près.
 *
 * Les écritures se font avec `typecast: false` : un libellé qui ne correspond
 * pas exactement à une option existante fait échouer la requête au lieu de
 * créer une option de plus. C'est voulu — c'est ainsi que la table héritée
 * s'était retrouvée avec ~170 options `Statut` parasites, horodatages compris.
 *
 * Métropole seule : les DOM ne sont pas sectorisés, et un code postal 971…978
 * ne se rapproche d'aucune ligne.
 */
export const REGIONS = [
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Corse',
  'Grand Est',
  'Hauts-de-France',
  'Île-de-France',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  // Apostrophe DROITE (U+0027), telle qu'elle est dans Airtable. Une
  // apostrophe typographique (’) ferait échouer l'écriture : les libellés sont
  // comparés caractère pour caractère.
  "Provence-Alpes-Côte d'Azur",
] as const;

export type Region = (typeof REGIONS)[number];

/** Champs de la table « RH ». */
export const STAFF = {
  name: 'fldELWYPe8utsKKcV',
  email: 'fldHiVHm25kqusZ08',
  group: 'fldY8wfV9GKnUZgHB',
  inactive: 'fldcYvayoR3Dlthwe',
} as const;

/** Champs de la table « Statuts ». */
export const STATUS = {
  name: 'fldFWdsjqWBE2qQrq',
  tone: 'flduCvbXs319FEamn',
  order: 'fldNrYviRBYPP19BB',
  archived: 'fldX3FzdPGxGBPLlw',
  role: 'fldEPq3PpzWuCRsur',
} as const;

/**
 * Rôle d'un statut : ce que l'application sait de lui, indépendamment de son
 * nom.
 *
 * Les admins renomment les statuts depuis l'app ; les KPI, l'archivage, les
 * tuiles et le webhook Typeform ne peuvent donc plus reconnaître un statut à
 * son libellé. Ils le reconnaissent à son rôle, qui ne change jamais. Un
 * statut créé depuis l'app n'a pas de rôle (`null`) : il s'affiche, se filtre
 * et se compte, mais aucune règle métier ne s'y accroche.
 *
 * Les valeurs sont les options du champ `Rôle`, en ASCII : ce sont des
 * identifiants, jamais affichés.
 */
export const STATUS_ROLES = [
  'nouveau',
  'a_contacter',
  'qualifie',
  'signe',
  'a_relancer',
  'hors_criteres',
  'archive',
] as const;
export type StatusRole = (typeof STATUS_ROLES)[number];

/** Un statut de suivi, tel que lu dans la table Statuts. */
export interface StatusDef {
  /** Identifiant de l'enregistrement Statuts — c'est lui qu'on écrit dans le lien. */
  id: string;
  name: string;
  tone: Tone;
  /** Position dans le pipeline : ordonne les menus et le tri par statut. */
  order: number;
  /** Retiré des menus de saisie, mais toujours affiché sur les leads qui le portent. */
  archived: boolean;
  role: StatusRole | null;
  /**
   * Vrai pour un libellé hérité qui ne correspond à aucun statut connu — une
   * option parasite de l'ancien select. Compté à part par les KPI.
   */
  unknown?: boolean;
}

/**
 * Les sept statuts d'origine, tels que créés dans la table Statuts le
 * 2026-10-07, identifiants compris.
 *
 * Deux usages. **Repli** : si la table ne se charge pas, l'app tourne sur ce
 * jeu au lieu de tomber. **Reprise** : un lead sans lien porte encore un
 * libellé de l'ancien select ; il se rattache à son statut par ce libellé
 * *d'origine* puis par l'identifiant, ce qui survit à un renommage — chercher
 * le libellé dans la table vivante échouerait dès le premier renommage.
 */
export const DEFAULT_STATUSES: readonly StatusDef[] = [
  { id: 'recx6eyiNYcJCctd2', name: 'Nouveau', tone: 'fresh', order: 1, archived: false, role: 'nouveau' },
  { id: 'recLTpAsBorbb5Gp0', name: 'A contacter', tone: 'action', order: 2, archived: false, role: 'a_contacter' },
  { id: 'recfDmm8lMvcPffx2', name: 'Qualifié', tone: 'qualified', order: 3, archived: false, role: 'qualifie' },
  { id: 'recpZ8sPXDL5w8yFZ', name: 'Signé', tone: 'signed', order: 4, archived: false, role: 'signe' },
  { id: 'rech6xrIebR7phhiF', name: 'A relancer', tone: 'followup', order: 5, archived: false, role: 'a_relancer' },
  { id: 'recVPeBFtLQYATCR7', name: 'Hors Critères', tone: 'rejected', order: 6, archived: false, role: 'hors_criteres' },
  { id: 'recWlsoKQyl6Er9Wh', name: 'Archivé', tone: 'neutral', order: 7, archived: false, role: 'archive' },
];

export const PRIORITIES = ['Basse', 'Moyenne', 'Haute'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REQUESTER_TYPES = [
  'Un installateur',
  'Un particulier',
  'Une entreprise',
  'Une collectivité',
  'Abonné SunLib',
] as const;

/**
 * Code couleur du suivi commercial.
 *
 * Le ton de chaque statut vit dans la table Statuts (champ `Ton`) et se change
 * depuis l'app ; les tons eux-mêmes sont définis ici, rendus par
 * `lib/tones.ts`. Le tableau ci-dessous décrit le jeu d'origine.
 *
 * Les noms sont sémantiques et non présentationnels : si la charte évolue, on
 * change la couleur associée à `action` sans avoir à renommer quoi que ce soit.
 *
 * | Ton         | Statuts                    | Couleur        |
 * |-------------|----------------------------|----------------|
 * | `fresh`     | Nouveau                    | vert           |
 * | `action`    | A contacter                | ambre clair    |
 * | `followup`  | A relancer                 | ambre foncé    |
 * | `qualified` | Qualifié                   | bleu           |
 * | `signed`    | Signé                      | violet         |
 * | `rejected`  | Hors Critères              | rouge          |
 * | `neutral`   | Archivé, absence de valeur | gris           |
 *
 * « Signé » ne reprend ni le vert ni le teal, pourtant les couleurs
 * évidentes pour une bonne nouvelle : le vert de marque porte déjà
 * « Nouveau », et le teal est réservé à l'élément actif par la charte. Le
 * violet est la seule teinte qui se distingue des cinq autres statuts sans
 * imiter un état d'interface.
 *
 * « A contacter » et « A relancer » partagent la teinte ambre à deux pas
 * différents, et non deux teintes distinctes : le second est une reprise du
 * premier, donc une **progression**. Une rampe d'une seule teinte fait voir
 * cet ordre dans la couleur, là où deux teintes suggéreraient deux catégories
 * sans rapport. Les deux pas portent en plus une icône différente — horloge
 * puis flèche de reprise — pour que la distinction ne dépende pas de la
 * perception d'une nuance.
 */
export type Tone =
  | 'neutral'
  | 'fresh'
  | 'action'
  | 'followup'
  | 'qualified'
  | 'signed'
  | 'rejected';

/**
 * Les tons proposés au choix d'un admin, dans l'ordre du sélecteur.
 *
 * Une palette **fermée** plutôt qu'une couleur libre : chaque ton a son icône
 * et des valeurs vérifiées en contraste, en clair comme en sombre. Une couleur
 * hexadécimale saisie à la main ne garantirait ni l'un ni l'autre.
 */
export const TONES: ReadonlyArray<{ tone: Tone; label: string }> = [
  { tone: 'fresh', label: 'Vert' },
  { tone: 'action', label: 'Ambre clair' },
  { tone: 'followup', label: 'Ambre foncé' },
  { tone: 'qualified', label: 'Bleu' },
  { tone: 'signed', label: 'Violet' },
  { tone: 'rejected', label: 'Rouge' },
  { tone: 'neutral', label: 'Gris' },
];

/**
 * Couleurs de la priorité, sur une échelle d'urgence croissante :
 * gris → orange → rouge.
 *
 * La charte demande que catégorie et urgence portent des signaux distincts.
 * Ici les deux axes partagent la palette, la distinction passe donc par la
 * **forme** : le statut est une pastille bordée, la priorité une puce sans
 * bordure, plus petite, préfixée d'un glyphe de niveau (▼ ■ ▲). Deux
 * vocabulaires visuels pour deux informations différentes.
 */
export const PRIORITY_TONE: Record<Priority, Tone> = {
  Basse: 'neutral',
  Moyenne: 'action',
  Haute: 'rejected',
};

/**
 * Icône Lucide par type de demandeur.
 * Noms canoniques repris du référentiel SunLib pour que l'association reste
 * la même que dans `dashboard-KPI` et `abo-detail-inpage`.
 */
export const REQUESTER_ICON: Record<string, 'hard-hat' | 'user' | 'building-2' | 'landmark' | 'sun'> = {
  'Un installateur': 'hard-hat',
  'Un particulier': 'user',
  'Une entreprise': 'building-2',
  'Une collectivité': 'landmark',
  'Abonné SunLib': 'sun',
};
