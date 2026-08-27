/**
 * Ces fonctions existent parce que Paris et UTC ne sont pas le même jour au
 * même moment. Le fuseau est donc épinglé à `Europe/Paris` dans
 * `vitest.config.ts` — sans cela, les deux derniers cas passent sur une
 * machine en UTC et ne prouvent rien.
 */
import { describe, expect, it } from 'vitest';
import { dayIso, dayNumber, isoDay, shiftIso, spanInDays, todayIso } from './dates';

describe('dayNumber / dayIso', () => {
  it('fait l’aller-retour sans dériver, y compris en heure d’été', () => {
    for (const iso of ['2026-01-01', '2026-03-29', '2026-07-14', '2026-10-25', '2026-12-31']) {
      expect(dayIso(dayNumber(iso)!)).toBe(iso);
    }
  });

  it('compte les jours consécutifs à travers un changement d’heure', () => {
    // Dernier dimanche de mars 2026 : la journée ne fait que 23 heures.
    const before = dayNumber('2026-03-28')!;
    const after = dayNumber('2026-03-30')!;
    expect(after - before).toBe(2);
  });

  it('refuse ce qui n’est pas une date exploitable', () => {
    expect(dayNumber('')).toBeNull();
    expect(dayNumber('2026-08')).toBeNull();
    expect(dayNumber('pas une date')).toBeNull();
    // Date.UTC reporterait au 3 mars sans broncher.
    expect(dayNumber('2026-02-31')).toBeNull();
  });
});

describe('shiftIso', () => {
  it('franchit les bornes de mois et d’année', () => {
    expect(shiftIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftIso('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftIso('2024-02-28', 1)).toBe('2024-02-29'); // année bissextile
  });

  it('ne bouge pas d’un jour au passage à l’heure d’été', () => {
    expect(shiftIso('2026-03-29', -1)).toBe('2026-03-28');
    expect(shiftIso('2026-10-25', -1)).toBe('2026-10-24');
  });

  it('reste vide sur une borne illisible', () => {
    expect(shiftIso('', -7)).toBe('');
  });
});

describe('spanInDays', () => {
  it('compte les deux bornes, comme applyPeriod', () => {
    expect(spanInDays('2026-08-01', '2026-08-31')).toBe(31);
    expect(spanInDays('2026-08-27', '2026-08-27')).toBe(1);
  });

  it('refuse une plage à l’envers', () => {
    expect(spanInDays('2026-08-31', '2026-08-01')).toBeNull();
  });
});

describe('isoDay / todayIso', () => {
  it('donne le jour local, pas le jour UTC', () => {
    // 23 h 30 à Paris le 27 août est déjà le 27 en local mais 21 h 30 UTC le
    // même jour ; à 00 h 30 le 28, UTC est encore au 27. C'est ce second cas
    // qui faisait reculer les bornes.
    expect(isoDay(new Date('2026-08-27T23:30:00+02:00'))).toBe('2026-08-27');
    expect(isoDay(new Date('2026-08-28T00:30:00+02:00'))).toBe('2026-08-28');
  });

  it('accepte une date de référence explicite', () => {
    expect(todayIso(new Date('2026-01-01T00:15:00+01:00'))).toBe('2026-01-01');
  });
});
