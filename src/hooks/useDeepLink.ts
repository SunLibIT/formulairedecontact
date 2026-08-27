/**
 * Lit le lien profond une fois, au montage.
 *
 * « Une fois » est le point important : `useViewPreference` réécrit l'URL avec
 * `replaceState` à chaque bascule d'affichage. Relire les paramètres à chaque
 * rendu rouvrirait la fiche que l'utilisateur vient de fermer.
 *
 * Les règles sont dans `lib/deepLink`, testables sans DOM ; il ne reste ici
 * que l'accès à `window`.
 */
import { useState } from 'react';
import { NO_LINK, parseDeepLink, type DeepLink } from '../lib/deepLink';

export function useDeepLink(): DeepLink {
  const [link] = useState<DeepLink>(() =>
    typeof window === 'undefined' ? NO_LINK : parseDeepLink(window.location.search),
  );
  return link;
}
