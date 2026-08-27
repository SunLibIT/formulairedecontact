import { describe, expect, it } from 'vitest';
import { NO_LINK, parseDeepLink, planDeepLink } from './deepLink';
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
    gdprConsent: false,
    ...over,
  };
}

const REC = 'recABCDEFGH123456';
const OTHER = 'recZYXWVUTS654321';

describe('parseDeepLink', () => {
  it('lit les deux paramètres', () => {
    expect(parseDeepLink(`?lead=${REC}&assignee=me`)).toEqual({
      lead: REC,
      assignee: 'me',
    });
  });

  it('accepte un identifiant RH explicite', () => {
    expect(parseDeepLink(`?assignee=${OTHER}`).assignee).toBe(OTHER);
  });

  it('ignore une valeur qui n’est pas un identifiant Airtable', () => {
    // Un lien tronqué par un client mail ne doit pas produire un état muet.
    expect(parseDeepLink('?lead=recTronq').lead).toBe('');
    expect(parseDeepLink('?lead=../../etc/passwd').lead).toBe('');
    expect(parseDeepLink('?assignee=tout-le-monde').assignee).toBe('');
  });

  it('tolère l’absence de paramètres et les autres', () => {
    expect(parseDeepLink('')).toEqual(NO_LINK);
    expect(parseDeepLink('?email=a@b.fr&view=list')).toEqual(NO_LINK);
  });

  it('ne se laisse pas piéger par les espaces d’un lien recopié', () => {
    expect(parseDeepLink(`?lead=%20${REC}%20`).lead).toBe(REC);
  });
});

describe('planDeepLink', () => {
  const base = { viewerStaffId: null, contact: [], solar: [] };

  it('ne fait rien sans lien', () => {
    const plan = planDeepLink({ ...base, link: NO_LINK });
    expect(plan).toEqual({
      open: null,
      tab: null,
      assignee: { contact: '', solar: '' },
      missing: false,
    });
  });

  it('trouve la demande dans la table des contacts et pose l’onglet', () => {
    const target = lead({ id: REC });
    const plan = planDeepLink({
      ...base,
      link: { lead: REC, assignee: '' },
      contact: [lead({ id: OTHER }), target],
    });
    expect(plan.open).toBe(target);
    expect(plan.tab).toBe('contact');
    expect(plan.missing).toBe(false);
  });

  it('trouve la demande dans les leads solaires — le lien ignore les tables', () => {
    const target = lead({ id: REC, source: 'solar' });
    const plan = planDeepLink({ ...base, link: { lead: REC, assignee: '' }, solar: [target] });
    expect(plan.open).toBe(target);
    expect(plan.tab).toBe('solar');
  });

  it('signale une demande absente des deux tables', () => {
    const plan = planDeepLink({
      ...base,
      link: { lead: REC, assignee: '' },
      contact: [lead({ id: OTHER })],
    });
    expect(plan.open).toBeNull();
    expect(plan.missing).toBe(true);
    expect(plan.tab).toBeNull();
  });

  it('résout « me » avec l’identifiant du visiteur', () => {
    const plan = planDeepLink({
      ...base,
      link: { lead: '', assignee: 'me' },
      viewerStaffId: 'recStaff1234567',
      contact: [lead({ id: REC, assigneeIds: ['recStaff1234567'] })],
    });
    expect(plan.assignee.contact).toBe('recStaff1234567');
  });

  it('ignore « me » quand le visiteur n’est pas identifié', () => {
    const plan = planDeepLink({
      ...base,
      link: { lead: '', assignee: 'me' },
      contact: [lead({ id: REC, assigneeIds: ['recStaff1234567'] })],
    });
    expect(plan.assignee).toEqual({ contact: '', solar: '' });
  });

  it('ne pose le filtre que là où il donne des résultats', () => {
    // Sinon le sélecteur, qui ne connaît que les assignés présents dans la
    // table, afficherait « Tous » au-dessus d’une liste vide.
    const plan = planDeepLink({
      link: { lead: '', assignee: 'recStaff1234567' },
      viewerStaffId: null,
      contact: [lead({ id: REC })],
      solar: [lead({ id: OTHER, source: 'solar', assigneeIds: ['recStaff1234567'] })],
    });
    expect(plan.assignee).toEqual({ contact: '', solar: 'recStaff1234567' });
    // Le travail de la personne est dans l’autre onglet : on y va.
    expect(plan.tab).toBe('solar');
  });

  it('laisse l’onglet en place quand les deux tables ont du travail', () => {
    const staffId = 'recStaff1234567';
    const plan = planDeepLink({
      link: { lead: '', assignee: staffId },
      viewerStaffId: null,
      contact: [lead({ id: REC, assigneeIds: [staffId] })],
      solar: [lead({ id: OTHER, source: 'solar', assigneeIds: [staffId] })],
    });
    expect(plan.assignee).toEqual({ contact: staffId, solar: staffId });
    expect(plan.tab).toBeNull();
  });

  it('la demande ouverte l’emporte sur le filtre pour le choix de l’onglet', () => {
    const staffId = 'recStaff1234567';
    const target = lead({ id: REC, assigneeIds: [staffId] });
    const plan = planDeepLink({
      link: { lead: REC, assignee: staffId },
      viewerStaffId: null,
      contact: [target],
      solar: [lead({ id: OTHER, source: 'solar', assigneeIds: [staffId] })],
    });
    expect(plan.tab).toBe('contact');
    expect(plan.open).toBe(target);
  });
});
