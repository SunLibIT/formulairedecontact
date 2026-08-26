import { describe, expect, it } from 'vitest';
import { applyFilters, applyPeriod, DEFAULT_SORT, EMPTY_FILTERS, sortLeads } from './filters';
import type { Lead } from './records';

/** Fabrique un lead minimal, seuls les champs testés sont renseignés. */
function lead(over: Partial<Lead> & { id: string }): Lead {
  return {
    source: 'contact',
    ref: over.id,
    date: '2026-01-01T00:00:00Z',
    firstName: '',
    lastName: '',
    fullName: 'Sans nom',
    email: '',
    phone: '',
    company: '',
    category: '',
    motive: '',
    message: '',
    address: {
      line1: '',
      line2: '',
      city: '',
      postalCode: '',
      department: '',
      region: '',
      country: '',
    },
    status: 'Nouveau',
    priority: 'Moyenne',
    partner: '',
    assigneeIds: [],
    assigneeNames: [],
    notes: '',
    ...over,
  };
}

describe('sortLeads', () => {
  it('trie par date, du plus récent au plus ancien par défaut', () => {
    const leads = [
      lead({ id: 'a', date: '2026-01-01T00:00:00Z' }),
      lead({ id: 'b', date: '2026-03-01T00:00:00Z' }),
      lead({ id: 'c', date: '2026-02-01T00:00:00Z' }),
    ];
    expect(sortLeads(leads, DEFAULT_SORT).map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });

  it('inverse avec la direction ascendante', () => {
    const leads = [
      lead({ id: 'a', date: '2026-01-01T00:00:00Z' }),
      lead({ id: 'b', date: '2026-03-01T00:00:00Z' }),
    ];
    expect(
      sortLeads(leads, { field: 'date', direction: 'asc' }).map((l) => l.id),
    ).toEqual(['a', 'b']);
  });

  it('trie la priorité par urgence, pas par ordre alphabétique', () => {
    const leads = [
      lead({ id: 'basse', priority: 'Basse' }),
      lead({ id: 'haute', priority: 'Haute' }),
      lead({ id: 'moyenne', priority: 'Moyenne' }),
    ];
    expect(
      sortLeads(leads, { field: 'priority', direction: 'asc' }).map((l) => l.id),
    ).toEqual(['haute', 'moyenne', 'basse']);
  });

  it('trie le statut dans l’ordre du pipeline', () => {
    const leads = [
      lead({ id: 'qualifie', status: 'Qualifié' }),
      lead({ id: 'nouveau', status: 'Nouveau' }),
      lead({ id: 'contacter', status: 'A contacter' }),
    ];
    expect(
      sortLeads(leads, { field: 'status', direction: 'asc' }).map((l) => l.id),
    ).toEqual(['nouveau', 'contacter', 'qualifie']);
  });

  it('regroupe les non assignés en fin de tri croissant', () => {
    const leads = [
      lead({ id: 'vide' }),
      lead({ id: 'zoe', assigneeIds: ['r1'], assigneeNames: ['Zoé Martin'] }),
      lead({ id: 'alice', assigneeIds: ['r2'], assigneeNames: ['Alice Durand'] }),
    ];
    expect(
      sortLeads(leads, { field: 'assignee', direction: 'asc' }).map((l) => l.id),
    ).toEqual(['alice', 'zoe', 'vide']);
  });

  it('départage à égalité par date décroissante, donc de façon stable', () => {
    const leads = [
      lead({ id: 'vieux', priority: 'Haute', date: '2026-01-01T00:00:00Z' }),
      lead({ id: 'recent', priority: 'Haute', date: '2026-05-01T00:00:00Z' }),
    ];
    const once = sortLeads(leads, { field: 'priority', direction: 'asc' });
    const twice = sortLeads(once, { field: 'priority', direction: 'asc' });
    expect(once.map((l) => l.id)).toEqual(['recent', 'vieux']);
    expect(twice.map((l) => l.id)).toEqual(once.map((l) => l.id));
  });

  it('ne modifie pas le tableau reçu', () => {
    const leads = [lead({ id: 'a' }), lead({ id: 'b' })];
    const copy = [...leads];
    sortLeads(leads, { field: 'name', direction: 'asc' });
    expect(leads).toEqual(copy);
  });
});

describe('applyFilters', () => {
  it('ne trie plus : l’ordre d’entrée est conservé', () => {
    const leads = [
      lead({ id: 'vieux', date: '2026-01-01T00:00:00Z' }),
      lead({ id: 'recent', date: '2026-06-01T00:00:00Z' }),
    ];
    expect(applyFilters(leads, EMPTY_FILTERS).map((l) => l.id)).toEqual([
      'vieux',
      'recent',
    ]);
  });

  it('cherche sur plusieurs champs et exige tous les termes', () => {
    const leads = [
      lead({ id: 'ok', fullName: 'Camille Durand', company: 'Solaire Plus' }),
      lead({ id: 'non', fullName: 'Camille Martin', company: 'Autre' }),
    ];
    const found = applyFilters(leads, { ...EMPTY_FILTERS, search: 'camille solaire' });
    expect(found.map((l) => l.id)).toEqual(['ok']);
  });

  it('filtre les non assignés', () => {
    const leads = [
      lead({ id: 'vide' }),
      lead({ id: 'pris', assigneeIds: ['r1'], assigneeNames: ['Alice'] }),
    ];
    const found = applyFilters(leads, { ...EMPTY_FILTERS, assignee: 'unassigned' });
    expect(found.map((l) => l.id)).toEqual(['vide']);
  });
});

describe('applyPeriod', () => {
  // Les bornes du filtre sont interprétées en heure **locale** : choisir le
  // 31 mars veut dire « jusqu'à la fin du 31 mars chez moi ». Les horodatages
  // de ce test sont donc placés en milieu de journée, loin de minuit, pour que
  // le résultat ne dépende pas du fuseau de la machine qui l'exécute.
  it('inclut les deux bornes', () => {
    const leads = [
      lead({ id: 'avant', date: '2026-02-26T12:00:00Z' }),
      lead({ id: 'debut', date: '2026-03-01T12:00:00Z' }),
      lead({ id: 'fin', date: '2026-03-31T12:00:00Z' }),
      lead({ id: 'apres', date: '2026-04-03T12:00:00Z' }),
    ];
    const found = applyPeriod(leads, '2026-03-01', '2026-03-31');
    expect(found.map((l) => l.id)).toEqual(['debut', 'fin']);
  });

  it('renvoie tout sans borne', () => {
    const leads = [lead({ id: 'a' }), lead({ id: 'b' })];
    expect(applyPeriod(leads, '', '')).toHaveLength(2);
  });
});
