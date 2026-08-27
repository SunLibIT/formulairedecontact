/**
 * Le compte, en haut à droite de la barre — seul endroit où l'on se connecte.
 *
 * Pas de porte par page, pas de second bouton ailleurs : une session sert à
 * toute l'application, la proposer deux fois laisserait croire à deux droits
 * différents.
 *
 * Le bouton n'apparaît que si le serveur exige une session (`required`). Il ne
 * dépend en revanche **jamais** d'un email connu : ouverte hors de Softr, la
 * page n'en a aucun, et conditionner la porte à cet email laisserait un
 * collaborateur sans aucun moyen d'entrer, ni le moindre indice.
 *
 * Charte : l'avatar est un cercle en teinte claire avec l'encre de la même
 * famille, jamais un dégradé — celui-ci est réservé à l'action principale, et
 * le cercle aux personnes.
 */
import { ChevronDown, Lock, LogOut, ShieldCheck, ShieldX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AdminAuth } from '../hooks/useAdminAuth';

export function AccountButton({ auth }: { auth: AdminAuth }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à Échap : un menu qui reste ouvert derrière
  // une modale est un piège à clics.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!container.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!auth.required) return null;

  if (!auth.session) {
    return (
      <button
        type="button"
        onClick={() => void auth.signIn()}
        disabled={auth.busy}
        title="Se connecter pour pouvoir modifier"
        className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Lock className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
        {/* Sous 640 px, l'icône seule : la barre porte déjà le titre et
            l'actualisation, un libellé de plus la ferait passer à la ligne. */}
        <span className="hidden sm:inline">
          {auth.busy ? 'Connexion…' : 'Activer la modification'}
        </span>
        <span className="sr-only sm:hidden">Activer la modification</span>
      </button>
    );
  }

  const { email, name, canWrite } = auth.session;
  const label = name.trim() || email;
  const initial = (label.trim()[0] ?? '?').toUpperCase();

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-control px-1.5 py-1.5 transition-colors hover:bg-canvas"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-soft text-sm font-bold text-teal-ink"
        >
          {initial}
        </span>
        <span className="hidden max-w-[12rem] truncate text-sm font-medium text-ink sm:inline">
          {label}
        </span>
        <ChevronDown className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden="true" />
        <span className="sr-only">Compte : {label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-card border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{label}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>

          {/* L'état du droit est écrit, jamais deviné : un compte connecté mais
              non autorisé doit lire pourquoi il ne peut rien modifier. */}
          <div className="px-4 py-3">
            {canWrite ? (
              <p className="flex items-start gap-2 text-sm text-ink">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-teal-ink"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Modification autorisée.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-amber">
                <ShieldX className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span>
                  Ce compte n&apos;est pas un collaborateur actif de la table RH : la
                  consultation reste possible, la modification est refusée.
                </span>
              </p>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              auth.signOut();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
