import { describe, expect, it } from 'vitest';
import type { AirtableRecord } from './airtable';
import { toContactLead, withStatuses } from './records';
import { CONTACT, DEFAULT_STATUSES, STATUS } from './schema';
import {
  DEFAULT_REGISTRY,
  buildRegistry,
  countOfRole,
  resolveStatus,
  selectableStatuses,
  statusForRole,
  tallyStatus,
  toStatusDef,
  type StatusCounts,
} from './statuses';

const NOUVEAU = DEFAULT_STATUSES[0];

/** Le registre d'origine, avec « Nouveau » renommé par un admin. */
const renamed = buildRegistry(
  DEFAULT_STATUSES.map((s) => (s.id === NOUVEAU.id ? { ...s, name: 'Nouvelle demande' } : s)),
);

const record = (fields: Record<string, unknown>): AirtableRecord => ({
  id: 'recLead000000001',
  createdTime: '2026-10-01T00:00:00.000Z',
  fields,
});

describe('toStatusDef', () => {
  it('lit une ligne de la table Statuts', () => {
    const s = toStatusDef({
      id: 'recNew0000000001',
      createdTime: '',
      fields: {
        [STATUS.name]: ' Rendez-vous fixé ',
        [STATUS.tone]: { name: 'signed' },
        [STATUS.order]: 8,
        [STATUS.archived]: true,
      },
    });
    expect(s).toEqual({
      id: 'recNew0000000001',
      name: 'Rendez-vous fixé',
      tone: 'signed',
      order: 8,
      archived: true,
      role: null,
    });
  });

  it('retombe sur le gris pour un ton illisible', () => {
    const s = toStatusDef({ id: 'r', createdTime: '', fields: { [STATUS.tone]: 'fuchsia' } });
    expect(s.tone).toBe('neutral');
  });
});

describe('resolveStatus', () => {
  it('suit le lien en priorité', () => {
    expect(resolveStatus(renamed, NOUVEAU.id, 'Qualifié').name).toBe('Nouvelle demande');
  });

  it('rattache un libellé hérité même après un renommage', () => {
    // C'est tout l'intérêt de passer par le nom d'origine puis l'identifiant :
    // chercher « Nouveau » dans la table vivante échouerait ici.
    const s = resolveStatus(renamed, null, 'Nouveau');
    expect(s.id).toBe(NOUVEAU.id);
    expect(s.name).toBe('Nouvelle demande');
  });

  it('garde un libellé hérité inconnu, marqué comme tel', () => {
    const s = resolveStatus(DEFAULT_REGISTRY, null, '2026-03-01 14:22');
    expect(s).toMatchObject({ name: '2026-03-01 14:22', unknown: true, role: null });
  });

  it('vaut « nouveau » quand rien n’est renseigné', () => {
    expect(resolveStatus(renamed, null, '').role).toBe('nouveau');
  });
});

describe('selectableStatuses', () => {
  it('écarte les archivés et le statut « Archivé », dans l’ordre du pipeline', () => {
    const registry = buildRegistry([
      ...DEFAULT_STATUSES,
      { id: 'recOld', name: 'Ancien', tone: 'neutral', order: 3.5, archived: true, role: null },
    ]);
    const names = selectableStatuses(registry).map((s) => s.name);
    expect(names).toEqual(['Nouveau', 'A contacter', 'Qualifié', 'Signé', 'A relancer', 'Hors Critères']);
  });

  it('ajoute le statut courant quand il en est exclu', () => {
    const archived = statusForRole(DEFAULT_REGISTRY, 'archive');
    expect(selectableStatuses(DEFAULT_REGISTRY, archived).slice(-1)[0]?.id).toBe(archived.id);
  });
});

describe('countOfRole', () => {
  it('compte par rôle, quel que soit le nom', () => {
    const counts: StatusCounts = new Map();
    tallyStatus(counts, statusForRole(renamed, 'nouveau'));
    tallyStatus(counts, statusForRole(renamed, 'nouveau'));
    expect(countOfRole(counts, 'nouveau')).toBe(2);
    expect(countOfRole(counts, 'qualifie')).toBe(0);
  });
});

describe('withStatuses', () => {
  it('propage un renommage aux demandes liées, sans relire Airtable', () => {
    const lead = toContactLead(record({ [CONTACT.statusLink]: [NOUVEAU.id] }), new Map());
    expect(lead.status.name).toBe('Nouveau');
    expect(withStatuses([lead], renamed)[0].status.name).toBe('Nouvelle demande');
  });

  it('rend le même objet quand le statut n’a pas bougé', () => {
    const lead = toContactLead(record({ [CONTACT.statusLegacy]: { name: 'Qualifié' } }), new Map());
    expect(withStatuses([lead], DEFAULT_REGISTRY)[0]).toBe(lead);
  });
});
