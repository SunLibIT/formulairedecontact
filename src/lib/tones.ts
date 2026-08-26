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
 * | `fresh`     | vert         | étincelle         |
 * | `action`    | ambre clair  | horloge           |
 * | `followup`  | ambre foncé  | flèche de reprise |
 * | `qualified` | bleu         | coche             |
 * | `rejected`  | rouge        | triangle d'alerte |
 * | `neutral`   | gris         | cercle            |
 */
import {
  AlertTriangle,
  Check,
  Circle,
  Clock,
  RotateCcw,
  Sparkle,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from './schema';

/** Pastille complète : fond, texte et bordure. */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted border-line',
  fresh: 'bg-brand-soft text-[color:var(--green)] border-brand-soft',
  action: 'bg-amber-soft-bg text-amber-soft border-amber-soft-border',
  followup: 'bg-amber-bg text-amber border-amber-border',
  qualified: 'bg-info-bg text-info border-info-border',
  rejected: 'bg-danger-bg text-danger border-danger-border',
};

/** Fond et texte seuls, sans bordure — pour les pastilles d'icône. */
export const TONE_ACCENT: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted',
  fresh: 'bg-brand-soft text-[color:var(--green)]',
  action: 'bg-amber-soft-bg text-amber-soft',
  followup: 'bg-amber-bg text-amber',
  qualified: 'bg-info-bg text-info',
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
  rejected: 'var(--red)',
};

export const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: Circle,
  fresh: Sparkle,
  action: Clock,
  followup: RotateCcw,
  qualified: Check,
  rejected: AlertTriangle,
};
