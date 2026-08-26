// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSelection } from './useSelection';

const IDS = ['a', 'b', 'c', 'd', 'e'];

/** Sélection triée, pour comparer sans dépendre de l'ordre d'insertion. */
const picked = (ids: Set<string>) => [...ids].sort();

describe('useSelection', () => {
  it('démarre vide', () => {
    const { result } = renderHook(() => useSelection(IDS));
    expect(result.current.count).toBe(0);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.someSelected).toBe(false);
  });

  it('bascule une ligne dans les deux sens', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggle('b'));
    expect(picked(result.current.ids)).toEqual(['b']);
    act(() => result.current.toggle('b'));
    expect(result.current.count).toBe(0);
  });

  it('sélectionne une plage avec shift, depuis la dernière ligne cliquée', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggle('b'));
    act(() => result.current.toggle('d', true));
    expect(picked(result.current.ids)).toEqual(['b', 'c', 'd']);
  });

  it('sélectionne une plage vers le haut aussi bien que vers le bas', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggle('d'));
    act(() => result.current.toggle('b', true));
    expect(picked(result.current.ids)).toEqual(['b', 'c', 'd']);
  });

  it('ajoute la plage sans effacer la sélection existante', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('c'));
    act(() => result.current.toggle('e', true));
    // `a` isolé, puis la plage `c`→`e` : les deux coexistent.
    expect(picked(result.current.ids)).toEqual(['a', 'c', 'd', 'e']);
  });

  it('traite un shift sans ancre comme un clic simple', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggle('c', true));
    expect(picked(result.current.ids)).toEqual(['c']);
  });

  it('déplace l’ancre au clic simple, pas à l’extension', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('c', true)); // a→c, l'ancre reste 'a'
    act(() => result.current.toggle('e', true)); // a→e depuis la même ancre
    expect(picked(result.current.ids)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sélectionne tout puis vide, avec la même commande', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(5);
    expect(result.current.allSelected).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
  });

  it('distingue sélection partielle et totale', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggle('a'));
    expect(result.current.someSelected).toBe(true);
    expect(result.current.allSelected).toBe(false);

    act(() => result.current.toggleAll());
    expect(result.current.someSelected).toBe(false);
    expect(result.current.allSelected).toBe(true);
  });

  it('n’est pas « tout sélectionné » sur une liste vide', () => {
    const { result } = renderHook(() => useSelection([]));
    expect(result.current.allSelected).toBe(false);
  });

  it('élague ce qui sort du visible après filtrage', () => {
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: IDS },
    });
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(5);

    // Un filtre ne laisse que deux lignes : on n'agit jamais sur l'invisible.
    rerender({ ids: ['b', 'd'] });
    expect(picked(result.current.ids)).toEqual(['b', 'd']);
  });

  it('conserve la sélection quand l’ensemble visible ne change pas', () => {
    // C'est exactement le cas de la bascule liste/grille : mêmes lignes,
    // même ordre, seule la présentation diffère.
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: IDS },
    });
    act(() => result.current.toggle('b'));
    act(() => result.current.toggle('d'));
    const before = picked(result.current.ids);

    rerender({ ids: [...IDS] }); // nouveau tableau, même contenu
    expect(picked(result.current.ids)).toEqual(before);
  });

  it('conserve la sélection quand seul l’ordre change', () => {
    // Un changement de tri réordonne sans masquer : rien ne doit être perdu.
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: IDS },
    });
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('e'));

    rerender({ ids: ['e', 'd', 'c', 'b', 'a'] });
    expect(picked(result.current.ids)).toEqual(['a', 'e']);
  });

  it('suit le nouvel ordre pour une plage après un changement de tri', () => {
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: IDS },
    });
    rerender({ ids: ['e', 'd', 'c', 'b', 'a'] });
    act(() => result.current.toggle('e'));
    act(() => result.current.toggle('c', true));
    expect(picked(result.current.ids)).toEqual(['c', 'd', 'e']);
  });

  it('vide la sélection sur demande', () => {
    const { result } = renderHook(() => useSelection(IDS));
    act(() => result.current.toggleAll());
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });
});
