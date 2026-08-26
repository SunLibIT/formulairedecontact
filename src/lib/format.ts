/**
 * Formatage d'affichage.
 *
 * Ces fonctions ne touchent **jamais** la donnée stockée : Airtable conserve
 * ce que le demandeur a saisi, on n'embellit qu'au rendu. Écrire une casse
 * « corrigée » en base détruirait une information qu'on ne sait pas
 * reconstituer — un nom réellement tout en capitales, par exemple.
 */

/* ------------------------------------------------------------ téléphone */

/**
 * Met un numéro en groupes de deux chiffres.
 *
 * Français : `+33612345678` et `0612345678` donnent tous deux
 * `06 12 34 56 78`. Le `+33` est ramené à la forme nationale, qui est celle
 * qu'un commercial lit et compose.
 *
 * International : l'indicatif reste préfixé et le reste est groupé par deux —
 * `+34123456789` donne `+34 12 34 56 78 9`. Faute de connaître le plan de
 * numérotation de chaque pays, on n'invente pas de découpage savant.
 *
 * Toute entrée non exploitable est renvoyée telle quelle : mieux vaut un
 * numéro brut lisible qu'un numéro mutilé.
 */
export function formatPhone(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';

  // On ne garde que les chiffres, en mémorisant la présence d'un indicatif.
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  const pairs = (s: string) => s.replace(/(\d{2})(?=\d)/g, '$1 ');

  // Forme française, avec ou sans indicatif.
  if (/^(\+|00)?33\d{9}$/.test(trimmed.replace(/[\s.\-']/g, ''))) {
    const national = `0${digits.slice(digits.length - 9)}`;
    return pairs(national);
  }
  if (/^0\d{9}$/.test(digits)) return pairs(digits);

  // Autre pays : indicatif conservé, national groupé par deux.
  if (trimmed.startsWith('+')) {
    const country = digits.slice(0, 2);
    const rest = digits.slice(2);
    return rest ? `+${country} ${pairs(rest)}` : `+${country}`;
  }

  return pairs(digits);
}

/* ------------------------------------------------------------------- nom */

/** Particules qui restent en minuscules au milieu d'un nom. */
const PARTICLES = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'da', 'di', 'do', 'dos', 'van',
  'von', 'der', 'den', 'ter', 'el', 'al', 'et', 'y',
]);

/** Met une capitale après chaque séparateur interne (tiret, apostrophe). */
function capitaliseSegment(segment: string): string {
  return segment
    .split(/([-'’])/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.charAt(0).toLocaleUpperCase('fr') + part.slice(1).toLocaleLowerCase('fr'),
    )
    .join('');
}

/**
 * Uniformise la casse d'un **nom de personne** pour l'affichage.
 *
 * La base contient aussi bien `Thibaut BONNET` que `rania kamal` : sans
 * normalisation, la grille de cartes donne l'impression que la moitié des
 * lignes crie. On produit une casse de titre, en préservant les tirets
 * (`Jean-Claude`), les apostrophes (`D'Angelo`) et les particules
 * (`Charles de Gaulle`).
 *
 * Réservé aux noms de personnes, volontairement. On ne peut pas distinguer un
 * sigle d'un patronyme court par la forme — `BAUR` et `SARL` ont la même
 * allure — et toute heuristique se trompe dans un sens ou dans l'autre. Un
 * nom de personne, lui, va toujours en casse de titre. Les raisons sociales
 * ne passent donc pas par ici : elles regorgent d'acronymes légitimes (EDF,
 * SARL, ZEST) et sont affichées telles que saisies.
 */
export function formatPersonName(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const words = trimmed.split(' ');
  return words
    .map((word, i) => {
      // Particule interne : minuscule, jamais en tête ni en fin.
      if (i > 0 && i < words.length - 1 && PARTICLES.has(word.toLocaleLowerCase('fr'))) {
        return word.toLocaleLowerCase('fr');
      }
      return capitaliseSegment(word);
    })
    .join(' ');
}

/* ----------------------------------------------------------- ancienneté */

const DAY_MS = 86_400_000;

/**
 * Seuils d'ancienneté, en jours.
 *
 * Attention au sens : on mesure ici un **temps écoulé** depuis la demande,
 * pas un délai restant avant échéance. La charte SunLib décrit des seuils
 * pour le second cas (vert quand il reste du temps) ; ici c'est l'inverse,
 * plus c'est vieux, plus c'est grave.
 */
export interface AgeThresholds {
  /** À partir de ce nombre de jours, l'ancienneté passe en ambre. */
  warn: number;
  /** À partir de ce nombre de jours, elle passe en rouge. */
  alert: number;
}

export const DEFAULT_AGE_THRESHOLDS: AgeThresholds = { warn: 3, alert: 7 };

/** Jours entiers écoulés depuis la date. `null` si la date est illisible. */
export function ageInDays(iso: string, now: number = Date.now()): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** Libellé court : `auj.`, `1 j`, `12 j`, `3 mois`, `2 ans`. */
export function formatAge(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'auj.';
  if (days < 31) return `${days} j`;
  if (days < 365) return `${Math.round(days / 30)} mois`;
  const years = Math.round(days / 365);
  return `${years} an${years > 1 ? 's' : ''}`;
}

/** Ton associé à une ancienneté, selon les seuils fournis. */
export function ageTone(
  days: number | null,
  thresholds: AgeThresholds = DEFAULT_AGE_THRESHOLDS,
): 'neutral' | 'action' | 'rejected' {
  if (days == null) return 'neutral';
  if (days >= thresholds.alert) return 'rejected';
  if (days >= thresholds.warn) return 'action';
  return 'neutral';
}
