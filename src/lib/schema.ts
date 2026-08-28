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
  status: 'fldZjSSAAZVhcVEeH',
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
  status: 'fldE04cmRvQCtJEHY',
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
 * dans aucune base. Ne pas le confondre avec les champs « Département
 * couvert » des tables installateurs, qui décrivent les partenaires poseurs.
 *
 * `code` est un **texte** de deux caractères, zéro initial compris (« 01 »).
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

/**
 * Statuts de suivi commercial.
 *
 * Les libellés sont ceux des options Airtable, à l'accent près — les deux
 * tables partagent exactement le même jeu. C'est cette égalité qui permet
 * de filtrer et de compter les deux onglets avec le même code.
 */
export const STATUSES = [
  'Nouveau',
  'A contacter',
  'Qualifié',
  'Signé',
  'A relancer',
  'Hors Critères',
  'Archivé',
] as const;
export type Status = (typeof STATUSES)[number];

/** Statuts proposés à la saisie. « Archivé » n'existe que sur d'anciens enregistrements. */
export const SELECTABLE_STATUSES: readonly Status[] = STATUSES.filter(
  (s) => s !== 'Archivé',
);

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
 * Défini une seule fois ici : les badges, les tuiles de statistiques et les
 * filtres le lisent tous, donc changer une couleur se fait en une ligne et se
 * répercute dans toute l'application.
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

export const STATUS_TONE: Record<Status, Tone> = {
  Nouveau: 'fresh',
  'A contacter': 'action',
  Qualifié: 'qualified',
  Signé: 'signed',
  'A relancer': 'followup',
  'Hors Critères': 'rejected',
  Archivé: 'neutral',
};

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
