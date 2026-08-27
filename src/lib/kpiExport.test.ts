import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { buildKpiExport, kpiExportFilename } from './kpiExport';
import type { Lead } from './records';
import type { Priority, Status } from './schema';

function lead(patch: Partial<Lead> = {}): Lead {
  return {
    id: 'rec1',
    source: 'contact',
    ref: 'resp-1',
    date: '2026-08-20T09:30:00.000Z',
    firstName: 'Jean',
    lastName: 'Dupont',
    fullName: 'Jean Dupont',
    email: 'jean@example.com',
    phone: '',
    company: '',
    category: 'Un particulier',
    motive: '',
    message: '',
    address: {
      line1: '',
      line2: '',
      city: 'Lyon',
      postalCode: '69003',
      department: '69',
      region: '',
      country: 'France',
    },
    status: 'Nouveau',
    priority: 'Moyenne',
    partner: '',
    assigneeIds: [],
    assigneeNames: [],
    notes: '',
    gdprConsent: true,
    ...patch,
  };
}

const NOW = new Date('2026-08-27T12:00:00.000Z').getTime();
const SCOPE = { source: 'Demandes' };

/** Valeur de la ligne `bloc` / `indicateur`, ou `undefined` si absente. */
function cell(
  rows: string[][],
  bloc: string,
  indicateur: string,
): { valeur: string; part: string } | undefined {
  const row = rows.find((r) => r[0] === bloc && r[1] === indicateur);
  return row ? { valeur: row[2], part: row[3] } : undefined;
}

describe('buildKpiExport', () => {
  it('ouvre sur le périmètre, sans quoi les chiffres ne veulent rien dire', () => {
    const { rows } = buildKpiExport([lead()], {
      source: 'Les deux',
      assignee: 'Marie',
      from: '2026-07-01',
      to: '2026-07-31',
    }, NOW);

    expect(cell(rows, 'Contexte', 'Extraction du')?.valeur).toBe('2026-08-27');
    expect(cell(rows, 'Contexte', 'Source')?.valeur).toBe('Les deux');
    expect(cell(rows, 'Contexte', 'Collaborateur')?.valeur).toBe('Marie');
    expect(cell(rows, 'Contexte', 'Période')?.valeur).toBe('2026-07-01 → 2026-07-31');
  });

  it('dit « Tous » et « Depuis le début » en l’absence de filtre', () => {
    const { rows } = buildKpiExport([lead()], SCOPE, NOW);
    expect(cell(rows, 'Contexte', 'Collaborateur')?.valeur).toBe('Tous');
    expect(cell(rows, 'Contexte', 'Période')?.valeur).toBe('Depuis le début');
  });

  it('compte les statuts et leur part du total', () => {
    const leads = [
      lead({ id: 'a', status: 'Nouveau' }),
      lead({ id: 'b', status: 'Qualifié' }),
      lead({ id: 'c', status: 'Qualifié' }),
      lead({ id: 'd', status: 'Hors Critères' }),
    ];
    const { rows } = buildKpiExport(leads, SCOPE, NOW);

    expect(cell(rows, 'Synthèse', 'Demandes')?.valeur).toBe('4');
    expect(cell(rows, 'Statut', 'Qualifié')?.valeur).toBe('2');
    expect(cell(rows, 'Statut', 'Qualifié')?.part).toBe('50');
    // Statut sans effectif : la ligne existe quand même, à zéro. Une case
    // absente se lit « oubliée », une case à zéro se lit « vide ».
    expect(cell(rows, 'Statut', 'Archivé')?.valeur).toBe('0');
  });

  it('calcule le taux de qualification sur les demandes tranchées', () => {
    // 2 qualifiées, 1 hors critères, 1 encore nouvelle : 2/3 et non 2/4.
    const leads = [
      lead({ id: 'a', status: 'Nouveau' }),
      lead({ id: 'b', status: 'Qualifié' }),
      lead({ id: 'c', status: 'Qualifié' }),
      lead({ id: 'd', status: 'Hors Critères' }),
    ];
    const { rows } = buildKpiExport(leads, SCOPE, NOW);
    expect(cell(rows, 'Synthèse', 'Taux de qualification (sur demandes tranchées)')?.part).toBe(
      '66,7',
    );
  });

  it('rapporte les répartitions à leur couverture, pas au total', () => {
    // Deux demandes sur trois portent un motif : la part du motif présent
    // deux fois est 100 % des motifs renseignés, pas 67 % du total.
    const leads = [
      lead({ id: 'a', motive: 'Devis' }),
      lead({ id: 'b', motive: 'Devis' }),
      lead({ id: 'c', motive: '' }),
    ];
    const { rows } = buildKpiExport(leads, SCOPE, NOW);

    expect(cell(rows, 'Motif', 'Renseigné')?.valeur).toBe('2');
    expect(cell(rows, 'Motif', 'Non renseigné')?.valeur).toBe('1');
    expect(cell(rows, 'Motif', 'Devis')?.part).toBe('100');
  });

  it('reporte la variation de période avec son signe', () => {
    const { rows } = buildKpiExport([lead(), lead({ id: 'b' })], { ...SCOPE, previousTotal: 4 }, NOW);
    expect(cell(rows, 'Synthèse', 'Variation vs période précédente')?.part).toBe('-50');
    expect(cell(rows, 'Synthèse', 'Effectif période précédente')?.valeur).toBe('4');
  });

  it('omet la variation quand il n’y a pas de période antérieure', () => {
    const { rows } = buildKpiExport([lead()], SCOPE, NOW);
    expect(cell(rows, 'Synthèse', 'Variation vs période précédente')).toBeUndefined();
  });

  it('détaille les mois sans trou', () => {
    const { rows } = buildKpiExport(
      [
        lead({ id: 'a', date: '2026-06-15T00:00:00.000Z' }),
        lead({ id: 'b', date: '2026-08-15T00:00:00.000Z' }),
      ],
      SCOPE,
      NOW,
    );
    // Juillet est vide mais présent : l'omettre déformerait la tendance.
    expect(cell(rows, 'Mois', '2026-06')?.valeur).toBe('1');
    expect(cell(rows, 'Mois', '2026-07')?.valeur).toBe('0');
    expect(cell(rows, 'Mois', '2026-08')?.valeur).toBe('1');
  });

  it('ventile la charge par collaborateur', () => {
    const { rows } = buildKpiExport(
      [
        lead({ id: 'a', assigneeIds: ['u1'], assigneeNames: ['Marie'], status: 'Nouveau' }),
        lead({ id: 'b', assigneeIds: ['u1'], assigneeNames: ['Marie'], status: 'Qualifié' }),
      ],
      SCOPE,
      NOW,
    );
    expect(cell(rows, 'Collaborateur', 'Marie')?.valeur).toBe('2');
    expect(cell(rows, 'Collaborateur', 'Marie — à traiter')?.valeur).toBe('1');
  });

  it('expose le compteur de statuts non reconnus, même à zéro', () => {
    // Contrôle d'intégrité : ces demandes comptent dans le total et dans
    // aucun statut, l'écart doit être visible et non déduit.
    const { rows } = buildKpiExport([lead()], SCOPE, NOW);
    expect(cell(rows, 'Synthèse', 'Statut non reconnu')?.valeur).toBe('0');

    const bogus = buildKpiExport(
      [lead({ status: 'En cours' as Status, priority: 'Urgente' as Priority })],
      SCOPE,
      NOW,
    );
    expect(cell(bogus.rows, 'Synthèse', 'Statut non reconnu')?.valeur).toBe('1');
  });

  it('reste sérialisable sur une sélection vide', () => {
    const table = buildKpiExport([], SCOPE, NOW);
    expect(cell(table.rows, 'Synthèse', 'Demandes')?.valeur).toBe('0');
    // Le BOM ouvre le fichier, d'où le décalage d'un caractère.
    expect(toCsv(table).slice(1).split('\r\n')[0]).toBe('Bloc;Indicateur;Valeur;Part (%)');
  });

  it('écrit les décimales à la française, sinon Excel lit du texte', () => {
    const leads = [
      lead({ id: 'a', status: 'Qualifié' }),
      lead({ id: 'b', status: 'Qualifié' }),
      lead({ id: 'c', status: 'Hors Critères' }),
    ];
    const csv = toCsv(buildKpiExport(leads, SCOPE, NOW));
    expect(csv).toContain('66,7');
    expect(csv).not.toContain('66.7');
  });
});

describe('kpiExportFilename', () => {
  it('date le fichier du jour de l’extraction', () => {
    expect(kpiExportFilename(NOW)).toBe('sunlib-kpi-2026-08-27.csv');
  });
});
