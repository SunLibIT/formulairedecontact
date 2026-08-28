// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchableSelect } from './SearchableSelect';

/**
 * Le geste que ces tests protègent : lire le département du client, taper ce
 * numéro dans la recherche, assigner la personne qui le couvre.
 */
const OPTIONS = [
  // Le commercial du secteur : son complément dit « Secteur 33 », mais il
  // couvre aussi le 47.
  { value: 'recEdouard', label: 'Edouard Da Silva', hint: 'Secteur 33', keywords: '33, 47', pinned: true },
  { value: 'recIlan', label: 'Ilan B', hint: '18, 28, 75' },
  // Non sectorisé : plus de service affiché, donc rien à chercher dessus.
  { value: 'recAlice', label: 'Alice', hint: undefined },
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
      pinnedLabel="Secteur 33"
      restLabel="Autres collaborateurs"
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
