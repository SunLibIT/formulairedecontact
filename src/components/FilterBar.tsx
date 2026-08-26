/**
 * Barre de recherche et de filtres — une seule instance pour les deux onglets.
 *
 * Les options de statut, catégorie, assigné et partenaire sont **dérivées des
 * données** au lieu d'être codées en dur : la version précédente proposait des
 * choix qui ne ramenaient jamais rien (« Hors Critères » sur une table qui ne
 * contenait que « En cours » / « Contacté »).
 *
 * Charte : réinitialisation par un bouton séparé et explicite, désactivé tant
 * qu'aucun filtre n'est actif ; période active signalée en teal.
 */
import { CalendarRange, FilterX } from 'lucide-react';
import type { Stats } from '../lib/filters';
import { ALL, countActiveFilters, type FilterState } from '../lib/filters';
import { PRIORITIES, type Priority, type Status } from '../lib/schema';
import { SecondaryButton, SearchField } from './ui';

interface Options {
  categories: string[];
  partners: string[];
  assignees: Array<{ id: string; name: string }>;
}

export function FilterBar({
  filters,
  onChange,
  onReset,
  options,
  stats,
  searchPlaceholder,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  options: Options;
  stats: Stats;
  searchPlaceholder: string;
}) {
  const activeCount = countActiveFilters(filters);
  const periodActive = Boolean(filters.from || filters.to);

  // Un statut sans aucun enregistrement est inutile à proposer.
  const statuses = (Object.entries(stats.byStatus) as Array<[Status, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={filters.search}
          onChange={(search) => onChange({ search })}
          placeholder={searchPlaceholder}
        />
        <SecondaryButton
          icon={FilterX}
          onClick={onReset}
          disabled={activeCount === 0}
        >
          Réinitialiser
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-teal-soft px-1.5 text-xs font-semibold text-teal-ink">
              {activeCount}
            </span>
          )}
        </SecondaryButton>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Statut"
          value={filters.status}
          onChange={(v) => onChange({ status: v as Status | typeof ALL })}
        >
          <option value={ALL}>Tous ({stats.total})</option>
          {statuses.map(([s, n]) => (
            <option key={s} value={s}>
              {s} ({n})
            </option>
          ))}
        </Select>

        <Select
          label="Priorité"
          value={filters.priority}
          onChange={(v) => onChange({ priority: v as Priority | typeof ALL })}
        >
          <option value={ALL}>Toutes</option>
          {PRIORITIES.filter((p) => stats.byPriority[p] > 0).map((p) => (
            <option key={p} value={p}>
              {p} ({stats.byPriority[p]})
            </option>
          ))}
        </Select>

        {options.categories.length > 0 && (
          <Select
            label="Type"
            value={filters.category}
            onChange={(v) => onChange({ category: v })}
          >
            <option value={ALL}>Tous</option>
            {options.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}

        <Select
          label="Assigné à"
          value={filters.assignee}
          onChange={(v) => onChange({ assignee: v })}
        >
          <option value={ALL}>Tous</option>
          <option value="unassigned">Non assigné ({stats.unassigned})</option>
          {options.assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>

        {options.partners.length > 0 && (
          <Select
            label="Partenaire"
            value={filters.partner}
            onChange={(v) => onChange({ partner: v })}
          >
            <option value={ALL}>Tous</option>
            {options.partners.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        )}

        <div className="flex items-end gap-2">
          <label className="block">
            <span
              className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${
                periodActive ? 'text-teal-ink' : 'text-muted'
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Du
            </span>
            <input
              type="date"
              className="field w-auto"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => onChange({ from: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">au</span>
            <input
              type="date"
              className="field w-auto"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => onChange({ to: e.target.value })}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <select className="field w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
