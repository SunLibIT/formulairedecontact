/**
 * Règles partagées par la vue cartes et la vue liste.
 *
 * Tout ce qui décide d'un **comportement** vit ici, en fonctions pures : quelle
 * action proposer selon l'état du dossier, quelle couleur porte le liseré de
 * priorité, quel libellé court pour un type de demandeur. Les deux vues ne font
 * que rendre le résultat.
 *
 * C'est la contrainte d'architecture : si une règle doit changer, il n'y a
 * qu'un fichier à toucher. Seul le balisage diffère entre les vues — un
 * `<article>` en grille et une ligne virtualisée n'ont pas la même structure —
 * et c'est de la présentation, pas de la logique.
 */
import type { Lead } from './records';
import type { Status } from './schema';

export interface QuickAction {
  label: string;
  /** Libellé long pour un lecteur d'écran, où le contexte de ligne manque. */
  description: string;
  /** Champs à écrire côté Airtable. */
  patch: { status?: Status; assigneeId?: string | null };
}

/**
 * Action unique proposée sur une demande, choisie par l'état réel du dossier.
 *
 * On ne propose jamais une action qui n'a pas de sens : « Marquer contacté »
 * sur un dossier déjà qualifié serait une régression déguisée en raccourci.
 * `null` signifie qu'il n'y a rien d'évident à faire d'un clic — le dossier a
 * avancé, la suite passe par la fiche.
 */
export function quickActionFor(
  lead: Lead,
  viewerStaffId?: string | null,
): QuickAction | null {
  const unassigned = !lead.assigneeIds.length && !lead.assigneeNames.length;

  if (unassigned && viewerStaffId) {
    return {
      label: "M'assigner",
      description: `M'assigner la demande de ${lead.fullName}`,
      patch: { assigneeId: viewerStaffId },
    };
  }
  if (lead.status === 'Nouveau') {
    return {
      label: 'Marquer contacté',
      description: `Marquer la demande de ${lead.fullName} comme à contacter`,
      patch: { status: 'A contacter' },
    };
  }
  return null;
}

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
