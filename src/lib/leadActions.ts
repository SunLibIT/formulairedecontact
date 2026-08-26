/**
 * Règles partagées par la vue cartes et la vue liste.
 *
 * Tout ce qui décide d'un **comportement** vit ici, en fonctions pures :
 * quelle couleur porte le liseré de priorité, quel libellé court pour un type
 * de demandeur, si une demande est assignée. Les deux vues ne font que rendre
 * le résultat.
 *
 * C'est la contrainte d'architecture : si une règle doit changer, il n'y a
 * qu'un fichier à toucher. Seul le balisage diffère entre les vues — un
 * `<article>` en grille et une ligne virtualisée n'ont pas la même structure —
 * et c'est de la présentation, pas de la logique.
 */
import type { Lead } from './records';

/**
 * Couleur du liseré de priorité, ou `undefined` pour « Basse ».
 *
 * L'absence de liseré est le signal de la priorité basse : si les trois
 * niveaux portaient une couleur, chaque ligne serait bordée et le liseré ne
 * distinguerait plus rien.
 */
export function priorityEdge(lead: Lead): string | undefined {
  if (lead.priority === 'Haute') return 'var(--red)';
  if (lead.priority === 'Moyenne') return 'var(--amber-soft)';
  return undefined;
}

/** Libellés courts des types de demandeur — « Un installateur » scanne mal. */
const CATEGORY_LABEL: Record<string, string> = {
  'Un installateur': 'Installateur',
  'Un particulier': 'Particulier',
  'Une entreprise': 'Entreprise',
  'Une collectivité': 'Collectivité',
  'Abonné SunLib': 'Abonné',
};

export function categoryLabel(lead: Lead): string {
  return CATEGORY_LABEL[lead.category] ?? lead.category ?? '';
}

/** Vrai si personne n'est assigné, par lien ou par texte historique. */
export function isUnassigned(lead: Lead): boolean {
  return !lead.assigneeIds.length && !lead.assigneeNames.length;
}
