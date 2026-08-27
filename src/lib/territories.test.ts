import { describe, expect, it } from 'vitest';
import type { Lead, StaffMember, Territory } from './records';
import {
  buildSectorIndex,
  coverageByStaff,
  formatCoverage,
  formatSector,
  sectorForLead,
  sectorKey,
  sectorKeyOf,
  staffOptionsFor,
} from './territories';

const territory = (over: Partial<Territory> = {}): Territory => ({
  id: 'recT',
  code: '33',
  name: 'Gironde',
  region: 'Nouvelle-Aquitaine',
  staffIds: ['recEdouard'],
  active: true,
  ...over,
});

const lead = (address: Partial<Lead['address']> = {}): Lead =>
  ({
    id: 'recL',
    address: {
      line1: '',
      line2: '',
      city: '',
      postalCode: '',
      department: '',
      region: '',
      country: '',
      ...address,
    },
  }) as Lead;

const staffMember = (id: string, name: string, group = 'Commercial'): StaffMember => ({
  id,
  name,
  email: `${id}@sunlib.fr`,
  group,
  active: true,
});

describe('sectorKey', () => {
  it('garde les deux premiers caractères', () => {
    expect(sectorKey('33')).toBe('33');
    expect(sectorKey('01')).toBe('01');
  });

  it('tronque les trois chiffres de l’outre-mer', () => {
    // C'est ce qui aligne la clé sur le champ « Département » des demandes,
    // qui ne vaut que les deux premiers chiffres du code postal.
    expect(sectorKey('974')).toBe('97');
  });

  it('ramène 2A et 2B sur la clé « 20 » de la Corse', () => {
    expect(sectorKey('2A')).toBe('20');
    expect(sectorKey('2B')).toBe('20');
  });

  it('rend une chaîne vide sur un code inexploitable', () => {
    expect(sectorKey('')).toBe('');
    expect(sectorKey('3')).toBe('');
  });
});

describe('sectorKeyOf', () => {
  it('préfère le champ département à la déduction', () => {
    expect(sectorKeyOf(lead({ department: '33', postalCode: '69100' }))).toBe('33');
  });

  it('déduit du code postal quand le champ est vide', () => {
    // Cas des leads solaires, qui n'ont pas de colonne « Département », et des
    // demandes reprises de l'export historique.
    expect(sectorKeyOf(lead({ postalCode: '33000' }))).toBe('33');
  });

  it('restitue le zéro initial mangé par un import tableur', () => {
    expect(sectorKeyOf(lead({ postalCode: '1000' }))).toBe('01');
  });

  it('rend une chaîne vide sans adresse exploitable', () => {
    expect(sectorKeyOf(lead())).toBe('');
  });
});

describe('buildSectorIndex', () => {
  it('indexe par code sur deux caractères', () => {
    const index = buildSectorIndex([territory()]);
    expect(index.get('33')?.name).toBe('Gironde');
  });

  it('ignore les lignes désactivées', () => {
    const index = buildSectorIndex([territory({ active: false })]);
    expect(index.size).toBe(0);
  });

  it('fusionne deux lignes qui partagent une clé', () => {
    // 2A et 2B, si la Corse était un jour saisie en deux lignes : la seconde
    // ne doit pas écraser la première.
    const index = buildSectorIndex([
      territory({ id: 'recA', code: '2A', name: 'Corse-du-Sud', staffIds: ['recIlan'] }),
      territory({ id: 'recB', code: '2B', name: 'Haute-Corse', staffIds: ['recJulien'] }),
    ]);
    expect(index.size).toBe(1);
    expect(index.get('20')?.staffIds).toEqual(['recIlan', 'recJulien']);
  });

  it('ne duplique pas un commercial présent deux fois', () => {
    const index = buildSectorIndex([
      territory({ id: 'recA', code: '20', staffIds: ['recIlan'] }),
      territory({ id: 'recB', code: '20', staffIds: ['recIlan'] }),
    ]);
    expect(index.get('20')?.staffIds).toEqual(['recIlan']);
  });
});

describe('sectorForLead', () => {
  const index = buildSectorIndex([territory()]);

  it('trouve le secteur du département', () => {
    expect(sectorForLead(lead({ department: '33' }), index)?.code).toBe('33');
  });

  it('rend null sur un département non couvert', () => {
    // Un CP 97400 donne « 97 » : les DOM ne sont pas sectorisés, et proposer
    // un commercial métropolitain serait pire que ne rien proposer.
    expect(sectorForLead(lead({ postalCode: '97400' }), index)).toBeNull();
  });

  it('rend null sans adresse', () => {
    expect(sectorForLead(lead(), index)).toBeNull();
  });
});

describe('coverageByStaff', () => {
  it('liste les départements de chaque commercial, triés', () => {
    const coverage = coverageByStaff([
      territory({ id: 'r1', code: '47', staffIds: ['recEdouard'] }),
      territory({ id: 'r2', code: '33', staffIds: ['recEdouard'] }),
      territory({ id: 'r3', code: '74', staffIds: ['recPhilippe'] }),
    ]);
    expect(coverage.get('recEdouard')).toEqual(['33', '47']);
    expect(coverage.get('recPhilippe')).toEqual(['74']);
  });

  it('ignore les lignes désactivées', () => {
    const coverage = coverageByStaff([territory({ active: false })]);
    expect(coverage.size).toBe(0);
  });
});

describe('formatCoverage', () => {
  it('énumère jusqu’à quatre codes', () => {
    expect(formatCoverage(['33', '40', '47', '64'])).toBe('33, 40, 47, 64');
  });

  it('abrège au-delà, pour tenir sur une ligne', () => {
    expect(formatCoverage(['33', '40', '47', '64', '79'])).toBe('33, 40, 47 +2');
  });

  it('rend une chaîne vide sans couverture', () => {
    expect(formatCoverage(undefined)).toBe('');
    expect(formatCoverage([])).toBe('');
  });
});

describe('formatSector', () => {
  it('associe code et nom', () => {
    expect(formatSector({ code: '33', name: 'Gironde', region: '', staffIds: [] })).toBe(
      '33 · Gironde',
    );
  });

  it('se contente du code si le nom manque', () => {
    expect(formatSector({ code: '33', name: '', region: '', staffIds: [] })).toBe('33');
  });
});

describe('staffOptionsFor', () => {
  const staff = [staffMember('recEdouard', 'Edouard Da Silva'), staffMember('recIlan', 'Ilan B')];
  const territories = [
    territory({ id: 'r1', code: '33', staffIds: ['recEdouard'] }),
    territory({ id: 'r2', code: '47', staffIds: ['recEdouard'] }),
    territory({ id: 'r3', code: '20', staffIds: ['recIlan'] }),
  ];
  const coverage = coverageByStaff(territories);
  const sector = buildSectorIndex(territories).get('33') ?? null;

  it('épingle le commercial du secteur et le signale', () => {
    const options = staffOptionsFor(staff, sector, coverage);
    const edouard = options.find((o) => o.value === 'recEdouard');
    expect(edouard?.pinned).toBe(true);
    expect(edouard?.hint).toBe('Secteur 33');
  });

  it('situe les autres par leurs départements', () => {
    const ilan = staffOptionsFor(staff, sector, coverage).find((o) => o.value === 'recIlan');
    expect(ilan?.pinned).toBe(false);
    expect(ilan?.hint).toBe('20');
  });

  it('retombe sur le service pour un collaborateur non sectorisé', () => {
    const options = staffOptionsFor(
      [staffMember('recAdmin', 'Alice', 'Administratif')],
      sector,
      coverage,
    );
    expect(options[0]?.hint).toBe('Administratif');
  });

  it('n’épingle rien sans secteur', () => {
    const options = staffOptionsFor(staff, null, coverage);
    expect(options.every((o) => !o.pinned)).toBe(true);
  });
});
