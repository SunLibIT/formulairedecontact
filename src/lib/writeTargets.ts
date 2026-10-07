/**
 * Où écrire les champs de suivi, selon la source de la demande.
 *
 * Les deux tables portent les mêmes notions sous des identifiants différents.
 * Cette table de correspondance est partagée par la fiche de détail et par les
 * actions rapides des cartes : sans elle, deux chemins d'écriture finiraient
 * par divergier sur un champ.
 */
import { CONTACT, LEAD, TABLES } from './schema';
import type { Lead, LeadSource } from './records';
import type { StatusDef } from './statuses';

export const WRITE_TARGET: Record<
  LeadSource,
  {
    tableId: string;
    /** Lien vers la table Statuts. L'ancien select n'est plus jamais écrit. */
    statusLink: string;
    priority: string;
    partner: string;
    assignee: string;
    notes: string;
  }
> = {
  contact: {
    tableId: TABLES.contactRequests,
    statusLink: CONTACT.statusLink,
    priority: CONTACT.priority,
    partner: CONTACT.partner,
    assignee: CONTACT.assignee,
    notes: CONTACT.notes,
  },
  solar: {
    tableId: TABLES.solarLeads,
    statusLink: LEAD.statusLink,
    priority: LEAD.priority,
    partner: LEAD.partner,
    assignee: LEAD.assignee,
    notes: LEAD.notes,
  },
};

/**
 * Écriture d'un statut : le champ Airtable et le correctif local qui va avec.
 *
 * Les deux sortent du même appel pour ne jamais diverger. Le correctif porte
 * `statusLinkId` en plus du statut : c'est lui que `withStatuses` relit quand
 * la table Statuts change, et un correctif sans lui ferait revenir l'ancien
 * statut au premier renommage.
 */
export function statusWrite(source: LeadSource, status: StatusDef) {
  return {
    fields: { [WRITE_TARGET[source].statusLink]: [status.id] },
    local: { status, statusLinkId: status.id } satisfies Partial<Lead>,
  };
}
