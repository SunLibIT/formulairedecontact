/**
 * Filtre de période, en section dédiée.
 *
 * Les deux champs date étaient noyés au bout de la barre de filtres, sans
 * hiérarchie et sans raccourci : filtrer « les 30 derniers jours » demandait
 * de calculer la date à la main. Ici, un segmented control couvre les cas
 * courants et les champs n'apparaissent que pour une plage sur mesure.
 *
 * Le segmented control est le composant que la charte prescrit pour un choix
 * unique sur un petit ensemble fixe — exactement le cas des raccourcis de
 * période.
 */
import { CalendarRange } from 'lucide-react';
import { useMemo, useState } from 'react';
import { shiftIso, todayIso } from '../lib/dates';
import type { FilterState } from '../lib/filters';
import { SegmentedFilter } from './ui';

type Preset = 'all' | '7d' | '30d' | '3m' | 'custom';

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'all', label: 'Tout' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '3m', label: '3 mois' },
  { value: 'custom', label: 'Sur mesure' },
];

/** Durée de chaque raccourci, **bornes comprises**. */
const PRESET_DAYS: Record<Exclude<Preset, 'custom' | 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
};

/**
 * Début d'une fenêtre de `days` jours finissant aujourd'hui.
 *
 * Le `- 1` n'est pas un détail : `applyPeriod` est inclusive aux deux bornes,
 * donc `du 20 au 27` couvre huit jours. Sans lui, « 7 jours » en affichait
 * huit, « 30 jours » trente et un, et la comparaison avec la période
 * précédente héritait de l'écart.
 */
function startOfWindow(days: number): string {
  return shiftIso(todayIso(), -(days - 1));
}

/** `custom` est exclu : il n'a pas de plage propre, il ouvre la saisie. */
function rangeFor(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  if (preset === 'all') return { from: '', to: '' };
  return { from: startOfWindow(PRESET_DAYS[preset]), to: todayIso() };
}

/**
 * Déduit le raccourci actif des bornes courantes, au lieu de le mémoriser à
 * part : un état dupliqué finirait par contredire les dates réellement
 * appliquées.
 */
function presetFor(from: string, to: string): Preset {
  if (!from && !to) return 'all';
  if (to !== todayIso()) return 'custom';
  // Même source que `rangeFor` : deux formules distinctes finiraient par
  // diverger et le raccourci ne se rallumerait plus après un rechargement.
  for (const [preset, days] of Object.entries(PRESET_DAYS)) {
    if (from === startOfWindow(days)) return preset as Preset;
  }
  return 'custom';
}

export function PeriodFilter({
  filters,
  onChange,
  matching,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  /**
   * Nombre de demandes dans la période. Omis quand la vue affiche déjà ce
   * total ailleurs : la charte demande de ne pas montrer deux fois la même
   * donnée, à plus forte raison si les deux calculs peuvent différer.
   */
  matching?: number;
}) {
  // « Sur mesure » ne peut pas être déduit des dates : toute plage que l'on
  // poserait correspondrait à un raccourci existant, et le bouton se
  // désélectionnerait aussitôt. C'est une intention de l'utilisateur, elle
  // demande donc son propre état.
  const [pickedCustom, setPickedCustom] = useState(false);

  const derived = useMemo(
    () => presetFor(filters.from, filters.to),
    [filters.from, filters.to],
  );
  // Des bornes qui ne collent à aucun raccourci relèvent aussi du sur-mesure,
  // même sans clic — par exemple après un rechargement.
  const preset: Preset = pickedCustom || derived === 'custom' ? 'custom' : derived;
  const active = Boolean(filters.from || filters.to);

  return (
    <section
      aria-label="Période"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-surface p-4"
    >
      <h2
        className={`flex items-center gap-2 text-sm font-semibold ${
          active ? 'text-teal-ink' : 'text-ink'
        }`}
      >
        <CalendarRange className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        Période
      </h2>

      <SegmentedFilter
        label="Raccourcis de période"
        options={PRESETS}
        value={preset}
        onChange={(next) => {
          if (next === 'custom') {
            setPickedCustom(true);
            // On repart des bornes en place pour que l'utilisateur les ajuste
            // au lieu de ressaisir tout. Sans bornes, on amorce sur 30 jours.
            if (!filters.from && !filters.to) {
              onChange(rangeFor('30d'));
            }
            return;
          }
          setPickedCustom(false);
          onChange(rangeFor(next));
        }}
      />

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted">
            du
            <input
              type="date"
              className="field w-auto"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => onChange({ from: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted">
            au
            <input
              type="date"
              className="field w-auto"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => onChange({ to: e.target.value })}
            />
          </label>
        </div>
      )}

      {matching !== undefined && (
        <p className="ml-auto text-sm text-muted">
          <span className="font-semibold tabular-nums text-ink">{matching}</span>{' '}
          demande{matching > 1 ? 's' : ''} {active ? 'sur la période' : 'au total'}
        </p>
      )}
    </section>
  );
}
