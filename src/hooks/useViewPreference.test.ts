// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIEW,
  readStoredView,
  resolveView,
  useViewPreference,
  writeStoredView,
  writeUrlView,
} from './useViewPreference';

/** Simule une largeur d'écran : `matchMedia` n'existe pas dans jsdom. */
function setViewportWide(wide: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: wide,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
    })),
  );
  return listeners;
}

function setUrl(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

beforeEach(() => {
  window.localStorage.clear();
  setUrl('');
  setViewportWide(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveView', () => {
  it('donne la priorité à l’URL sur la préférence stockée', () => {
    expect(resolveView({ url: 'list', stored: 'cards', wide: true })).toBe('list');
    expect(resolveView({ url: 'cards', stored: 'list', wide: true })).toBe('cards');
  });

  it('retombe sur la préférence stockée sans paramètre d’URL', () => {
    expect(resolveView({ url: null, stored: 'list', wide: true })).toBe('list');
  });

  it('retombe sur le défaut sans URL ni préférence', () => {
    expect(resolveView({ url: null, stored: null, wide: true })).toBe(DEFAULT_VIEW);
  });

  it('ignore une valeur inconnue, d’où qu’elle vienne', () => {
    expect(resolveView({ url: 'tableau', stored: null, wide: true })).toBe(DEFAULT_VIEW);
    expect(resolveView({ url: null, stored: 'kanban', wide: true })).toBe(DEFAULT_VIEW);
    // Une URL invalide ne doit pas masquer une préférence valide.
    expect(resolveView({ url: 'tableau', stored: 'list', wide: true })).toBe('list');
  });

  it('force les cartes sur écran étroit, quoi que disent URL et stockage', () => {
    expect(resolveView({ url: 'list', stored: 'list', wide: false })).toBe('cards');
  });
});

describe('stockage', () => {
  it('relit ce qu’il a écrit', () => {
    writeStoredView('list');
    expect(readStoredView()).toBe('list');
  });

  it('renvoie null quand le stockage est inaccessible', () => {
    const getItem = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage partitioned');
      });
    expect(readStoredView()).toBeNull();
    getItem.mockRestore();
  });

  it('n’échoue pas quand l’écriture est refusée', () => {
    const setItem = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded');
      });
    expect(() => writeStoredView('list')).not.toThrow();
    setItem.mockRestore();
  });
});

describe('writeUrlView', () => {
  it('écrit le paramètre sans empiler d’entrée d’historique', () => {
    const before = window.history.length;
    writeUrlView('list');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('list');
    expect(window.history.length).toBe(before);
  });

  it('conserve les autres paramètres de l’URL', () => {
    setUrl('?tab=solar&q=durand');
    writeUrlView('list');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('list');
    expect(params.get('tab')).toBe('solar');
    expect(params.get('q')).toBe('durand');
  });
});

describe('useViewPreference', () => {
  it('part de la préférence stockée', () => {
    writeStoredView('list');
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.view).toBe('list');
  });

  it('laisse l’URL primer sur le stockage', () => {
    writeStoredView('cards');
    setUrl('?view=list');
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.view).toBe('list');
  });

  it('persiste le choix dans le stockage et dans l’URL', () => {
    const { result } = renderHook(() => useViewPreference());
    act(() => result.current.setView('list'));

    expect(result.current.view).toBe('list');
    expect(readStoredView()).toBe('list');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('list');
  });

  it('survit à un remontage : la préférence est bien relue', () => {
    const first = renderHook(() => useViewPreference());
    act(() => first.result.current.setView('list'));
    first.unmount();

    const second = renderHook(() => useViewPreference());
    expect(second.result.current.view).toBe('list');
  });

  it('masque le sélecteur et force les cartes sur écran étroit', () => {
    setViewportWide(false);
    writeStoredView('list');
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.view).toBe('cards');
    expect(result.current.canChoose).toBe(false);
  });

  it('expose le sélecteur sur écran large', () => {
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.canChoose).toBe(true);
  });

  it('reste sur les cartes si matchMedia est absent mais ne plante pas', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useViewPreference());
    // Sans `matchMedia` on suppose un grand écran : priver l'utilisateur du
    // sélecteur serait plus gênant que de l'afficher à tort.
    expect(result.current.canChoose).toBe(true);
  });

  it('ne recrée pas setView à chaque rendu, donc ne provoque pas de refetch', () => {
    const { result, rerender } = renderHook(() => useViewPreference());
    const first = result.current.setView;
    rerender();
    expect(result.current.setView).toBe(first);
  });
});
