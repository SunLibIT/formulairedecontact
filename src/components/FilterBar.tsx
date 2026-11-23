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
import { FilterX } from 'lucide-react';
import type { Stats } from '../lib/filters';
import { ALL, countActiveFilters, type FilterState } from '../lib/filters';
import { PRIORITIES, type Priority } from '../lib/schema';
import { ListeChoix, type ChoixDeroulant } from './kit';
import { SearchableSelect } from './SearchableSelect';
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
  duplicateAddresses = 0,
  searchPlaceholder,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  options: Options;
  stats: Stats;
  /**
   * Nombre d'adresses portant plusieurs demandes, compté sur la table entière.
   * Le filtre disparaît quand il n'y en a aucune : un choix qui ne ramène
   * jamais rien n'a pas à occuper la barre.
   */
  duplicateAddresses?: number;
  searchPlaceholder: string;
}) {
  const activeCount = countActiveFilters(filters);

  // Un statut sans aucun enregistrement est inutile à proposer.
  const statuses = [...stats.byStatus.values()].sort((a, b) => b.count - a.count);

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
          onChange={(v) => onChange({ status: v })}
          options={[
            { v: ALL, l: `Tous (${stats.total})` },
            ...statuses.map(({ status, count }) => ({ v: status.id, l: `${status.name} (${count})` })),
          ]}
        />

        <Select
          label="Priorité"
          value={filters.priority}
          onChange={(v) => onChange({ priority: v as Priority | typeof ALL })}
          options={[
            { v: ALL, l: 'Toutes' },
            ...PRIORITIES.filter((p) => stats.byPriority[p] > 0).map((p) => ({ v: p, l: `${p} (${stats.byPriority[p]})` })),
          ]}
        />

        {options.categories.length > 0 && (
          <Select
            label="Type"
            value={filters.category}
            onChange={(v) => onChange({ category: v })}
            options={[{ v: ALL, l: 'Tous' }, ...options.categories.map((c) => ({ v: c, l: c }))]}
          />
        )}

        {/* Recherche et tri alphabétique : la liste peut compter 35 entrées. */}
        <div className="block min-w-52">
          <span className="mb-1.5 block text-xs font-medium text-muted">Assigné à</span>
          <SearchableSelect
            ariaLabel="Filtrer par collaborateur assigné"
            emptyLabel="Tous"
            searchPlaceholder="Rechercher…"
            value={filters.assignee === ALL ? '' : filters.assignee}
            onChange={(v) => onChange({ assignee: v || ALL })}
            options={[
              { value: 'unassigned', label: 'Non assigné', hint: String(stats.unassigned) },
              ...options.assignees.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>

        {duplicateAddresses > 0 && (
          <Select
            label="Doublons"
            value={filters.duplicates}
            onChange={(v) => onChange({ duplicates: v as FilterState['duplicates'] })}
            options={[
              { v: 'all', l: 'Tous' },
              { v: 'only', l: `En doublon (${duplicateAddresses})` },
            ]}
          />
        )}

        {options.partners.length > 0 && (
          <Select
            label="Partenaire"
            value={filters.partner}
            onChange={(v) => onChange({ partner: v })}
            options={[{ v: ALL, l: 'Tous' }, ...options.partners.map((p) => ({ v: p, l: p }))]}
          />
        )}

      </div>
    </div>
  );
}

/**
 * Filtre à choix unique : menu `ListeChoix` du Kit CRM 3 (plus de `<select>`
 * natif). Pas de `<label>` autour : un clic sur le libellé rouvrirait le menu.
 */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ChoixDeroulant[];
}) {
  return (
    <div className="block min-w-40">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <ListeChoix ariaLabel={`Filtrer par ${label.toLowerCase()}`} value={value} onChange={onChange} options={options} style={{ fontSize: '14px' }} />
    </div>
  );
}
