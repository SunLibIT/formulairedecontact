/**
 * Tests des indicateurs.
 *
 * Ce fichier manquait, et c'est ce qui a laissé passer les écarts remontés :
 * `previousPeriod` comparait une fenêtre décalée d'un à deux jours, et
 * `countBy` excluait les valeurs vides sans dire combien, si bien que
 * l'appelant divisait par le mauvais dénominateur. Aucun des deux ne lève
 * d'erreur — seul un chiffre attendu peut les attraper.
 *
 * Le fuseau est épinglé à `Europe/Paris` dans `vitest.config.ts`.
 */
import { describe, expect, it } from 'vitest';
import { spanInDays } from './dates';
import {
  byMonth,
  countBy,
  distribution,
  perAssignee,
  previousPeriod,
  summarise,
  trend,
  withTail,
} from './kpi';
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

/* ------------------------------------------------------------ previousPeriod */

describe('previousPeriod', () => {
  it('rend la fenêtre de même durée qui précède, pas le mois calendaire', () => {
    // Août fait 31 jours et juillet aussi : les deux coïncident.
    // La version fautive rendait pourtant 2026-06-30 → 2026-07-30.
    expect(previousPeriod('2026-08-01', '2026-08-31')).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });

    // Juillet fait 31 jours, juin 30 : la fenêtre antérieure de **même
    // durée** déborde donc sur le 31 mai. C'est voulu — comparer 31 jours à
    // 30 fausserait la variation de trois points sur un volume constant.
    // (La version fautive rendait 2026-05-30 → 2026-06-29.)
    expect(previousPeriod('2026-07-01', '2026-07-31')).toEqual({
      from: '2026-05-31',
      to: '2026-06-30',
    });
  });

  it('rend toujours une fenêtre de la même longueur que la courante', () => {
    for (const [from, to] of [
      ['2026-08-01', '2026-08-31'],
      ['2026-07-01', '2026-07-31'],
      ['2026-02-01', '2026-02-28'],
      ['2026-03-15', '2026-04-02'],
    ]) {
      const prev = previousPeriod(from, to)!;
      expect(spanInDays(prev.from, prev.to)).toBe(spanInDays(from, to));
    }
  });

  it('colle exactement à la fenêtre courante, sans trou ni chevauchement', () => {
    const current = { from: '2026-08-21', to: '2026-08-27' }; // 7 jours
    const previous = previousPeriod(current.from, current.to)!;
    expect(previous).toEqual({ from: '2026-08-14', to: '2026-08-20' });
    // La veille du début courant est bien la fin de la période précédente.
    expect(previous.to).toBe('2026-08-20');
  });

  it('franchit une année', () => {
    expect(previousPeriod('2026-01-01', '2026-01-31')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('résiste au passage à l’heure d’été', () => {
    // Avril suit un mois de 31 jours dont un ne fait que 23 heures : le calcul
    // en millisecondes y perdait une borne.
    expect(previousPeriod('2026-04-01', '2026-04-30')).toEqual({
      from: '2026-03-02',
      to: '2026-03-31',
    });
    // Et le retour à l'heure d'hiver, un jour de 25 heures.
    expect(previousPeriod('2026-11-01', '2026-11-30')).toEqual({
      from: '2026-10-02',
      to: '2026-10-31',
    });
  });

  it('gère une plage d’un seul jour', () => {
    expect(previousPeriod('2026-08-27', '2026-08-27')).toEqual({
      from: '2026-08-26',
      to: '2026-08-26',
    });
  });

  it('renvoie null sans bornes exploitables', () => {
    expect(previousPeriod('', '')).toBeNull();
    expect(previousPeriod('2026-08-01', '')).toBeNull();
    expect(previousPeriod('2026-08-31', '2026-08-01')).toBeNull();
  });
});

/* ------------------------------------------------------------------- countBy */

describe('countBy', () => {
  const leads = [
    lead({ id: 'a', motive: 'Devis' }),
    lead({ id: 'b', motive: 'Devis' }),
    lead({ id: 'c', motive: 'Abonnement' }),
    lead({ id: 'd', motive: '' }),
    lead({ id: 'e', motive: '   ' }),
  ];

  it('expose la couverture à côté du total', () => {
    const { slices, covered, total } = countBy(leads, (l) => l.motive);
    expect(total).toBe(5);
    // C'est ce chiffre qui sert de dénominateur : diviser par 5 donnerait 40 %
    // à un motif qui pèse en réalité les deux tiers des motifs renseignés.
    expect(covered).toBe(3);
    expect(slices).toEqual([
      { label: 'Devis', count: 2 },
      { label: 'Abonnement', count: 1 },
    ]);
  });

  it('la somme des tranches vaut la couverture, jamais le total', () => {
    const { slices, covered } = countBy(leads, (l) => l.motive);
    expect(slices.reduce((s, x) => s + x.count, 0)).toBe(covered);
  });

  it('trie par fréquence puis par libellé, en français', () => {
    const { slices } = countBy(
      [
        lead({ id: 'a', partner: 'Zed' }),
        lead({ id: 'b', partner: 'Élan' }),
        lead({ id: 'c', partner: 'Alpha' }),
      ],
      (l) => l.partner,
    );
    expect(slices.map((s) => s.label)).toEqual(['Alpha', 'Élan', 'Zed']);
  });

  it('ne compte rien sur une liste vide', () => {
    expect(countBy([], (l) => l.motive)).toEqual({ slices: [], covered: 0, total: 0 });
  });
});

/* ------------------------------------------------------------------ withTail */

describe('withTail', () => {
  const slices = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ label: `l${i}`, count: n - i }));

  it('ne replie rien tant qu’une seule tranche dépasserait', () => {
    // keep + 1 tranches : replier la dernière la remplacerait par « Autres »
    // sans rien gagner en lisibilité.
    expect(withTail(slices(4), 3)).toHaveLength(4);
  });

  it('replie la queue dès qu’elle en vaut la peine', () => {
    const folded = withTail(slices(6), 3);
    expect(folded).toHaveLength(4);
    expect(folded[3]).toEqual({ label: 'Autres', count: 3 + 2 + 1 });
  });

  it('conserve le total en repliant', () => {
    const before = slices(10).reduce((s, x) => s + x.count, 0);
    const after = withTail(slices(10), 4).reduce((s, x) => s + x.count, 0);
    expect(after).toBe(before);
  });

  it('omet « Autres » quand la queue est à zéro', () => {
    const withZeros = [...slices(3), { label: 'z1', count: 0 }, { label: 'z2', count: 0 }];
    expect(withTail(withZeros, 3).map((s) => s.label)).toEqual(['l0', 'l1', 'l2']);
  });
});

describe('distribution', () => {
  it('replie la queue sans toucher à la couverture', () => {
    const leads = ['a', 'b', 'c', 'd', 'e'].map((k, i) =>
      lead({ id: k, partner: `P${i}` }),
    );
    const d = distribution([...leads, lead({ id: 'vide' })], (l) => l.partner, 2);
    expect(d.covered).toBe(5);
    expect(d.total).toBe(6);
    // Les tranches repliées totalisent toujours la couverture.
    expect(d.slices.reduce((s, x) => s + x.count, 0)).toBe(5);
  });
});

/* ---------------------------------------------------------------- summarise */

describe('summarise', () => {
  const now = Date.parse('2026-08-27T12:00:00Z');
  const daysBefore = (n: number) =>
    new Date(now - n * 86_400_000).toISOString();

  it('laisse le taux de qualification à null tant que rien n’est tranché', () => {
    const s = summarise([lead({ id: 'a' }), lead({ id: 'b', status: 'A contacter' })], now);
    expect(s.qualificationRate).toBeNull();
  });

  it('calcule la qualification sur les seules demandes tranchées', () => {
    const s = summarise(
      [
        lead({ id: 'a', status: 'Qualifié' }),
        lead({ id: 'b', status: 'Qualifié' }),
        lead({ id: 'c', status: 'Hors Critères' }),
        // Non tranchées : elles ne doivent pas faire baisser le taux.
        lead({ id: 'd', status: 'Nouveau' }),
        lead({ id: 'e', status: 'A relancer' }),
      ],
      now,
    );
    expect(s.qualificationRate).toBeCloseTo(2 / 3);
  });

  it('range les signées du côté des retenues', () => {
    // Une demande signée a forcément été qualifiée : elle a avancé d'un cran,
    // elle n'a pas été refusée. La compter à part ferait baisser le taux de
    // qualification à chaque signature.
    const s = summarise(
      [
        lead({ id: 'a', status: 'Qualifié' }),
        lead({ id: 'b', status: 'Signé' }),
        lead({ id: 'c', status: 'Hors Critères' }),
      ],
      now,
    );
    expect(s.signed).toBe(1);
    expect(s.qualified).toBe(1);
    expect(s.qualificationRate).toBeCloseTo(2 / 3);
  });

  it('isole un statut hors référentiel au lieu de l’absorber', () => {
    const s = summarise(
      [
        lead({ id: 'a', status: 'Nouveau' }),
        lead({ id: 'b', status: 'Qualifié' }),
        lead({ id: 'c', status: '2026-03-01 14:22' as Lead['status'] }),
      ],
      now,
    );
    expect(s.total).toBe(3);
    expect(s.unknownStatus).toBe(1);
    // Le compte des barres est cohérent avec ce qui reste lisible.
    const barred = Object.values(s.byStatus).reduce((x, y) => x + y, 0);
    expect(barred).toBe(s.total - s.unknownStatus);
    // Une demande illisible n'est pas une demande traitée : 1 sur 2, pas 2 sur 3.
    expect(s.handledRate).toBeCloseTo(1 / 2);
  });

  it('compte comme non assignée une demande sans lien ni nom', () => {
    const s = summarise(
      [
        lead({ id: 'a' }),
        lead({ id: 'b', assigneeIds: ['recX'], assigneeNames: ['Ada'] }),
        // Saisie texte historique : assignée, même sans lien RH.
        lead({ id: 'c', assigneeNames: ['Fred'] }),
      ],
      now,
    );
    expect(s.unassigned).toBe(1);
  });

  it('médiane sur un nombre impair puis pair de valeurs', () => {
    const odd = summarise(
      [1, 5, 9].map((d, i) => lead({ id: `o${i}`, date: daysBefore(d) })),
      now,
    );
    expect(odd.medianUntouchedAge).toBe(5);

    const even = summarise(
      [1, 4, 6, 9].map((d, i) => lead({ id: `e${i}`, date: daysBefore(d) })),
      now,
    );
    expect(even.medianUntouchedAge).toBe(5);
  });

  it('ne mesure l’ancienneté que sur les demandes non traitées', () => {
    const s = summarise(
      [
        lead({ id: 'a', date: daysBefore(40) }),
        lead({ id: 'b', status: 'Qualifié', date: daysBefore(400) }),
      ],
      now,
    );
    expect(s.medianUntouchedAge).toBe(40);
    expect(s.staleCount).toBe(1);
  });

  it('applique le seuil strictement au-delà de 14 jours', () => {
    const s = summarise(
      [
        lead({ id: 'pile', date: daysBefore(14) }),
        lead({ id: 'apres', date: daysBefore(15) }),
      ],
      now,
    );
    expect(s.staleCount).toBe(1);
  });

  it('reste neutre sur un ensemble vide', () => {
    const s = summarise([], now);
    expect(s).toMatchObject({
      total: 0,
      unassigned: 0,
      untouched: 0,
      staleCount: 0,
      unknownStatus: 0,
      qualificationRate: null,
      handledRate: null,
      medianUntouchedAge: null,
    });
  });
});

/* -------------------------------------------------------------- perAssignee */

describe('perAssignee', () => {
  it('compte une demande partagée pour chacun', () => {
    const rows = perAssignee([
      lead({ id: 'a', assigneeIds: ['1', '2'], assigneeNames: ['Ada', 'Bob'] }),
      lead({ id: 'b', assigneeIds: ['1'], assigneeNames: ['Ada'] }),
    ]);
    expect(rows.map((r) => [r.name, r.total])).toEqual([
      ['Ada', 2],
      ['Bob', 1],
    ]);
  });

  it('regroupe les non assignées sous une ligne à part', () => {
    const rows = perAssignee([lead({ id: 'a' }), lead({ id: 'b' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Non assigné', total: 2, untouched: 2 });
  });

  it('ne compte dans « untouched » que le statut Nouveau', () => {
    const rows = perAssignee([
      lead({ id: 'a', assigneeIds: ['1'], assigneeNames: ['Ada'] }),
      lead({
        id: 'b',
        status: 'A contacter',
        assigneeIds: ['1'],
        assigneeNames: ['Ada'],
      }),
    ]);
    expect(rows[0]).toMatchObject({ total: 2, untouched: 1 });
  });
});

/* ------------------------------------------------------------------ byMonth */

describe('byMonth', () => {
  it('garde les mois sans demande, à zéro', () => {
    const points = byMonth([
      lead({ id: 'a', date: '2026-01-15T10:00:00+01:00' }),
      lead({ id: 'b', date: '2026-04-02T10:00:00+02:00' }),
    ]);
    expect(points.map((p) => p.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(points.map((p) => p.count)).toEqual([1, 0, 0, 1]);
  });

  it('franchit une fin d’année', () => {
    const points = byMonth([
      lead({ id: 'a', date: '2025-11-10T10:00:00+01:00' }),
      lead({ id: 'b', date: '2026-01-10T10:00:00+01:00' }),
    ]);
    expect(points.map((p) => p.key)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('ne fait pas basculer une demande de fin de mois', () => {
    // 23 h 30 le 31 juillet à Paris reste en juillet, pas en août.
    const points = byMonth([lead({ id: 'a', date: '2026-07-31T23:30:00+02:00' })]);
    expect(points).toEqual([{ key: '2026-07', label: expect.any(String), count: 1 }]);
  });

  it('ignore une date illisible sans casser la série', () => {
    const points = byMonth([
      lead({ id: 'a', date: 'pas une date' }),
      lead({ id: 'b', date: '2026-05-05T10:00:00+02:00' }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].count).toBe(1);
  });

  it('rend une série vide sans donnée', () => {
    expect(byMonth([])).toEqual([]);
  });
});

/* -------------------------------------------------------------------- trend */

describe('trend', () => {
  it('mesure la variation relative', () => {
    expect(trend(150, 100)).toBeCloseTo(0.5);
    expect(trend(50, 100)).toBeCloseTo(-0.5);
    expect(trend(100, 100)).toBe(0);
  });

  it('refuse de partir de zéro plutôt que d’annoncer +100 %', () => {
    expect(trend(10, 0)).toBeNull();
  });
});
