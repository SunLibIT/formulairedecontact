/**
 * Identité et droits dans le bloc Softr — remplace la connexion Google.
 *
 * Sur Vercel, il fallait « Activer la modification » (connexion Google), puis
 * le serveur relisait la table RH à chaque écriture. Dans le CRM 3, la
 * personne est déjà connectée : `Block.tsx` lit sa fiche **Utilisateurs**
 * (`useCurrentUser`) et la dépose ici. Plus de bouton, plus de session.
 *
 * Règle, reprise de l'ancienne (« tout collaborateur actif écrit, seuls
 * Direction et Administratif gèrent les statuts »), lue dans Utilisateurs :
 *  - **modifier** les demandes, assigner, sectoriser : Type « Équipe Sunlib »
 *    et « Accès plateforme sunlib » différent de « Inactif » ;
 *  - **gérer les statuts** : en plus, Service « Direction » ou « Administratif ».
 * Un compte qui ne remplit pas la règle consulte, sans pouvoir écrire.
 */
import { useMemo } from 'react';
import type { AdminAuth } from '../src/hooks/useAdminAuth';
import type { StaffMember } from '../src/lib/records';

export const TYPE_EQUIPE = 'Équipe Sunlib';
export const SERVICES_ADMIN: readonly string[] = ['Direction', 'Administratif'];

export interface Personne {
  email: string;
  nom: string;
  types: string[];
  services: string[];
  acces: string;
}

let personne: Personne = { email: '', nom: '', types: [], services: [], acces: '' };

/** Libellés d'une liste Softr : `{ id, label }`, `[{ id, label }]` ou texte. */
export function libelles(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  const liste = Array.isArray(v) ? v : [v];
  return liste
    .flatMap((x) =>
      x && typeof x === 'object'
        ? [String((x as { label?: unknown; name?: unknown }).label ?? (x as { name?: unknown }).name ?? '')]
        : String(x).split(','),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Appelé par `Block.tsx` à chaque rendu. */
export function deposerPersonne(p: Personne) {
  personne = p;
}

function normal(s: string): string {
  return s.normalize('NFC').trim().toLowerCase();
}

export function droitsDe(p: Personne): { canWrite: boolean; isAdmin: boolean } {
  const equipe = p.types.some((t) => normal(t) === normal(TYPE_EQUIPE));
  const actif = normal(p.acces) !== 'inactif';
  const canWrite = Boolean(p.email) && equipe && actif;
  const isAdmin = canWrite && p.services.some((s) => SERVICES_ADMIN.some((a) => normal(a) === normal(s)));
  return { canWrite, isAdmin };
}

/** Lu par `pont.ts` avant chaque écriture. */
export function droitsEcriture() {
  return droitsDe(personne);
}

const rien = () => {};

/** Remplace `src/hooks/useAdminAuth.ts` : même forme, identité venue de Softr. */
export function useAdminAuth(): AdminAuth {
  const p = personne;
  const { canWrite, isAdmin } = droitsDe(p);
  return useMemo(
    () => ({
      required: true,
      external: true,
      session: p.email
        ? { token: '', email: p.email, name: p.nom, canWrite, isAdmin }
        : null,
      canWrite,
      isAdmin,
      busy: false,
      signIn: async () => {},
      signOut: rien,
    }),
    [p.email, p.nom, canWrite, isAdmin],
  );
}

export interface Viewer {
  staff: StaffMember | null;
  email: string;
  unknown: boolean;
}

/**
 * Remplace `src/hooks/useViewer.ts` : l'email vient de la session Softr, plus
 * de `?email=` dans l'URL. Rapproché de la table RH comme avant, c'est ce qui
 * permet « M'assigner » et le filtre `?assignee=me` des mails.
 */
export function useViewer(staff: StaffMember[]): Viewer {
  const email = personne.email.trim().toLowerCase();
  return useMemo(() => {
    if (!email) return { staff: null, email: '', unknown: false };
    const match = staff.find((s) => s.email.trim().toLowerCase() === email) ?? null;
    return { staff: match, email, unknown: !match };
  }, [staff, email]);
}
