import { describe, expect, it } from 'vitest';
import {
  ageInDays,
  ageTone,
  DEFAULT_AGE_THRESHOLDS,
  formatAge,
  formatPersonName,
  formatPhone,
} from './format';

describe('formatPhone', () => {
  it('ramène un +33 à la forme nationale groupée par deux', () => {
    expect(formatPhone('+33658706444')).toBe('06 58 70 64 44');
    expect(formatPhone('+33612345678')).toBe('06 12 34 56 78');
  });

  it('groupe un numéro national déjà en 0X', () => {
    expect(formatPhone('0658706444')).toBe('06 58 70 64 44');
  });

  it('tolère les séparateurs de saisie', () => {
    expect(formatPhone('+33 6 58 70 64 44')).toBe('06 58 70 64 44');
    expect(formatPhone('06.58.70.64.44')).toBe('06 58 70 64 44');
    expect(formatPhone('06-58-70-64-44')).toBe('06 58 70 64 44');
  });

  it("retire l'apostrophe d'import Excel", () => {
    expect(formatPhone("'+33764428525")).toBe('07 64 42 85 25');
  });

  it('conserve l’indicatif pour un numéro étranger', () => {
    expect(formatPhone('+34612345678')).toBe('+34 612 34 56 78');
    expect(formatPhone('+31644384676')).toBe('+31 644 38 46 76');
    expect(formatPhone('+41791234567')).toBe('+41 791 23 45 67');
    expect(formatPhone('+352621123456')).toBe('+352 621 12 34 56');
    expect(formatPhone('+262692123456')).toBe('+262 692 12 34 56');
    expect(formatPhone('+447911123456')).toBe('+44 79 11 12 34 56');
    expect(formatPhone('0031644384676')).toBe('+31 644 38 46 76');
  });

  it('renvoie l’entrée telle quelle si elle ne contient aucun chiffre', () => {
    expect(formatPhone('non renseigné')).toBe('non renseigné');
    expect(formatPhone('')).toBe('');
    expect(formatPhone('   ')).toBe('');
  });
});

describe('formatPersonName', () => {
  it('uniformise les capitales et les minuscules', () => {
    expect(formatPersonName('Thibaut BONNET')).toBe('Thibaut Bonnet');
    expect(formatPersonName('rania kamal')).toBe('Rania Kamal');
    expect(formatPersonName('SÉBASTIEN BAUR')).toBe('Sébastien Baur');
  });

  it('préserve les tirets et les apostrophes', () => {
    expect(formatPersonName('jean-claude FLACHAIRE')).toBe('Jean-Claude Flachaire');
    expect(formatPersonName("d'angelo")).toBe("D'Angelo");
    expect(formatPersonName('MARIE-JOSÉ o’brien')).toBe('Marie-José O’Brien');
  });

  it('garde les particules en minuscules au milieu du nom', () => {
    expect(formatPersonName('EDOUARD DA SILVA')).toBe('Edouard da Silva');
    expect(formatPersonName('charles DE gaulle')).toBe('Charles de Gaulle');
  });

  it('ne met pas une particule en minuscule si elle ouvre le nom', () => {
    expect(formatPersonName('DE VRIES')).toBe('De Vries');
  });

  it('met aussi en casse de titre les patronymes courts', () => {
    // On ne tente pas de deviner un sigle : `BAUR` et `SARL` ont la même
    // allure, et une heuristique se tromperait dans un sens ou dans l'autre.
    // Les raisons sociales ne passent pas par cette fonction.
    expect(formatPersonName('Sébastien BAUR')).toBe('Sébastien Baur');
    expect(formatPersonName('KAMAL')).toBe('Kamal');
  });

  it('resserre les espaces superflus', () => {
    expect(formatPersonName('  camille   DURAND  ')).toBe('Camille Durand');
    expect(formatPersonName('')).toBe('');
  });
});

describe('ageInDays', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');

  it('compte les jours entiers écoulés', () => {
    expect(ageInDays('2026-08-26T09:00:00Z', now)).toBe(0);
    expect(ageInDays('2026-08-25T09:00:00Z', now)).toBe(1);
    expect(ageInDays('2026-08-19T12:00:00Z', now)).toBe(7);
  });

  it('ne renvoie jamais de valeur négative pour une date future', () => {
    expect(ageInDays('2026-09-01T00:00:00Z', now)).toBe(0);
  });

  it('renvoie null sur une date illisible', () => {
    expect(ageInDays('pas une date', now)).toBeNull();
    expect(ageInDays('', now)).toBeNull();
  });
});

describe('formatAge', () => {
  it('abrège selon l’échelle', () => {
    expect(formatAge(0)).toBe('auj.');
    expect(formatAge(1)).toBe('1 j');
    expect(formatAge(12)).toBe('12 j');
    expect(formatAge(60)).toBe('2 mois');
    expect(formatAge(400)).toBe('1 an');
    expect(formatAge(800)).toBe('2 ans');
  });

  it('affiche un tiret quand la date manque', () => {
    expect(formatAge(null)).toBe('—');
  });
});

describe('ageTone', () => {
  it('applique les seuils par défaut : neutre < 3, ambre >= 3, rouge >= 7', () => {
    expect(ageTone(0)).toBe('neutral');
    expect(ageTone(2)).toBe('neutral');
    expect(ageTone(3)).toBe('action');
    expect(ageTone(6)).toBe('action');
    expect(ageTone(7)).toBe('rejected');
    expect(ageTone(90)).toBe('rejected');
  });

  it('accepte des seuils personnalisés', () => {
    const strict = { warn: 1, alert: 2 };
    expect(ageTone(0, strict)).toBe('neutral');
    expect(ageTone(1, strict)).toBe('action');
    expect(ageTone(2, strict)).toBe('rejected');
  });

  it('reste neutre sans date', () => {
    expect(ageTone(null)).toBe('neutral');
  });

  it('expose des seuils par défaut cohérents', () => {
    expect(DEFAULT_AGE_THRESHOLDS.warn).toBeLessThan(DEFAULT_AGE_THRESHOLDS.alert);
  });
});
