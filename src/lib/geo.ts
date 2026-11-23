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

/**
 * Vrai pour une adresse hors de France (pays renseigné et différent de la
 * France). Pays vide : France, c'est le cas de la quasi-totalité des demandes
 * et du simulateur, qui n'a pas de colonne Pays. L'outre-mer est français.
 */
export function isForeignCountry(country: string): boolean {
  const c = (country ?? '')
    .normalize('NFD')
    // Diacritiques retir\u00e9s sans \u00e9chappement Unicode : la livraison Softr les d\u00e9code.
    .replace(new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g'), '')
    .trim()
    .toLowerCase();
  if (!c) return false;
  return !/^(france|fr|fra|france metropolitaine|guadeloupe|martinique|guyane|la reunion|reunion|mayotte)$/.test(c);
}

/**
 * Code postal à afficher. En France, la forme normalisée (zéro initial
 * restitué) ; à l'étranger, la saisie telle quelle — « 3438 MW » (Pays-Bas)
 * devenait « 03438 » et se lisait comme un code de l'Allier.
 */
export function displayPostalCode(raw: string, country: string): string {
  return isForeignCountry(country) ? (raw ?? '').trim() : normalisePostalCode(raw);
}

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
