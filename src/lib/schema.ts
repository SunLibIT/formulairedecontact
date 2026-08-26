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
 * Ton visuel de chaque statut, selon l'échelle de la charte :
 * neutre = gris, action requise = ambre, positif = teal/vert, problème = rouge.
 */
export const STATUS_TONE: Record<Status, 'neutral' | 'pending' | 'positive' | 'negative'> = {
  Nouveau: 'neutral',
  'A contacter': 'pending',
  Qualifié: 'positive',
  'A relancer': 'pending',
  'Hors Critères': 'negative',
  Archivé: 'neutral',
};

export const PRIORITY_TONE: Record<Priority, 'neutral' | 'pending' | 'negative'> = {
  Basse: 'neutral',
  Moyenne: 'pending',
  Haute: 'negative',
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
