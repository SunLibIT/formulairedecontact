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
import type { DuplicateMark } from './duplicates';
import type { Lead } from './records';
import { PRIORITY_TONE } from './schema';
import { TONE_FILL } from './tones';

/**
 * Couleur du liseré de priorité. **Toujours définie**, pour les trois niveaux.
 *
 * La version précédente ne renvoyait rien pour « Basse », en faisant de
 * l'absence de liseré le signal du niveau bas. C'était une erreur : une
 * absence est ambiguë, on ne distingue pas « priorité basse » de « donnée
 * manquante », et une ligne sur deux paraissait simplement inachevée. Un
 * signal doit être présent pour être lu.
 *
 * La teinte est dérivée de `PRIORITY_TONE`, donc elle ne peut pas divergier de
 * la pastille de priorité affichée à côté.
 */
export function priorityEdge(lead: Lead): string {
  return TONE_FILL[PRIORITY_TONE[lead.priority] ?? 'neutral'];
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

/**
 * Mention à porter sur une demande répétée.
 *
 * Le compte est le même sur toutes les lignes du groupe — c'est lui qui alerte
 * — et seule la plus récente est distinguée, parce que c'est celle qu'on garde
 * en général. On ne numérote pas les autres : leur rang n'aide pas à décider,
 * la date affichée à côté le fait mieux.
 *
 * Le libellé complet passe en `title` plutôt que dans la pastille : il porte
 * l'adresse, qui est longue, et n'a pas à pousser le reste de la ligne.
 */
export interface DuplicateNote {
  label: string;
  /** Vrai pour la demande la plus récente de l'adresse. */
  latest: boolean;
  title: string;
}

export function duplicateNote(mark: DuplicateMark): DuplicateNote {
  const total = `${mark.count} demandes de ${mark.email}`;
  return {
    label: `${mark.count} demandes`,
    latest: mark.rank === 1,
    title: mark.rank === 1 ? `La plus récente des ${total}` : `Une des ${total}`,
  };
}

/** Vrai si personne n'est assigné, par lien ou par texte historique. */
export function isUnassigned(lead: Lead): boolean {
  return !lead.assigneeIds.length && !lead.assigneeNames.length;
}
