/**
 * Traduction du code couleur en classes et en icônes.
 *
 * Le code couleur lui-même — quel statut porte quel ton — est défini dans
 * `schema.ts` (`STATUS_TONE`). Ce fichier ne fait que le rendre. Pour changer
 * une couleur, un seul endroit à toucher ; le changement se répercute sur les
 * badges, les tuiles de statistiques et les filtres, sans exception possible.
 *
 * Chaque ton porte une **icône distincte** : la charte SunLib interdit que le
 * sens repose sur la couleur seule.
 *
 * | Ton         | Couleur      | Icône             |
 * |-------------|--------------|-------------------|
 * | `fresh`     | vert         | boîte de réception |
 * | `action`    | ambre clair  | horloge           |
 * | `followup`  | ambre foncé  | flèche de reprise |
 * | `qualified` | bleu         | coche             |
 * | `signed`    | violet       | paraphe           |
 * | `rejected`  | rouge        | triangle d'alerte |
 * | `neutral`   | gris         | cercle            |
 */
import {
  AlertTriangle,
  Check,
  Circle,
  Clock,
  FileSignature,
  Inbox,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Tone } from './schema';

/** Pastille complète : fond, texte et bordure. */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted border-line',
  fresh: 'bg-brand-soft text-[color:var(--green)] border-brand-soft',
  action: 'bg-amber-soft-bg text-amber-soft border-amber-soft-border',
  followup: 'bg-amber-bg text-amber border-amber-border',
  qualified: 'bg-info-bg text-info border-info-border',
  signed: 'bg-violet-bg text-violet border-violet-border',
  rejected: 'bg-danger-bg text-danger border-danger-border',
};

/**
 * Même pastille en style en ligne, pour les menus du Kit CRM 3 (`ListeChoix`)
 * dont le bouton est habillé en `style`.
 */
export const TONE_STYLE: Record<Tone, CSSProperties> = {
  neutral: { backgroundColor: 'var(--bg)', color: 'var(--muted)', borderColor: 'var(--line)' },
  fresh: { backgroundColor: 'var(--green-soft)', color: 'var(--green)', borderColor: 'var(--green-soft)' },
  action: { backgroundColor: 'var(--amber-soft-bg)', color: 'var(--amber-soft)', borderColor: 'var(--amber-soft-border)' },
  followup: { backgroundColor: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-border)' },
  qualified: { backgroundColor: 'var(--info-bg)', color: 'var(--info)', borderColor: 'var(--info-border)' },
  signed: { backgroundColor: 'var(--violet-bg)', color: 'var(--violet)', borderColor: 'var(--violet-border)' },
  rejected: { backgroundColor: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red-border)' },
};

/** Fond et texte seuls, sans bordure — pour les pastilles d'icône. */
export const TONE_ACCENT: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted',
  fresh: 'bg-brand-soft text-[color:var(--green)]',
  action: 'bg-amber-soft-bg text-amber-soft',
  followup: 'bg-amber-bg text-amber',
  qualified: 'bg-info-bg text-info',
  signed: 'bg-violet-bg text-violet',
  rejected: 'bg-danger-bg text-danger',
};

/**
 * Couleur pleine du ton, pour un aplat : liseré de ligne, barre de graphique.
 *
 * Distincte de `TONE_CLASS`, qui produit une pastille (fond clair, texte
 * foncé). Ici on veut la teinte elle-même, en valeur CSS et non en classe,
 * parce qu'elle sert dans des styles calculés — largeur de barre, ombre
 * interne d'une ligne.
 */
export const TONE_FILL: Record<Tone, string> = {
  neutral: 'var(--muted)',
  fresh: 'var(--green)',
  action: 'var(--amber-soft)',
  followup: 'var(--amber)',
  qualified: 'var(--info)',
  signed: 'var(--violet)',
  rejected: 'var(--red)',
};

export const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: Circle,
  fresh: Inbox,
  action: Clock,
  followup: RotateCcw,
  qualified: Check,
  signed: FileSignature,
  rejected: AlertTriangle,
};

/* ---------------------------------------------------------- statuts libres */

/**
 * Pastille d'un statut à couleur libre.
 *
 * Depuis que les admins choisissent n'importe quelle couleur, la pastille ne
 * peut plus venir d'une classe écrite d'avance. Elle est **dérivée** de la
 * couleur, par mélange avec la surface et l'encre de la page : fond très
 * clair, bordure intermédiaire, texte tiré vers l'encre. Comme `--surface` et
 * `--ink` s'inversent en mode sombre, la même couleur reste lisible des deux
 * côtés sans seconde valeur à saisir.
 */
export function statusChipStyle(color: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 14%, var(--surface))`,
    borderColor: `color-mix(in srgb, ${color} 40%, var(--surface))`,
    color: `color-mix(in srgb, ${color} 72%, var(--ink))`,
  };
}

/** Pastille d'icône d'une tuile de statut : fond et texte, sans bordure. */
export function statusAccentStyle(color: string): CSSProperties {
  const { backgroundColor, color: text } = statusChipStyle(color);
  return { backgroundColor, color: text };
}
