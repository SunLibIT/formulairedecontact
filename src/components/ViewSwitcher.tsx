/**
 * Sélecteur d'affichage : liste dense ou grille de cartes.
 *
 * Sémantique de groupe de boutons radio, et non deux boutons indépendants :
 * les deux options sont exclusives, un lecteur d'écran doit l'entendre. D'où
 * `role="radiogroup"` avec des `role="radio"`, la navigation aux flèches et un
 * seul élément dans l'ordre de tabulation — on entre dans le groupe, puis on
 * choisit aux flèches.
 *
 * L'état actif ne repose pas sur la couleur seule : le bouton actif porte un
 * fond contrasté **et** `aria-checked`, et son libellé accessible dit
 * explicitement lequel est sélectionné.
 */
import { LayoutGrid, List, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';
import type { ViewMode } from '../hooks/useViewPreference';

const OPTIONS: Array<{ value: ViewMode; label: string; icon: LucideIcon }> = [
  { value: 'list', label: 'Vue liste', icon: List },
  { value: 'cards', label: 'Vue grille', icon: LayoutGrid },
];

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === value),
  );

  const move = (delta: number) => {
    const next = (index + delta + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Mode d'affichage des demandes"
      className="inline-flex items-center gap-0.5 rounded-control border border-line bg-surface p-0.5"
    >
      {OPTIONS.map((option, i) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            // Un seul point d'entrée au clavier, puis les flèches — c'est le
            // comportement attendu d'un groupe de radios.
            tabIndex={active ? 0 : -1}
            aria-label={`${option.label}${active ? ' (sélectionnée)' : ''}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(-1);
              }
            }}
            className={`rounded-[8px] p-2 transition-colors ${
              active
                ? 'bg-teal-soft text-teal-ink'
                : 'text-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
