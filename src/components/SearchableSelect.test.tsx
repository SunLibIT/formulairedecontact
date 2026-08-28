// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchableSelect } from './SearchableSelect';

/**
 * Le geste que ces tests protègent : lire le département du client, taper ce
 * numéro dans la recherche, assigner la personne qui le couvre.
 */
const GROUPS = ['Secteur 33', 'Commerciaux (sectorisation)', 'Autres collaborateurs'];

const OPTIONS = [
  // Non sectorisé : déclaré en premier exprès, pour que le tri par groupe se
  // voie dans le rendu.
  { value: 'recAlice', label: 'Alice', group: 'Autres collaborateurs' },
  { value: 'recIlan', label: 'Ilan B', hint: '18, 28, 75', group: 'Commerciaux (sectorisation)' },
  // Le commercial du secteur : son complément dit « Secteur 33 », mais il
  // couvre aussi le 47.
  {
    value: 'recEdouard',
    label: 'Edouard Da Silva',
    hint: 'Secteur 33',
    keywords: '33, 47',
    group: 'Secteur 33',
  },
];

const open = () => {
  render(
    <SearchableSelect
      ariaLabel="Choisir le collaborateur à assigner"
      emptyLabel="Non assigné"
      searchPlaceholder="Rechercher…"
      value=""
      onChange={() => {}}
      options={OPTIONS}
      groups={GROUPS}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /choisir le collaborateur/i }));
  return screen.getByRole('combobox');
};

const names = () =>
  screen
    .getAllByRole('option')
    .map((el) => el.textContent ?? '')
    .filter((t) => !t.startsWith('Non assigné'));

describe('SearchableSelect — recherche au numéro de département', () => {
  it('trouve le commercial par un département affiché', () => {
    fireEvent.change(open(), { target: { value: '28' } });
    expect(names().join(' ')).toContain('Ilan B');
    expect(names().join(' ')).not.toContain('Edouard');
  });

  it('trouve aussi celui dont le complément dit « Secteur »', () => {
    // Sans les mots-clés, « 47 » l'aurait exclu : son complément ne le
    // mentionne pas, alors qu'il couvre bien ce département.
    fireEvent.change(open(), { target: { value: '47' } });
    expect(names().join(' ')).toContain('Edouard Da Silva');
  });

  it('cherche toujours par nom', () => {
    fireEvent.change(open(), { target: { value: 'alice' } });
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Alice');
  });

  it('le dit quand aucun collaborateur ne couvre le numéro tapé', () => {
    fireEvent.change(open(), { target: { value: '97' } });
    expect(screen.getByText('Aucun résultat')).toBeTruthy();
  });
});

describe('SearchableSelect — groupes', () => {
  it('range les options dans l’ordre des groupes, pas dans celui reçu', () => {
    open();
    // Alice est déclarée en premier et sort en dernier : c'est le groupe qui
    // ordonne, l'alphabet ne jouant qu'à l'intérieur de chacun.
    expect(names()).toEqual([
      'Edouard Da SilvaSecteur 33',
      'Ilan B18, 28, 75',
      'Alice',
    ]);
  });

  it('pose un intertitre par groupe présent', () => {
    open();
    expect(screen.getByText('Secteur 33', { selector: 'li' })).toBeTruthy();
    expect(screen.getByText('Commerciaux (sectorisation)')).toBeTruthy();
    expect(screen.getByText('Autres collaborateurs')).toBeTruthy();
  });

  it('n’annonce pas un groupe que la recherche a vidé', () => {
    // Un intertitre « Secteur 33 » sans personne dessous laisserait croire que
    // le département n'est pas couvert.
    fireEvent.change(open(), { target: { value: 'alice' } });
    expect(screen.queryByText('Secteur 33', { selector: 'li' })).toBeNull();
    expect(screen.getByText('Autres collaborateurs')).toBeTruthy();
  });
});
