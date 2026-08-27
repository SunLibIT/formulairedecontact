import { describe, expect, it } from 'vitest';
import {
  buildMarketingExport,
  departmentCode,
  eligibleForCampaign,
  exportFilename,
  marketingSegment,
  monthKey,
  normaliseEmail,
  normalisePostalCode,
  phoneE164,
  quarterKey,
  toCsv,
} from './marketingExport';
import type { Lead } from './records';

/** Lead minimal complet, à surcharger champ par champ dans chaque test. */
function lead(patch: Partial<Lead> = {}): Lead {
  return {
    id: 'rec1',
    source: 'contact',
    ref: 'resp-1',
    date: '2026-08-20T09:30:00.000Z',
    firstName: 'jean',
    lastName: 'dupont',
    fullName: 'jean dupont',
    email: 'Jean.Dupont@Example.com',
    phone: '0658706444',
    company: '',
    category: 'Un particulier',
    motive: "Obtenir un devis d'abonnement solaire",
    message: '',
    address: {
      line1: '3 rue des Lilas',
      line2: '',
      city: 'Lyon',
      postalCode: '69003',
      department: '',
      region: 'Auvergne-Rhône-Alpes',
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

describe('eligibleForCampaign', () => {
  it('accepte un consentement explicitement coché', () => {
    expect(eligibleForCampaign(lead({ gdprConsent: true }))).toBe(true);
  });

  it('refuse une absence de consentement, quelle qu’en soit la raison', () => {
    // Case décochée et reprise historique sans colonne sont indistinguables :
    // les deux sont écartées.
    expect(eligibleForCampaign(lead({ gdprConsent: false }))).toBe(false);
  });
});

describe('marketingSegment', () => {
  it('mappe les types du formulaire de contact', () => {
    expect(marketingSegment(lead({ category: 'Un particulier' }))).toBe('Particulier');
    expect(marketingSegment(lead({ category: 'Un installateur' }))).toBe('Installateur');
    expect(marketingSegment(lead({ category: 'Une entreprise' }))).toBe('Professionnel');
    expect(marketingSegment(lead({ category: 'Une collectivité' }))).toBe('Collectivité');
    expect(marketingSegment(lead({ category: 'Abonné SunLib' }))).toBe('Abonné');
  });

  it('rapproche le vocabulaire du simulateur de celui du formulaire', () => {
    // Les deux tunnels doivent tomber dans le même segment de campagne.
    expect(marketingSegment(lead({ source: 'solar', category: 'Particulier' }))).toBe(
      'Particulier',
    );
    expect(marketingSegment(lead({ source: 'solar', category: 'Professionnel' }))).toBe(
      'Professionnel',
    );
  });

  it('tolère casse, accents et apostrophes typographiques', () => {
    expect(marketingSegment(lead({ category: 'UNE COLLECTIVITE' }))).toBe('Collectivité');
    expect(marketingSegment(lead({ category: 'abonné sunlib' }))).toBe('Abonné');
  });

  it('déduit du motif quand le type est absent', () => {
    expect(
      marketingSegment(
        lead({ category: '', motive: 'Devenir partenaire installateur SunLib' }),
      ),
    ).toBe('Installateur');
  });

  it('retombe sur la raison sociale, puis sur Indéterminé', () => {
    expect(marketingSegment(lead({ category: '', motive: '', company: 'EDF' }))).toBe(
      'Professionnel',
    );
    expect(marketingSegment(lead({ category: '', motive: '', company: '' }))).toBe(
      'Indéterminé',
    );
  });

  it('ne devine jamais un segment pour un type inconnu', () => {
    // Un libellé ajouté dans Typeform ne doit pas être rangé au hasard.
    expect(marketingSegment(lead({ category: 'Un syndic', company: '' }))).toBe(
      'Indéterminé',
    );
  });
});

describe('normalisePostalCode', () => {
  it('restitue le zéro initial perdu par Excel', () => {
    expect(normalisePostalCode('1000')).toBe('01000');
  });

  it('nettoie les séparateurs de saisie', () => {
    expect(normalisePostalCode('69 003')).toBe('69003');
  });

  it('renvoie une chaîne vide sans chiffre exploitable', () => {
    expect(normalisePostalCode('')).toBe('');
    expect(normalisePostalCode('inconnu')).toBe('');
  });
});

describe('departmentCode', () => {
  it('préfère le champ Airtable quand il est renseigné', () => {
    const l = lead({
      address: { ...lead().address, department: '69', postalCode: '75001' },
    });
    expect(departmentCode(l)).toBe('69');
  });

  it('dérive du code postal à défaut', () => {
    expect(departmentCode(lead({ address: { ...lead().address, postalCode: '69003' } }))).toBe(
      '69',
    );
  });

  it('donne trois chiffres en outre-mer', () => {
    expect(departmentCode(lead({ address: { ...lead().address, postalCode: '97400' } }))).toBe(
      '974',
    );
    expect(departmentCode(lead({ address: { ...lead().address, postalCode: '98800' } }))).toBe(
      '988',
    );
  });

  it('laisse la Corse en 20, faute de pouvoir trancher 2A/2B', () => {
    expect(departmentCode(lead({ address: { ...lead().address, postalCode: '20000' } }))).toBe(
      '20',
    );
  });
});

describe('monthKey / quarterKey', () => {
  it('produit des clés triables comme du texte', () => {
    expect(monthKey('2026-08-20T09:30:00.000Z')).toBe('2026-08');
    expect(quarterKey('2026-08-20T09:30:00.000Z')).toBe('2026-T3');
    expect(quarterKey('2026-01-05T00:00:00.000Z')).toBe('2026-T1');
    expect(quarterKey('2026-12-31T00:00:00.000Z')).toBe('2026-T4');
  });

  it('reste vide sur une date illisible plutôt que d’inventer', () => {
    expect(monthKey('pas une date')).toBe('');
    expect(quarterKey('')).toBe('');
  });
});

describe('phoneE164', () => {
  it('convertit le national français en international', () => {
    expect(phoneE164('0658706444')).toBe('+33658706444');
    expect(phoneE164('06 58 70 64 44')).toBe('+33658706444');
  });

  it('conserve un numéro déjà international', () => {
    expect(phoneE164('+33 6 58 70 64 44')).toBe('+33658706444');
    expect(phoneE164('0033658706444')).toBe('+33658706444');
  });

  it('renvoie tel quel un numéro non reconnu plutôt que mutilé', () => {
    expect(phoneE164('poste 4412')).toBe('poste 4412');
    expect(phoneE164('')).toBe('');
  });
});

describe('normaliseEmail', () => {
  it('rend les adresses comparables', () => {
    expect(normaliseEmail('  Jean.Dupont@Example.COM ')).toBe('jean.dupont@example.com');
  });
});

describe('buildMarketingExport', () => {
  it('écarte les leads sans consentement et les compte', () => {
    const result = buildMarketingExport(
      [lead({ id: 'a' }), lead({ id: 'b', gdprConsent: false }), lead({ id: 'c' })],
      NOW,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.excluded).toBe(1);
  });

  it('signale les lignes sans email sans les filtrer', () => {
    const result = buildMarketingExport([lead({ email: '' }), lead()], NOW);
    expect(result.rows).toHaveLength(2);
    expect(result.withoutEmail).toBe(1);
    expect(result.uniqueEmails).toBe(1);
  });

  it('compte les adresses distinctes, casse et espaces ignorés', () => {
    const result = buildMarketingExport(
      [lead({ email: 'a@b.fr' }), lead({ email: ' A@B.FR ' }), lead({ email: 'c@d.fr' })],
      NOW,
    );
    expect(result.rows).toHaveLength(3); // les doublons restent dans le fichier
    expect(result.uniqueEmails).toBe(2);
  });

  it('remplit les colonnes dérivées attendues', () => {
    const { headers, rows } = buildMarketingExport([lead()], NOW);
    const cell = (header: string) => rows[0][headers.indexOf(header)];

    expect(cell('Email')).toBe('jean.dupont@example.com');
    expect(cell('Prénom')).toBe('Jean');
    expect(cell('Nom')).toBe('Dupont');
    expect(cell('Téléphone')).toBe('+33658706444');
    expect(cell('Segment')).toBe('Particulier');
    expect(cell('Catégorie')).toBe('Particulier');
    expect(cell('Motif')).toBe('Devis');
    expect(cell('Département')).toBe('69');
    expect(cell('Date de la demande')).toBe('2026-08-20');
    expect(cell('Ancienneté (jours)')).toBe('7');
    expect(cell('Mois')).toBe('2026-08');
    expect(cell('Trimestre')).toBe('2026-T3');
    expect(cell('Source')).toBe('Formulaire de contact');
  });

  it('calcule toutes les lignes au même instant', () => {
    // `now` injecté : sans lui l'ancienneté dépendrait de l'heure d'exécution.
    const { headers, rows } = buildMarketingExport([lead(), lead({ id: 'b' })], NOW);
    const age = headers.indexOf('Ancienneté (jours)');
    expect(rows[0][age]).toBe(rows[1][age]);
  });

  it('produit un fichier à en-têtes seuls quand rien n’est éligible', () => {
    const result = buildMarketingExport([lead({ gdprConsent: false })], NOW);
    expect(result.rows).toHaveLength(0);
    expect(result.excluded).toBe(1);
    expect(toCsv(result).split('\r\n')[0]).toContain('Email');
  });
});

describe('toCsv', () => {
  it('ouvre sur le BOM UTF-8, sans quoi Excel casse les accents', () => {
    const csv = toCsv({ headers: ['Nom'], rows: [['Sébastien']] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('sépare par des points-virgules et termine les lignes en CRLF', () => {
    const csv = toCsv({ headers: ['A', 'B'], rows: [['1', '2']] });
    expect(csv.slice(1)).toBe('A;B\r\n1;2\r\n');
  });

  it('protège les cellules contenant le séparateur, un guillemet ou un saut de ligne', () => {
    const csv = toCsv({
      headers: ['X'],
      rows: [['Durand; Fils'], ['Dit "Le Grand"'], ['deux\nlignes']],
    });
    expect(csv).toContain('"Durand; Fils"');
    expect(csv).toContain('"Dit ""Le Grand"""');
    expect(csv).toContain('"deux\nlignes"');
  });

  it('neutralise une formule saisie dans le formulaire', () => {
    // Les données viennent d'un formulaire public : Excel ne doit rien évaluer.
    const csv = toCsv({ headers: ['Nom'], rows: [['=HYPERLINK("http://x","clic")']] });
    expect(csv).toContain("'=HYPERLINK");
    expect(toCsv({ headers: ['N'], rows: [['@SUM(A1)']] })).toContain("'@SUM");
  });

  it('laisse intact un numéro de téléphone, malgré son + initial', () => {
    // Neutraliser ici produirait l'apostrophe parasite que `formatPhone` doit
    // aujourd'hui nettoyer à la relecture.
    const csv = toCsv({ headers: ['Tel'], rows: [['+33658706444']] });
    expect(csv).toContain('+33658706444');
    expect(csv).not.toContain("'+33");
  });
});

describe('exportFilename', () => {
  it('nomme le fichier par périmètre et date d’extraction', () => {
    expect(exportFilename('contact', NOW)).toBe(
      'sunlib-marketing-demandes-contact-2026-08-27.csv',
    );
    expect(exportFilename('solar', NOW)).toBe(
      'sunlib-marketing-leads-simulateur-2026-08-27.csv',
    );
  });
});
