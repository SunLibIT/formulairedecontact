/**
 * Correspondance entre les questions Typeform et les champs Airtable.
 *
 * Ces UUID sont **irremplaçables** : ils relient chaque question des deux
 * formulaires à un champ métier. Ils étaient enfermés dans une Edge Function
 * Supabase (`sync-typeform-unified`), sur une base aujourd'hui supprimée ;
 * ils sont ici pour être réutilisés par le webhook.
 *
 * Pourquoi plusieurs refs par champ : les formulaires ont de la logique
 * conditionnelle. Selon que le visiteur se déclare Particulier, Entreprise,
 * Installateur ou Collectivité, ce n'est pas la même question qui demande son
 * email. `findAnswer` essaie les refs dans l'ordre et retient la première
 * renseignée.
 *
 * ⚠️ Modifier une question dans Typeform change sa ref. Le champ arrive alors
 * vide, sans erreur. Toute retouche du formulaire impose de vérifier ce
 * fichier.
 */

export const TYPEFORM_FORMS = {
  /** Ancien formulaire, données historiques. */
  V0: 'MtEfRiYk',
  /** Formulaire de production. */
  MAR26: 'gbPj3B1m',
} as const;

export type FormId = (typeof TYPEFORM_FORMS)[keyof typeof TYPEFORM_FORMS];

export const FIELD_REFS = {
  requesterType: ['444b183b-c91d-4fbd-b31d-b00c3839392a'],
  firstName: [
    '976acafa-220b-444d-b598-92ab2d62ab56', // V0 + Mar26 Installateur/Collectivité
    'a4e2c067-f9cb-41b5-88df-a84f8c070ea2', // Mar26 Particulier/Entreprise
  ],
  lastName: [
    '84367289-8128-48ef-916e-6a4f9bdcbabb',
    'ccc6b4b2-8817-4ba9-8ad0-b1fd811c1fd5',
  ],
  phone: [
    'accebdb7-b799-4662-bd66-191f06910b78',
    '58b6bb79-8091-4f50-beaf-e33b7acd36ee',
  ],
  email: [
    'd195deac-b331-4532-95cb-60885a5ffe02',
    '17fa8b3e-26db-43fe-9c1c-1111271aa5ac',
  ],
  company: [
    '706b2940-2868-49e5-8e46-8de8d2885c0a', // V0
    'e92edf6d-d6d3-43af-98b0-d32924551df2', // Mar26 Installateur/Collectivité
    '4a22903e-28da-488a-b6cb-e20cc32201cc', // Mar26 Particulier/Entreprise
  ],
  address: [
    '40cb8991-6622-4755-a410-10df28f27570', // V0 + Mar26 Installateur/Collectivité
    '72b17bf0-dd27-4687-8c8c-90c1d4968c6d', // Mar26 Particulier
    'ea6f2535-dae5-449f-a85e-d55828aa090b', // Mar26 Entreprise
  ],
  addressLine2: [
    '3e4f9811-d51a-4767-96e4-1ecd17944a22',
    '5b1dfdc6-4d1d-4088-baa2-e3ca6ca01a4e',
    'cdb096d6-3992-41b8-8388-93a8af5bb7ca',
  ],
  city: [
    '9949e625-2a58-4db9-9b63-53af19fdbde6',
    '88b55916-bb8a-4e23-960b-6abfdb10f77a',
    '22030fd0-7e59-4926-9141-4e7524463ebe',
  ],
  region: [
    '9c154787-a439-4401-bdf4-a45db97b91a7',
    'f1dafcd5-d15e-4726-9cbe-056f543a93de',
    '121ac9b6-9f4f-488b-9f92-c86e0c7837eb',
  ],
  postalCode: [
    '4e2fbe67-b13a-4d97-8788-98fab85601bd',
    'aa646bc4-f2a9-4a86-a6ec-c8bd3e920028',
    'e356d587-e3dc-422f-96f9-5707032574cf',
  ],
  country: [
    'e11fd014-2917-409c-8097-4918e4e69fa6',
    'e56a5811-b878-4c93-8890-8b89fa182696',
    '31113aca-78e8-44a1-a50e-5bfe82e1118d',
  ],
  motive: [
    '480b9fd7-ce9f-423e-adf6-c5df7d91c71a', // Mar26 Installateur/Collectivité
    'c4b5cd43-5274-4195-83cc-d1a004b347c9', // Mar26 Particulier/Entreprise
  ],
  message: [
    '1149f77c-068b-4471-9aa8-6cb1fc994685',
    'a44d760d-3ec4-4dd0-802b-93b196a4bc6d',
  ],
  /**
   * Case de consentement RGPD : « j'accepte que SunLib utilise mes
   * coordonnées pour traiter ma demande ». Absente de l'ancienne
   * synchronisation Supabase, donc vide sur les enregistrements repris.
   */
  gdprConsent: ['0253fc54-c09a-4e71-a48e-17839c66a1fb'],
} as const;

export interface TypeformAnswer {
  field: { id: string; ref: string; type: string };
  type: string;
  text?: string;
  email?: string;
  phone_number?: string;
  number?: number;
  boolean?: boolean;
  choice?: { label: string; ref?: string };
  choices?: { labels?: string[] };
}

/**
 * Variable calculée par le formulaire.
 *
 * Typeform transmet ces valeurs **hors des réponses**, dans
 * `form_response.variables` : le score de la logique de qualification, un tag
 * de qualité, et tout un bloc d'enrichissement société renseigné par un
 * service tiers à la soumission (`enr_*`). Rien ne les lisait avant
 * 2026-08-27 ; elles dormaient dans `Raw JSON`.
 *
 * Le champ porteur dépend du `type` : `number` pour un nombre, `text` pour du
 * texte, `outcome_id` pour une issue de formulaire.
 */
export interface TypeformVariable {
  key: string;
  type: string;
  number?: number;
  text?: string;
  outcome_id?: string;
}

/**
 * Clés des variables d'enrichissement société.
 *
 * Nommées ici plutôt qu'écrites en clair dans le webhook, pour la même raison
 * que `FIELD_REFS` : ce sont des identifiants d'un système tiers. Si
 * l'enrichissement est désactivé côté Typeform, elles disparaissent du payload
 * et les champs restent vides — sans erreur, comme pour une ref modifiée.
 */
export const VARIABLE_KEYS = {
  score: 'score',
  leadQuality: 'tag_lead_quality',
  companyName: 'enr_company_name',
  companyDomain: 'enr_company_domain',
  companyIndustry: 'enr_company_industry',
  companyEmployees: 'enr_company_employee_count',
  companyRevenue: 'enr_company_annual_revenue',
  companyLinkedIn: 'enr_company_linkedin_url',
} as const;

/** Valeur texte d'une variable, ou chaîne vide. */
export function variableText(
  variables: readonly TypeformVariable[],
  key: string,
): string {
  const found = variables.find((v) => v.key === key);
  return found?.text?.trim() ?? '';
}

/**
 * Valeur numérique d'une variable, ou `undefined`.
 *
 * Accepte les deux formes, parce que le payload mélange les deux :
 * `enr_company_employee_count` arrive en nombre (`23`) et
 * `enr_company_annual_revenue` en **texte** (`"1000000"`). Rendre `undefined`
 * plutôt que `0` est essentiel : le webhook écrit avec `typecast: false`, et
 * un zéro fabriqué serait indiscernable d'un vrai zéro.
 */
export function variableNumber(
  variables: readonly TypeformVariable[],
  key: string,
): number | undefined {
  const found = variables.find((v) => v.key === key);
  if (!found) return undefined;
  const raw =
    found.number ?? (found.text?.trim() ? Number(found.text.trim()) : undefined);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/**
 * Première valeur renseignée parmi les refs candidates.
 *
 * L'ancienne implémentation retournait la valeur dès qu'une *réponse* existait
 * pour la ref, même vide, ce qui masquait les refs suivantes. Ici, une réponse
 * vide n'interrompt pas la recherche.
 */
export function findAnswer(
  answers: readonly TypeformAnswer[],
  refs: readonly string[],
): string {
  for (const ref of refs) {
    const answer = answers.find((a) => a.field?.ref === ref);
    if (!answer) continue;
    const value =
      answer.choice?.label ??
      answer.choices?.labels?.join(', ') ??
      answer.email ??
      answer.phone_number ??
      answer.text ??
      (answer.number != null ? String(answer.number) : undefined);
    if (value && value.trim()) return value.trim();
  }
  return '';
}

/** Département français depuis le code postal. Chaîne vide si non déductible. */
export function departmentFrom(postalCode: string): string {
  const cleaned = postalCode.replace(/\s/g, '');
  return /^\d{5}$/.test(cleaned) ? cleaned.slice(0, 2) : '';
}

/**
 * Priorité par défaut, déduite du type de demandeur.
 *
 * À savoir : cette règle produit « Haute » pour tous les installateurs, qui
 * représentent plus de la moitié du volume — d'où 238 leads « Haute » sur 438
 * dans les données reprises. La priorité ne discrimine donc presque rien en
 * pratique ; c'est une règle à revoir côté métier, pas un bug.
 */
export function defaultPriority(requesterType: string): 'Basse' | 'Moyenne' | 'Haute' {
  const t = requesterType.toLowerCase();
  if (t.includes('installateur') || t.includes('collectivité')) return 'Haute';
  if (t.includes('entreprise')) return 'Moyenne';
  if (t.includes('particulier')) return 'Basse';
  return 'Moyenne';
}

/**
 * Aligne le pays sur la forme utilisée par les données reprises.
 *
 * Typeform renvoie `FR`, les 438 enregistrements historiques portent
 * `France`. Sans cette normalisation, un filtre par pays produirait deux
 * groupes distincts pour le même pays.
 */
export function normaliseCountry(raw: string): string {
  const c = raw.trim();
  return ['FR', 'FRA', 'FRANCE'].includes(c.toUpperCase()) ? 'France' : c;
}

/** Normalise un téléphone en E.164 pour la France. */
export function normalisePhone(raw: string): string {
  const p = raw.replace(/[\s.\-']/g, '');
  if (!p) return '';
  if (p.startsWith('+')) return p;
  if (p.startsWith('33') && p.length >= 11) return `+${p}`;
  if (p.startsWith('0') && p.length === 10) return `+33${p.slice(1)}`;
  return p;
}
