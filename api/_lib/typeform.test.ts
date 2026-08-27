import { describe, expect, it } from 'vitest';
import { VARIABLE_KEYS, variableNumber, variableText, type TypeformVariable } from './typeform';

/**
 * Extrait d'un payload réel (formulaire gbPj3B1m, 2026-08-26).
 *
 * Les types sont reproduits fidèlement, y compris l'incohérence de la source :
 * l'effectif arrive en nombre, le chiffre d'affaires en texte.
 */
const VARIABLES: TypeformVariable[] = [
  { key: 'counter_86289aaa', type: 'number', number: 0 },
  { key: 'score', type: 'number', number: 4 },
  { key: 'tag_lead_quality', type: 'text', text: 'Low' },
  { key: 'winning_outcome_id', type: 'outcome_id', outcome_id: '84Cy8jSOWd5I' },
  { key: 'enr_company_name', type: 'text', text: 'SunLib' },
  { key: 'enr_company_employee_count', type: 'number', number: 23 },
  { key: 'enr_company_annual_revenue', type: 'text', text: '1000000' },
];

describe('variableNumber', () => {
  it('lit un nombre transmis comme nombre', () => {
    expect(variableNumber(VARIABLES, VARIABLE_KEYS.score)).toBe(4);
    expect(variableNumber(VARIABLES, VARIABLE_KEYS.companyEmployees)).toBe(23);
  });

  it('lit un nombre transmis comme texte', () => {
    // `enr_company_annual_revenue` arrive en chaîne là où l'effectif arrive en
    // nombre : accepter une seule des deux formes viderait un champ sur deux.
    expect(variableNumber(VARIABLES, VARIABLE_KEYS.companyRevenue)).toBe(1_000_000);
  });

  it('distingue zéro d’une valeur absente', () => {
    // Le point le plus important : le webhook écrit avec `typecast: false` et
    // n'envoie le champ que si la valeur n'est pas `undefined`. Un zéro
    // fabriqué à la place d'un « rien » serait indiscernable d'un vrai zéro.
    expect(variableNumber(VARIABLES, 'counter_86289aaa')).toBe(0);
    expect(variableNumber(VARIABLES, 'enr_company_founded_year')).toBeUndefined();
  });

  it('ignore un texte non numérique plutôt que de rendre NaN', () => {
    const vars: TypeformVariable[] = [{ key: 'x', type: 'text', text: 'beaucoup' }];
    expect(variableNumber(vars, 'x')).toBeUndefined();
  });

  it('ignore une chaîne vide', () => {
    // `Number('')` vaut 0 : sans garde, un champ vide deviendrait un zéro.
    const vars: TypeformVariable[] = [{ key: 'x', type: 'text', text: '   ' }];
    expect(variableNumber(vars, 'x')).toBeUndefined();
  });
});

describe('variableText', () => {
  it('lit une variable texte', () => {
    expect(variableText(VARIABLES, VARIABLE_KEYS.leadQuality)).toBe('Low');
    expect(variableText(VARIABLES, VARIABLE_KEYS.companyName)).toBe('SunLib');
  });

  it('rend une chaîne vide pour une variable absente', () => {
    // L'enrichissement peut être désactivé côté Typeform : les clés
    // disparaissent alors du payload, sans que rien ne le signale.
    expect(variableText(VARIABLES, VARIABLE_KEYS.companyDomain)).toBe('');
  });

  it('ne rend pas le contenu d’une variable d’un autre type', () => {
    // `winning_outcome_id` porte sa valeur dans `outcome_id`, pas dans `text`.
    expect(variableText(VARIABLES, 'winning_outcome_id')).toBe('');
    expect(variableText(VARIABLES, VARIABLE_KEYS.score)).toBe('');
  });
});
