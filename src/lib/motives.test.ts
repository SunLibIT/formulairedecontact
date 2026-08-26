import { describe, expect, it } from 'vitest';
import { hasShortMotive, knownMotives, shortMotive } from './motives';

describe('shortMotive', () => {
  it('abrège les quatre motifs du formulaire de production', () => {
    expect(shortMotive('Devenir partenaire installateur SunLib')).toBe(
      'Partenariat installateur',
    );
    expect(shortMotive("Avoir plus d'informations sur l'abonnement SunLib")).toBe(
      'Abonnement',
    );
    expect(shortMotive("Obtenir un devis d'abonnement solaire")).toBe('Devis');
    expect(shortMotive("Être contacté(e) par SunLib pour d'autres motifs")).toBe(
      'Autre motif',
    );
  });

  it('résiste aux variations de casse, d’accents et d’espaces', () => {
    expect(shortMotive('DEVENIR PARTENAIRE INSTALLATEUR SUNLIB')).toBe(
      'Partenariat installateur',
    );
    expect(shortMotive('Etre contacte(e) par SunLib pour d’autres motifs')).toBe(
      'Autre motif',
    );
    expect(shortMotive('  Devenir   partenaire  installateur SunLib ')).toBe(
      'Partenariat installateur',
    );
  });

  it('accepte l’apostrophe typographique comme la droite', () => {
    expect(shortMotive('Obtenir un devis d’abonnement solaire')).toBe('Devis');
  });

  it('couvre les intitulés des anciennes versions du formulaire', () => {
    expect(shortMotive("Demande de devis d'abonnement")).toBe('Devis');
    expect(shortMotive("Demande d'information")).toBe('Information');
    expect(shortMotive('Demande de contact')).toBe('Prise de contact');
  });

  it('renvoie l’intitulé brut pour un motif inconnu', () => {
    const inedit = 'Je veux devenir revendeur de panneaux';
    expect(shortMotive(inedit)).toBe(inedit);
  });

  it('gère les valeurs vides sans planter', () => {
    expect(shortMotive('')).toBe('');
    expect(shortMotive('   ')).toBe('');
  });
});

describe('hasShortMotive', () => {
  it('distingue un motif connu d’un motif inédit', () => {
    expect(hasShortMotive('Devenir partenaire installateur SunLib')).toBe(true);
    expect(hasShortMotive('Un motif jamais vu')).toBe(false);
  });
});

describe('knownMotives', () => {
  it('expose les clés normalisées, sans accent ni capitale', () => {
    const keys = knownMotives();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toBe(key.toLowerCase());
      expect(key).not.toMatch(/[éèêëàâäîïôöùûüç]/);
      expect(key.trim()).toBe(key);
    }
  });

  it('produit un libellé court pour chacune de ses clés', () => {
    for (const key of knownMotives()) {
      expect(shortMotive(key)).not.toBe(key);
    }
  });
});
