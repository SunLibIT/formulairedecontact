/**
 * Où écrire les champs de suivi, selon la source de la demande.
 *
 * Les deux tables portent les mêmes notions sous des identifiants différents.
 * Cette table de correspondance est partagée par la fiche de détail et par les
 * actions rapides des cartes : sans elle, deux chemins d'écriture finiraient
 * par divergier sur un champ.
 */
import { CONTACT, LEAD, TABLES } from './schema';
import type { LeadSource } from './records';

export const WRITE_TARGET: Record<
  LeadSource,
  {
    tableId: string;
    status: string;
    priority: string;
    partner: string;
    assignee: string;
    notes: string;
  }
> = {
  contact: {
    tableId: TABLES.contactRequests,
    status: CONTACT.status,
    priority: CONTACT.priority,
    partner: CONTACT.partner,
    assignee: CONTACT.assignee,
    notes: CONTACT.notes,
  },
  solar: {
    tableId: TABLES.solarLeads,
    status: LEAD.status,
    priority: LEAD.priority,
    partner: LEAD.partner,
    assignee: LEAD.assignee,
    notes: LEAD.notes,
  },
};
