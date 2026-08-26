/**
 * Préférence d'affichage : liste dense ou grille de cartes.
 *
 * Trois sources, dans cet ordre de priorité :
 *  1. la **largeur d'écran** — sous 700 px il n'y a qu'une vue possible ;
 *  2. le **paramètre d'URL** `?view=`, pour qu'un lien soit partageable ;
 *  3. la **préférence stockée**, propre au navigateur.
 *
 * L'URL gagne sur le stockage : recevoir un lien doit montrer ce que
 * l'expéditeur voyait, pas ce que le destinataire préfère d'habitude.
 *
 * Le stockage est enveloppé dans des `try/catch` et n'est jamais considéré
 * comme acquis. L'application est embarquée en iframe dans Softr, donc en
 * contexte tiers : le cloisonnement de stockage de Safari et Firefox peut
 * rendre `localStorage` illisible, voire faire lever une exception au simple
 * accès. Une préférence perdue est un désagrément, une exception non
 * rattrapée serait un écran blanc.
 */
import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'cards' | 'list';

export const DEFAULT_VIEW: ViewMode = 'cards';

const STORAGE_KEY = 'sunlib.demandes.view';
const URL_PARAM = 'view';

/** Au-delà de cette largeur, les deux vues ont du sens. */
export const WIDE_QUERY = '(min-width: 700px)';

function isViewMode(value: unknown): value is ViewMode {
  return value === 'cards' || value === 'list';
}

/**
 * Résout la vue à afficher. Fonction pure, donc testable sans DOM.
 *
 * `wide` à `false` force les cartes : une liste à six colonnes sous 700 px
 * devient soit illisible, soit une carte déguisée. Autant n'en proposer qu'une.
 */
export function resolveView(input: {
  url: string | null;
  stored: string | null;
  wide: boolean;
}): ViewMode {
  if (!input.wide) return 'cards';
  if (isViewMode(input.url)) return input.url;
  if (isViewMode(input.stored)) return input.stored;
  return DEFAULT_VIEW;
}

/* ------------------------------------------------------------- accès bruts */

export function readStoredView(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Stockage cloisonné ou refusé : on n'a simplement pas de préférence.
    return null;
  }
}

export function writeStoredView(view: ViewMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Sans persistance, la préférence ne survit pas au rechargement. C'est
    // acceptable ; faire échouer la bascule ne le serait pas.
  }
}

export function readUrlView(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(URL_PARAM);
  } catch {
    return null;
  }
}

/**
 * Écrit la vue dans l'URL **sans navigation**.
 *
 * `replaceState` et non `pushState` : basculer d'affichage n'est pas un
 * déplacement dans l'application, et empiler des entrées d'historique
 * transformerait le bouton Retour en défileur de vues. Surtout, aucune
 * navigation ne signifie aucun remontage, donc aucune requête relancée.
 */
export function writeUrlView(view: ViewMode): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, view);
    window.history.replaceState(window.history.state, '', url);
  } catch {
    // Contexte sans History API : la vue reste correcte, le lien n'est
    // simplement pas partageable.
  }
}

/* ------------------------------------------------------------------- hook */

export interface ViewPreference {
  view: ViewMode;
  setView: (view: ViewMode) => void;
  /** Faux sous 700 px : le sélecteur doit alors disparaître. */
  canChoose: boolean;
}

export function useViewPreference(): ViewPreference {
  const [wide, setWide] = useState(() => {
    try {
      return window.matchMedia(WIDE_QUERY).matches;
    } catch {
      // Sans `matchMedia`, on suppose un grand écran : masquer le sélecteur
      // à tort priverait l'utilisateur d'une fonction qui marche.
      return true;
    }
  });

  // Choix explicite de l'utilisateur pendant la session. `null` tant qu'il
  // n'a rien choisi : la résolution retombe alors sur l'URL puis le stockage.
  const [chosen, setChosen] = useState<ViewMode | null>(null);

  const [initial] = useState(() => ({
    url: typeof window === 'undefined' ? null : readUrlView(),
    stored: typeof window === 'undefined' ? null : readStoredView(),
  }));

  // Suit les changements de largeur : passer sous 700 px doit ramener aux
  // cartes sans rechargement.
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(WIDE_QUERY);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const view = resolveView({
    url: chosen ?? initial.url,
    stored: initial.stored,
    wide,
  });

  const setView = useCallback((next: ViewMode) => {
    setChosen(next);
    writeStoredView(next);
    writeUrlView(next);
  }, []);

  return { view, setView, canChoose: wide };
}
