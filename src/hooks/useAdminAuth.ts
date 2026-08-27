/**
 * État de la session d'écriture, pour l'interface.
 *
 * Le hook ne décide rien : il reflète ce que `lib/adminAuth` détient et ce que
 * le serveur répond. C'est le serveur qui refuse une écriture ; l'interface se
 * contente de ne pas proposer des boutons qui échoueraient.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  consumeFragmentSession,
  currentSession,
  fetchConfig,
  refreshSession,
  signIn,
  signOut,
  subscribe,
  type AdminSession,
} from '../lib/adminAuth';

export interface AdminAuth {
  /** Vrai si le serveur exige une session pour écrire. */
  required: boolean;
  session: AdminSession | null;
  /** Vrai si l'application peut écrire dans l'état actuel. */
  canWrite: boolean;
  busy: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
}

export function useAdminAuth(): AdminAuth {
  const [required, setRequired] = useState(false);
  const [session, setSession] = useState<AdminSession | null>(() => currentSession());
  const [busy, setBusy] = useState(false);

  // Reflète les changements venus du module, d'où qu'ils viennent.
  useEffect(() => subscribe(() => setSession(currentSession())), []);

  useEffect(() => {
    // Un retour de connexion pleine page laisse la session dans le fragment :
    // à consommer avant tout, puisqu'elle est déjà valide.
    consumeFragmentSession();

    let alive = true;
    void fetchConfig().then((config) => {
      if (!alive) return;
      setRequired(config.googleAuth);
      // Un jeton peut avoir expiré pendant que l'onglet dormait, ou son porteur
      // être passé « Inactif » : on revalide plutôt que de faire confiance.
      if (config.googleAuth && currentSession()) void refreshSession();
    });
    return () => {
      alive = false;
    };
  }, []);

  const doSignIn = useCallback(async () => {
    setBusy(true);
    try {
      await signIn();
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    required,
    session,
    // Régime historique : on écrit comme avant, sans session.
    canWrite: required ? Boolean(session?.canWrite) : true,
    busy,
    signIn: doSignIn,
    signOut,
  };
}
