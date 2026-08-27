/**
 * Normalisation géographique — code postal et département.
 *
 * Extrait de `marketingExport.ts` parce que trois endroits en ont besoin et
 * qu'ils divergeaient : l'export appliquait ces règles, mais `toSolarLead`
 * dérivait son département par un `postalCode.slice(0, 2)` brut et l'onglet
 * KPI comptait le résultat. Sur les données réelles, cela produisait « 24 »
 * (Dordogne) pour un code postal saisi `2456`, et « 97 » pour toute
 * l'outre-mer confondue.
 *
 * Les fonctions prennent des chaînes et non un `Lead` : c'est ce qui permet à
 * `records.ts` de les appeler pendant la normalisation, avant qu'un `Lead`
 * existe.
 */

/** Cinq chiffres, en restituant le zéro initial mangé par un import Excel. */
export function normalisePostalCode(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  // 1000 → 01000 : un code postal court est toujours un zéro perdu, jamais
  // un code à quatre chiffres — il n'en existe pas en France.
  if (digits.length === 4) return `0${digits}`;
  return digits.slice(0, 5);
}

/**
 * Code de département déduit d'un code postal.
 *
 * Trois chiffres pour l'outre-mer (971…978, 984…988), deux ailleurs. La Corse
 * reste `20` : le code postal ne permet pas de trancher entre 2A et 2B, et
 * inventer l'un des deux serait faux une fois sur deux.
 *
 * Chaîne vide si le code est inexploitable, plutôt qu'un préfixe arbitraire :
 * une valeur absente se voit dans un graphique, une valeur fausse s'y fond.
 */
export function departmentFromPostalCode(raw: string): string {
  const cp = normalisePostalCode(raw);
  if (cp.length < 5) return '';
  return cp.startsWith('97') || cp.startsWith('98') ? cp.slice(0, 3) : cp.slice(0, 2);
}

/**
 * Département d'une adresse : le champ Airtable s'il est renseigné, sinon la
 * déduction depuis le code postal.
 *
 * Le formulaire de contact remplit la colonne `Département` ; le simulateur
 * ne l'a pas, d'où le repli. L'ordre compte : une saisie humaine prime sur
 * une déduction.
 */
export function departmentCodeOf(department: string, postalCode: string): string {
  const stored = (department ?? '').trim();
  return stored || departmentFromPostalCode(postalCode);
}
