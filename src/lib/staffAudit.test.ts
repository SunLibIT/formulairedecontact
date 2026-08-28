import { describe, expect, it } from 'vitest';
import type { StaffMember } from './records';
import { auditStaff } from './staffAudit';
import type { CoverageIndex } from './territories';

const person = (over: Partial<StaffMember> & { id: string }): StaffMember => ({
  name: 'Sans nom',
  email: `${over.id}@sunlib.fr`,
  group: 'Commercial',
  active: true,
  ...over,
});

/** Trois adresses au même domaine : le seuil à partir duquel il fait référence. */
const crowd = [
  person({ id: 'rec1', name: 'Un' }),
  person({ id: 'rec2', name: 'Deux' }),
  person({ id: 'rec3', name: 'Trois' }),
];

const sectorised = (...ids: string[]): CoverageIndex =>
  new Map(ids.map((id) => [id, ['33']]));

const kinds = (staff: StaffMember[], coverage: CoverageIndex = new Map()) =>
  auditStaff(staff, coverage).map((a) => a.kind);

describe('auditStaff', () => {
  it('signale une fiche active sans adresse', () => {
    // Le cas qui casse le mail d'assignation sans rien afficher nulle part.
    const found = auditStaff(
      [...crowd, person({ id: 'recMuet', name: 'Jerome K', email: '' })],
      sectorised('rec1', 'rec2', 'rec3', 'recMuet'),
    );
    const muet = found.find((a) => a.kind === 'no-email');
    expect(muet?.who).toBe('Jerome K');
    expect(muet?.blocking).toBe(true);
    expect(muet?.detail).toContain('secteur');
  });

  it('repère une adresse dont le domaine sort du lot', () => {
    // Le cas réel : « claudine@sunlib.frr », un r de trop, invisible à l'œil.
    const found = auditStaff(
      [...crowd, person({ id: 'recTypo', name: 'Claudine', email: 'claudine@sunlib.frr' })],
      new Map(),
    );
    const typo = found.find((a) => a.kind === 'odd-domain');
    expect(typo?.detail).toContain('claudine@sunlib.frr');
    expect(typo?.blocking).toBe(true);
  });

  it('ne juge pas le domaine sur deux fiches', () => {
    // « Majoritaire » ne veut rien dire sur un échantillon minuscule ; mieux
    // vaut ne rien dire que crier sur une base de test.
    expect(
      kinds([
        person({ id: 'recA', name: 'A', email: 'a@sunlib.fr' }),
        person({ id: 'recB', name: 'B', email: 'b@ailleurs.fr' }),
      ]),
    ).not.toContain('odd-domain');
  });

  it('rapproche deux fiches du même nom, malgré casse et accents', () => {
    // Les deux « Claudine Rouaut » ont des adresses différentes : les
    // comparer n'aurait rien donné, c'est le nom qui les réunit.
    const found = auditStaff(
      [
        person({ id: 'recU', name: 'Claudine ROUAUT', email: 'claudine@sunlib.fr' }),
        person({ id: 'recD', name: 'Claudine Rouaut', email: 'claudine@sunlib.frr' }),
      ],
      new Map(),
    );
    const dup = found.find((a) => a.kind === 'duplicate-name');
    expect(dup?.staffIds).toEqual(['recU', 'recD']);
    expect(dup?.detail).toContain('2 fiches');
  });

  it('signale un commercial hors sectorisation, sans en faire un défaut', () => {
    const found = auditStaff([person({ id: 'recNeuf', name: 'Antoine' })], new Map());
    const orphan = found.find((a) => a.kind === 'sales-without-sector');
    expect(orphan?.blocking).toBe(false);
  });

  it('ne reproche pas son absence de secteur à un non commercial', () => {
    expect(
      kinds([person({ id: 'recAdmin', name: 'Alice', group: 'Administratif' })]),
    ).not.toContain('sales-without-sector');
  });

  it('signale une fiche désactivée qui couvre encore des départements', () => {
    const found = auditStaff(
      [person({ id: 'recParti', name: 'Olivier', active: false })],
      sectorised('recParti'),
    );
    expect(found.map((a) => a.kind)).toEqual(['inactive-with-sector']);
  });

  it('ignore une fiche désactivée sans secteur', () => {
    // Elle a quitté la liste d'assignation : elle ne gêne plus personne.
    expect(kinds([person({ id: 'recParti', name: 'Olivier', active: false })])).toEqual([]);
  });

  it('remonte les anomalies bloquantes d’abord', () => {
    const found = auditStaff(
      [
        ...crowd,
        person({ id: 'recNeuf', name: 'Zoé' }),
        person({ id: 'recMuet', name: 'Aaron', email: '' }),
      ],
      new Map(),
    );
    expect(found[0]?.kind).toBe('no-email');
  });

  it('ne dit rien d’une base saine', () => {
    expect(kinds(crowd, sectorised('rec1', 'rec2', 'rec3'))).toEqual([]);
  });
});
