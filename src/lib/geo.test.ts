import { describe, expect, it } from 'vitest';
import { displayPostalCode, isForeignCountry } from './geo';

describe('isForeignCountry', () => {
  it('tient un pays vide, la France et l’outre-mer pour français', () => {
    for (const c of ['', '  ', 'France', 'FRANCE', 'fr', 'La Réunion', 'Guadeloupe', 'Mayotte']) {
      expect(isForeignCountry(c)).toBe(false);
    }
  });

  it('reconnaît un pays étranger', () => {
    for (const c of ['Pays-Bas', 'Belgique', 'Suisse', 'Luxembourg', 'España']) {
      expect(isForeignCountry(c)).toBe(true);
    }
  });
});

describe('displayPostalCode', () => {
  it('normalise en France (zéro initial restitué)', () => {
    expect(displayPostalCode('1000', 'France')).toBe('01000');
    expect(displayPostalCode('69100', '')).toBe('69100');
  });

  it('garde la saisie à l’étranger', () => {
    expect(displayPostalCode('3438 MW', 'Pays-Bas')).toBe('3438 MW');
    expect(displayPostalCode(' 1000 ', 'Belgique')).toBe('1000');
  });
});
