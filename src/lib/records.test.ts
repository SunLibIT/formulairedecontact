import { describe, expect, it } from 'vitest';
import { formatAddress, formatLocality, type Lead } from './records';

/** Adresse complète, dont chaque test ne garde que les morceaux qui l'intéressent. */
const address = (partial: Partial<Lead['address']> = {}): Lead['address'] => ({
  line1: '',
  line2: '',
  city: '',
  postalCode: '',
  department: '',
  region: '',
  country: '',
  ...partial,
});

describe('formatLocality', () => {
  it('met le code postal devant la ville', () => {
    expect(formatLocality(address({ postalCode: '69100', city: 'Villeurbanne' }))).toBe(
      '69100 Villeurbanne',
    );
  });

  it('restitue le zéro initial mangé par un export tableur', () => {
    expect(formatLocality(address({ postalCode: '1000', city: 'Bourg-en-Bresse' }))).toBe(
      '01000 Bourg-en-Bresse',
    );
  });

  it('ne laisse pas d’espace en trop quand un morceau manque', () => {
    expect(formatLocality(address({ city: 'Lyon' }))).toBe('Lyon');
    expect(formatLocality(address({ postalCode: '75008' }))).toBe('75008');
    expect(formatLocality(address())).toBe('');
  });
});

describe('formatAddress', () => {
  it('assemble rue, localité et pays', () => {
    expect(
      formatAddress(
        address({
          line1: '12 rue des Lilas',
          line2: 'Bât. B',
          postalCode: '69100',
          city: 'Villeurbanne',
          country: 'France',
        }),
      ),
    ).toBe('12 rue des Lilas, Bât. B, 69100 Villeurbanne, France');
  });

  it('ne produit pas de virgule orpheline sur une adresse partielle', () => {
    expect(formatAddress(address({ city: 'Lyon', country: 'France' }))).toBe('Lyon, France');
    expect(formatAddress(address({ line1: '12 rue des Lilas' }))).toBe('12 rue des Lilas');
    expect(formatAddress(address())).toBe('');
  });
});
