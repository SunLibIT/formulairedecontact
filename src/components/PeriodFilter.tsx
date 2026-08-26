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
import { useMemo } from 'react';
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

/** `YYYY-MM-DD` dans le fuseau local, jamais en UTC : un décalage de fuseau
 *  ferait basculer la borne d'un jour. */
function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

function rangeFor(preset: Preset): { from: string; to: string } {
  switch (preset) {
    case '7d':
      return { from: daysAgo(7), to: isoDay(new Date()) };
    case '30d':
      return { from: daysAgo(30), to: isoDay(new Date()) };
    case '3m':
      return { from: daysAgo(90), to: isoDay(new Date()) };
    case 'all':
      return { from: '', to: '' };
    case 'custom':
      return { from: '', to: '' };
  }
}

/**
 * Déduit le raccourci actif des bornes courantes, au lieu de le mémoriser à
 * part : un état dupliqué finirait par contredire les dates réellement
 * appliquées.
 */
function presetFor(from: string, to: string): Preset {
  if (!from && !to) return 'all';
  const today = isoDay(new Date());
  if (to !== today) return 'custom';
  if (from === daysAgo(7)) return '7d';
  if (from === daysAgo(30)) return '30d';
  if (from === daysAgo(90)) return '3m';
  return 'custom';
}

export function PeriodFilter({
  filters,
  onChange,
  matching,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  /** Nombre de demandes dans la période, pour rendre l'effet visible. */
  matching: number;
}) {
  const preset = useMemo(
    () => presetFor(filters.from, filters.to),
    [filters.from, filters.to],
  );
  const active = preset !== 'all';

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
          // « Sur mesure » n'impose rien : on garde les bornes en place pour
          // que l'utilisateur les ajuste au lieu de repartir de zéro.
          if (next === 'custom') {
            onChange(filters.from || filters.to ? {} : { from: daysAgo(30), to: isoDay(new Date()) });
            return;
          }
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

      <p className="ml-auto text-sm text-muted">
        <span className="font-semibold tabular-nums text-ink">{matching}</span>{' '}
        demande{matching > 1 ? 's' : ''} {active ? 'sur la période' : 'au total'}
      </p>
    </section>
  );
}
