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
import { ChevronDown, Lock, LogOut, Map, Settings2, ShieldCheck, ShieldX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AdminAuth } from '../hooks/useAdminAuth';
import { Monogram, Tooltip } from './kit';

export function AccountButton({
  auth,
  onOpenSectors,
  onOpenStatuses,
}: {
  auth: AdminAuth;
  /** Ouvre la sectorisation. Absent, l'entrée de menu ne s'affiche pas. */
  onOpenSectors?: () => void;
  /** Ouvre la gestion des statuts. Proposée aux seuls admins. */
  onOpenStatuses?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à Échap : un menu qui reste ouvert derrière
  // une modale est un piège à clics.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      // `composedPath` et non `contains(e.target)` : dans le bloc Softr, l'app
      // vit dans un Shadow DOM et la cible vue du document est l'hôte du bloc.
      if (!container.current || !e.composedPath().includes(container.current)) setOpen(false);
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
      <Tooltip content="Se connecter pour pouvoir modifier"><button
        type="button"
        onClick={() => void auth.signIn()}
        disabled={auth.busy}
        className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Lock className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
        {/* Sous 640 px, l'icône seule : la barre porte déjà le titre et
            l'actualisation, un libellé de plus la ferait passer à la ligne. */}
        <span className="hidden sm:inline">
          {auth.busy ? 'Connexion…' : 'Activer la modification'}
        </span>
        <span className="sr-only sm:hidden">Activer la modification</span>
      </button></Tooltip>
    );
  }

  const { email, name, canWrite } = auth.session;
  const label = name.trim() || email;

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-control px-1.5 py-1.5 transition-colors hover:bg-canvas"
      >
        {/* Rond d'initiales du CRM 3 : aplat teal mat (Kit, 30/09). */}
        <Monogram name={label} size={32} />
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
                  {auth.external
                    ? 'Ce compte n’est pas un membre actif de l’Équipe SunLib : la consultation reste possible, la modification est refusée.'
                    : <>Ce compte n&apos;est pas un collaborateur actif de la table RH : la
                  consultation reste possible, la modification est refusée.</>}
                </span>
              </p>
            )}
          </div>

          {/* Seul accès à la sectorisation : c'est un réglage d'administration,
              consulté de temps en temps, et un quatrième onglet l'aurait mis au
              même rang que les demandes et les KPI. Réservé à ceux qui peuvent
              déjà écrire — proposer une porte d'édition à un compte en lecture
              seule ne mène qu'à une déception.

              Le menu se referme avant l'ouverture de la boîte : deux couches
              superposées se disputeraient le focus et `Échap`. */}
          {canWrite && onOpenSectors && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenSectors();
              }}
              className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              <Map className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="flex-1">Sectorisation commerciale</span>
            </button>
          )}

          {auth.isAdmin && onOpenStatuses && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenStatuses();
              }}
              className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              <Settings2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="flex-1">Gérer les statuts</span>
            </button>
          )}

          {/* Identité tenue par l'hôte (page Softr du CRM) : la session est
              celle du CRM, on ne s'en déconnecte pas d'ici. */}
          {!auth.external && (
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
          )}
        </div>
      )}
    </div>
  );
}
