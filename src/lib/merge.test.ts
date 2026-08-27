import { describe, expect, it } from 'vitest';
import { mergeFields, planMerge } from './merge';
import type { Lead } from './records';
import { CONTACT } from './schema';

function lead(patch: Partial<Lead> & { id: string }): Lead {
  return {
    source: 'contact',
    ref: patch.id,
    date: '2026-08-20T00:00:00.000Z',
    firstName: 'Jean',
    lastName: 'Dupont',
    fullName: 'Jean Dupont',
    email: 'jean@example.fr',
    phone: '',
    company: '',
    category: 'Un particulier',
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

describe('planMerge', () => {
  it('conserve la demande la plus récente et archive les autres', () => {
    const plan = planMerge([
      lead({ id: 'vieux', date: '2026-01-01T00:00:00.000Z' }),
      lead({ id: 'recent', date: '2026-08-01T00:00:00.000Z' }),
      lead({ id: 'moyen', date: '2026-04-01T00:00:00.000Z' }),
    ]);

    expect(plan?.target.id).toBe('recent');
    expect(plan?.sources.map((s) => s.id)).toEqual(['moyen', 'vieux']);
  });

  it('complète les champs vides de la cible', () => {
    const plan = planMerge([
      lead({
        id: 'recent',
        date: '2026-08-01T00:00:00.000Z',
        address: { ...lead({ id: 'x' }).address, city: 'Lyon' },
      }),
      lead({
        id: 'vieux',
        date: '2026-01-01T00:00:00.000Z',
        phone: '0658706444',
        company: 'SARL Toiture',
      }),
    ]);

    const labels = plan?.filled.map((f) => f.label);
    expect(labels).toContain('Téléphone');
    expect(labels).toContain('Société');
    // La ville de la cible est renseignée : elle ne doit pas figurer au plan.
    expect(labels).not.toContain('Ville');
    expect(plan?.archiveOnly).toBe(false);
  });

  it('n’écrase jamais une valeur déjà présente sur la cible', () => {
    const plan = planMerge([
      lead({ id: 'recent', date: '2026-08-01T00:00:00.000Z', phone: '0611111111' }),
      lead({ id: 'vieux', date: '2026-01-01T00:00:00.000Z', phone: '0622222222' }),
    ]);
    expect(plan?.filled.map((f) => f.label)).not.toContain('Téléphone');
    expect(mergeFields(plan!)).toEqual({});
  });

  it('ne reprend jamais le statut ni la priorité', () => {
    // Ce sont des décisions commerciales : un « Hors Critères » de janvier ne
    // doit pas écraser le « Qualifié » d'août.
    const plan = planMerge([
      lead({ id: 'recent', date: '2026-08-01T00:00:00.000Z', status: 'Qualifié', priority: 'Haute' }),
      lead({
        id: 'vieux',
        date: '2026-01-01T00:00:00.000Z',
        status: 'Hors Critères',
        priority: 'Basse',
      }),
    ]);
    const fields = mergeFields(plan!);
    expect(fields[CONTACT.status]).toBeUndefined();
    expect(fields[CONTACT.priority]).toBeUndefined();
    expect(plan?.target.status).toBe('Qualifié');
  });

  it('prend la valeur de la source la plus récente qui en porte une', () => {
    const plan = planMerge([
      lead({ id: 'cible', date: '2026-08-01T00:00:00.000Z' }),
      lead({ id: 'moyen', date: '2026-04-01T00:00:00.000Z', phone: '0644444444' }),
      lead({ id: 'vieux', date: '2026-01-01T00:00:00.000Z', phone: '0611111111' }),
    ]);
    const phone = plan?.filled.find((f) => f.label === 'Téléphone');
    expect(phone?.value).toBe('0644444444');
    expect(phone?.from).toBe('01/04/26');
  });

  it('reprend l’assignation sous forme de tableau d’identifiants', () => {
    // Champ de liaison Airtable : jamais une chaîne.
    const plan = planMerge([
      lead({ id: 'cible', date: '2026-08-01T00:00:00.000Z' }),
      lead({
        id: 'vieux',
        date: '2026-01-01T00:00:00.000Z',
        assigneeIds: ['recStaff1'],
        assigneeNames: ['Marie'],
      }),
    ]);
    const assignee = plan?.filled.find((f) => f.label === 'Assigné à');
    expect(assignee?.value).toEqual(['recStaff1']);
    expect(assignee?.display).toBe('Marie');
    expect(mergeFields(plan!)[CONTACT.assignee]).toEqual(['recStaff1']);
  });

  it('signale une fusion qui ne fait qu’archiver', () => {
    const plan = planMerge([
      lead({ id: 'a', date: '2026-08-01T00:00:00.000Z', phone: '0611111111' }),
      lead({ id: 'b', date: '2026-01-01T00:00:00.000Z', phone: '0611111111' }),
    ]);
    expect(plan?.archiveOnly).toBe(true);
    expect(plan?.filled).toHaveLength(0);
  });

  it('produit l’état d’après-écriture, identique aux champs écrits', () => {
    // `merged` sert à corriger l'écran sans recharger la table : il doit
    // décrire exactement ce que `mergeFields` envoie, sans rien de plus.
    const plan = planMerge([
      lead({ id: 'cible', date: '2026-08-01T00:00:00.000Z', status: 'Qualifié' }),
      lead({
        id: 'vieux',
        date: '2026-01-01T00:00:00.000Z',
        phone: '0658706444',
        company: 'SARL Toiture',
        status: 'Hors Critères',
        address: {
          ...lead({ id: 'x' }).address,
          city: 'Lyon',
          postalCode: '69003',
          department: '69',
        },
      }),
    ])!;

    expect(plan.merged.phone).toBe('0658706444');
    expect(plan.merged.company).toBe('SARL Toiture');
    expect(plan.merged.address.city).toBe('Lyon');
    expect(plan.merged.address.postalCode).toBe('69003');
    // Le département suit le code postal : les deux décrivent le même lieu.
    expect(plan.merged.address.department).toBe('69');
    // Ni le statut, ni l'identité de la demande conservée.
    expect(plan.merged.status).toBe('Qualifié');
    expect(plan.merged.id).toBe('cible');
    expect(plan.merged.date).toBe('2026-08-01T00:00:00.000Z');
  });

  it('ne touche à rien dans `merged` quand il n’y a rien à compléter', () => {
    const plan = planMerge([
      lead({ id: 'a', date: '2026-08-01T00:00:00.000Z', phone: '0611111111' }),
      lead({ id: 'b', date: '2026-01-01T00:00:00.000Z', phone: '0622222222' }),
    ])!;
    expect(plan.merged).toEqual(plan.target);
  });

  it('refuse un groupe qui ne partage pas la même adresse', () => {
    // Fusionner deux personnes différentes n'est pas rattrapable : on ne
    // saurait plus quelle valeur venait de qui.
    expect(
      planMerge([lead({ id: 'a', email: 'a@b.fr' }), lead({ id: 'b', email: 'autre@b.fr' })]),
    ).toBeNull();
  });

  it('refuse un groupe sans email, ou trop court', () => {
    expect(planMerge([lead({ id: 'a', email: '' }), lead({ id: 'b', email: '' })])).toBeNull();
    expect(planMerge([lead({ id: 'a' })])).toBeNull();
    expect(planMerge([])).toBeNull();
  });

  it('refuse de mélanger les deux tables', () => {
    // Les identifiants de champ diffèrent : on écrirait dans le vide.
    expect(
      planMerge([lead({ id: 'a' }), lead({ id: 'b', source: 'solar' })]),
    ).toBeNull();
  });

  it('ignore un champ absent de la table du simulateur', () => {
    // La table des leads solaires n'a pas de raison sociale.
    const plan = planMerge([
      lead({ id: 'cible', source: 'solar', date: '2026-08-01T00:00:00.000Z' }),
      lead({ id: 'vieux', source: 'solar', date: '2026-01-01T00:00:00.000Z', company: 'SARL' }),
    ]);
    expect(plan?.filled.map((f) => f.label)).not.toContain('Société');
  });
});
