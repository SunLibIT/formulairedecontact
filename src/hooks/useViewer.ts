/**
 * Identifie le collaborateur qui consulte l'écran.
 *
 * L'application n'a pas d'authentification propre : elle est embarquée en
 * iframe dans Softr, qui transmet l'email de l'utilisateur connecté dans
 * l'URL (`?email=…`), selon le patron documenté en interne. On rapproche cet
 * email de la table RH pour retrouver l'enregistrement correspondant.
 *
 * Sans cet appariement, aucune action « M'assigner » n'est possible : on ne
 * devine pas qui est « moi ». Les composants doivent donc traiter `null` comme
 * un cas normal, pas comme une erreur.
 */
import { useMemo } from 'react';
import type { StaffMember } from '../lib/records';

/** Email du visiteur tel que transmis par l'hôte, ou chaîne vide. */
function viewerEmail(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  // `email` est le nom utilisé par le bloc d'embed Softr ; `user` sert de
  // repli pour un appel manuel ou un test.
  const raw = params.get('email') ?? params.get('user') ?? '';
  return raw.trim().toLowerCase();
}

export interface Viewer {
  /** Enregistrement RH du visiteur, si on a pu l'identifier. */
  staff: StaffMember | null;
  /** Email reçu de l'hôte, même sans correspondance RH. */
  email: string;
  /** Vrai si un email a été transmis mais ne correspond à personne. */
  unknown: boolean;
}

export function useViewer(staff: StaffMember[]): Viewer {
  return useMemo(() => {
    const email = viewerEmail();
    if (!email) return { staff: null, email: '', unknown: false };

    const match =
      staff.find((s) => s.email.trim().toLowerCase() === email) ?? null;
    return { staff: match, email, unknown: !match };
  }, [staff]);
}
