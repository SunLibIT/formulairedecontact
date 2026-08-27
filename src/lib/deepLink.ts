/**
 * Liens profonds — ouvrir l'application sur une demande précise.
 *
 * Le mail d'assignation envoyé par Airtable porte un lien de la forme
 * `…/?lead=recXXXXXXXXXXXXXX&assignee=me&email=prenom@sunlib.fr`. Le
 * destinataire arrive alors directement sur la fiche concernée, la liste
 * derrière étant filtrée sur ses propres demandes.
 *
 * Deux paramètres seulement :
 *
 *  - `lead` — l'identifiant d'enregistrement Airtable, celui que
 *    `RECORD_ID()` produit dans une formule. Il ne dit **pas** de quelle
 *    table il vient : on le cherche dans les deux, qui sont chargées
 *    d'emblée. Un lien n'a donc pas à connaître l'organisation interne.
 *  - `assignee` — `me`, résolu à partir de l'`email` déjà transmis par le
 *    lien (l'automatisation Airtable connaît l'adresse de l'assigné, pas son
 *    identifiant RH), ou directement un identifiant RH.
 *
 * Tout est calculé ici, en fonction pure : `App` applique un plan, il ne le
 * décide pas. C'est aussi ce qui rend ces règles testables sans DOM.
 */
import type { Lead, LeadSource } from './records';

export interface DeepLink {
  /** Enregistrement à ouvrir, ou chaîne vide. */
  lead: string;
  /** Filtre d'assignation demandé : identifiant RH, `me`, ou chaîne vide. */
  assignee: string;
}

export const NO_LINK: DeepLink = { lead: '', assignee: '' };

/**
 * Un identifiant d'enregistrement Airtable.
 *
 * Filtrer sur cette forme n'est pas une mesure de sécurité — le paramètre ne
 * sert qu'à des comparaisons de chaînes — mais évite qu'une URL tronquée par
 * un client mail se traduise par un état incompréhensible plutôt que par un
 * message clair.
 */
const RECORD_ID = /^rec[A-Za-z0-9]{10,20}$/;

export function parseDeepLink(search: string): DeepLink {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return NO_LINK;
  }
  const lead = params.get('lead')?.trim() ?? '';
  const assignee = params.get('assignee')?.trim() ?? '';
  return {
    lead: RECORD_ID.test(lead) ? lead : '',
    assignee: assignee === 'me' || RECORD_ID.test(assignee) ? assignee : '',
  };
}

/** État à appliquer une fois les deux tables chargées. */
export interface DeepLinkPlan {
  /** Demande à ouvrir dans la modale, si le lien en désigne une. */
  open: Lead | null;
  /** Onglet à sélectionner, ou `null` pour ne pas y toucher. */
  tab: LeadSource | null;
  /** Identifiant RH à poser en filtre, table par table. */
  assignee: Record<LeadSource, string>;
  /** Le lien désigne une demande absente des deux tables. */
  missing: boolean;
}

const NO_PLAN: DeepLinkPlan = {
  open: null,
  tab: null,
  assignee: { contact: '', solar: '' },
  missing: false,
};

/** Vrai si au moins une demande de la table est assignée à cet identifiant. */
function hasWorkFor(leads: Lead[], staffId: string): boolean {
  return leads.some((l) => l.assigneeIds.includes(staffId));
}

/**
 * Traduit un lien en état d'écran.
 *
 * Ne doit être appelée qu'une fois les deux tables chargées : sur une liste
 * encore vide, tout enregistrement paraît introuvable.
 */
export function planDeepLink(input: {
  link: DeepLink;
  /** Identifiant RH du visiteur, résolu depuis `?email=`. */
  viewerStaffId: string | null;
  contact: Lead[];
  solar: Lead[];
}): DeepLinkPlan {
  const { link, viewerStaffId, contact, solar } = input;
  if (!link.lead && !link.assignee) return NO_PLAN;

  const open = link.lead
    ? (contact.find((l) => l.id === link.lead) ??
      solar.find((l) => l.id === link.lead) ??
      null)
    : null;

  const staffId = link.assignee === 'me' ? (viewerStaffId ?? '') : link.assignee;

  // Le filtre n'est posé que là où il donne des résultats. Sans cette
  // réserve, un collaborateur sans demande dans une table verrait « Aucun
  // résultat » sous un sélecteur affichant « Tous » : le sélecteur ne
  // connaît que les assignés présents dans la table, donc un filtre actif
  // sur quelqu'un d'absent serait invisible.
  const assignee = {
    contact: staffId && hasWorkFor(contact, staffId) ? staffId : '',
    solar: staffId && hasWorkFor(solar, staffId) ? staffId : '',
  };

  // L'onglet suit la demande ouverte. À défaut, il suit le filtre : arriver
  // sur une liste vide alors que l'autre onglet porte tout le travail de la
  // personne serait un faux négatif.
  const tab: LeadSource | null = open
    ? open.source
    : assignee.solar && !assignee.contact
      ? 'solar'
      : null;

  return { open, tab, assignee, missing: Boolean(link.lead) && !open };
}
