import { describe, expect, it } from 'vitest';
import { buildDuplicateIndex, groupByAddress, keepDuplicates } from './duplicates';
import { duplicateNote } from './leadActions';
import type { Lead } from './records';

function lead(patch: Partial<Lead> & { id: string }): Lead {
  return {
    source: 'contact',
    ref: patch.id,
    date: '2026-08-20T00:00:00.000Z',
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
    gdprConsent: false,
    ...patch,
  };
}

describe('buildDuplicateIndex', () => {
  it('ne marque que les adresses portant plusieurs demandes', () => {
    const index = buildDuplicateIndex([
      lead({ id: 'a', email: 'a@b.fr' }),
      lead({ id: 'b', email: 'a@b.fr' }),
      lead({ id: 'c', email: 'seul@b.fr' }),
    ]);

    expect(index.addresses).toBe(1);
    expect(index.rows).toBe(2);
    expect(index.marks.has('a')).toBe(true);
    expect(index.marks.has('b')).toBe(true);
    expect(index.marks.has('c')).toBe(false);
  });

  it('rapproche les adresses malgré la casse et les espaces', () => {
    const index = buildDuplicateIndex([
      lead({ id: 'a', email: 'Jean@Example.FR' }),
      lead({ id: 'b', email: '  jean@example.fr ' }),
    ]);
    expect(index.addresses).toBe(1);
    expect(index.marks.get('a')?.email).toBe('jean@example.fr');
  });

  it('classe la demande la plus récente au rang 1', () => {
    const index = buildDuplicateIndex([
      lead({ id: 'vieux', email: 'a@b.fr', date: '2026-01-01T00:00:00.000Z' }),
      lead({ id: 'recent', email: 'a@b.fr', date: '2026-08-01T00:00:00.000Z' }),
      lead({ id: 'moyen', email: 'a@b.fr', date: '2026-04-01T00:00:00.000Z' }),
    ]);
    expect(index.marks.get('recent')?.rank).toBe(1);
    expect(index.marks.get('moyen')?.rank).toBe(2);
    expect(index.marks.get('vieux')?.rank).toBe(3);
    // Le compte est le même sur toute la fratrie : c'est lui qui alerte.
    expect(index.marks.get('vieux')?.count).toBe(3);
  });

  it('ignore les lignes sans email plutôt que de les regrouper', () => {
    // Sans clé commune, rien ne dit que deux lignes vides sont la même
    // personne : les rapprocher inventerait un doublon.
    const index = buildDuplicateIndex([
      lead({ id: 'a', email: '' }),
      lead({ id: 'b', email: '   ' }),
    ]);
    expect(index.addresses).toBe(0);
    expect(index.marks.size).toBe(0);
  });

  it('reste vide sur une table vide', () => {
    const index = buildDuplicateIndex([]);
    expect(index.addresses).toBe(0);
    expect(index.rows).toBe(0);
  });
});

describe('keepDuplicates', () => {
  it('garde le groupe entier, pas seulement les surnuméraires', () => {
    // On veut comparer les demandes entre elles pour trancher : retirer la
    // première rendrait l'arbitrage impossible.
    const leads = [
      lead({ id: 'a', email: 'a@b.fr' }),
      lead({ id: 'b', email: 'a@b.fr' }),
      lead({ id: 'c', email: 'seul@b.fr' }),
    ];
    const index = buildDuplicateIndex(leads);
    expect(keepDuplicates(leads, index).map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('groupByAddress', () => {
  it('rassemble les lignes d’une même adresse en préservant le tri', () => {
    const leads = [
      lead({ id: 'a1', email: 'a@b.fr' }),
      lead({ id: 'b1', email: 'b@b.fr' }),
      lead({ id: 'a2', email: 'a@b.fr' }),
      lead({ id: 'b2', email: 'b@b.fr' }),
    ];
    const index = buildDuplicateIndex(leads);
    // Les groupes sortent dans l'ordre de première apparition, donc dans
    // l'ordre du tri courant, et l'ordre interne est celui reçu.
    expect(groupByAddress(leads, index).map((l) => l.id)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('rejette en fin les lignes hors groupe', () => {
    const leads = [
      lead({ id: 'solo', email: 'seul@b.fr' }),
      lead({ id: 'a1', email: 'a@b.fr' }),
      lead({ id: 'a2', email: 'a@b.fr' }),
    ];
    const index = buildDuplicateIndex(leads);
    expect(groupByAddress(leads, index).map((l) => l.id)).toEqual(['a1', 'a2', 'solo']);
  });
});

describe('duplicateNote', () => {
  it('distingue la plus récente sans numéroter les autres', () => {
    const recent = duplicateNote({ email: 'a@b.fr', count: 18, rank: 1 });
    expect(recent.label).toBe('18 demandes');
    expect(recent.latest).toBe(true);
    expect(recent.title).toContain('La plus récente');

    const autre = duplicateNote({ email: 'a@b.fr', count: 18, rank: 7 });
    expect(autre.label).toBe('18 demandes');
    expect(autre.latest).toBe(false);
    expect(autre.title).toContain('Une des');
  });
});
