/**
 * Barre d'actions groupées.
 *
 * Apparaît dès qu'une ligne est sélectionnée et n'agit que sur des lignes
 * visibles — la sélection est élaguée en amont, voir `useSelection`.
 *
 * L'écriture est nécessairement longue : Airtable accepte dix enregistrements
 * par requête et cinq requêtes par seconde, donc 200 lignes prennent une
 * poignée de secondes. D'où une progression chiffrée et un bouton
 * d'interruption, plutôt qu'un bouton qui semble figé.
 */
import { AlertTriangle, Check, Loader2, Merge, X } from 'lucide-react';
import { useState } from 'react';
import type { StaffMember } from '../lib/records';
import {
  PRIORITIES,
  SELECTABLE_STATUSES,
  type Priority,
  type Status,
} from '../lib/schema';
import { staffOptionsFor, type Sector } from '../lib/territories';
import { SearchableSelect } from './SearchableSelect';
import { SecondaryButton } from './ui';

export interface BulkPatch {
  status?: Status;
  priority?: Priority;
  assigneeId?: string | null;
}

export interface BulkOutcome {
  updated: number;
  aborted: boolean;
  failed: number;
}

export function BulkActionBar({
  count,
  staff,
  sector,
  coverage,
  onApply,
  onClear,
  onMerge,
}: {
  count: number;
  staff: StaffMember[];
  /**
   * Secteur commun à toute la sélection, s'il y en a un.
   *
   * `null` dès que deux départements se mêlent : mettre en avant le commercial
   * d'un seul d'entre eux orienterait l'assignation d'un lot qui ne le
   * concerne pas.
   */
  sector: Sector | null;
  /** Départements couverts par collaborateur. */
  coverage: ReadonlyMap<string, string[]>;
  /** Applique la modification. `signal` permet l'interruption. */
  onApply: (
    patch: BulkPatch,
    handlers: { onProgress: (done: number, total: number) => void; signal: AbortSignal },
  ) => Promise<BulkOutcome>;
  onClear: () => void;
  /**
   * Propose la fusion. Renseigné seulement quand la sélection forme un
   * groupe fusionnable — même adresse, même table, au moins deux lignes —
   * ce qui est la condition pour que le bouton apparaisse.
   */
  onMerge?: () => void;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const busy = progress !== null;

  const apply = async (patch: BulkPatch) => {
    if (busy) return;
    const ctrl = new AbortController();
    setController(ctrl);
    setOutcome(null);
    setProgress({ done: 0, total: count });
    try {
      const result = await onApply(patch, {
        onProgress: (done, total) => setProgress({ done, total }),
        signal: ctrl.signal,
      });
      setOutcome(result);
    } finally {
      setProgress(null);
      setController(null);
    }
  };

  return (
    <div
      role="region"
      aria-label={`Actions groupées sur ${count} demande${count > 1 ? 's' : ''}`}
      // Barre collée en bas : elle doit rester atteignable quelle que soit la
      // position dans une liste de 438 lignes.
      className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-card border border-teal-soft bg-surface p-3 shadow-lg"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="rounded-full bg-teal-soft px-2 py-0.5 tabular-nums text-teal-ink">
          {count}
        </span>
        sélectionnée{count > 1 ? 's' : ''}
      </span>

      {busy ? (
        <>
          <span
            aria-live="polite"
            className="flex items-center gap-2 text-sm text-muted"
          >
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
            {progress.done} / {progress.total} enregistrées…
          </span>
          <SecondaryButton icon={X} onClick={() => controller?.abort()}>
            Interrompre
          </SecondaryButton>
        </>
      ) : (
        <>
          <div className="min-w-48">
            <SearchableSelect
              ariaLabel="Assigner la sélection à un collaborateur"
              emptyLabel="Assigner à…"
              searchPlaceholder="Rechercher…"
              value=""
              onChange={(id) => void apply({ assigneeId: id || null })}
              options={[
                { value: '', label: 'Retirer l’assignation' },
                ...staffOptionsFor(staff, sector, coverage),
              ]}
              pinnedLabel={sector ? `Secteur ${sector.code}` : undefined}
              restLabel="Autres collaborateurs"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted">
            Statut
            <select
              className="field w-auto"
              value=""
              onChange={(e) => {
                if (e.target.value) void apply({ status: e.target.value as Status });
              }}
            >
              <option value="">—</option>
              {SELECTABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-muted">
            Priorité
            <select
              className="field w-auto"
              value=""
              onChange={(e) => {
                if (e.target.value) void apply({ priority: e.target.value as Priority });
              }}
            >
              <option value="">—</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          {/* Mis en avant à part : c'est la seule action qui touche plusieurs
              enregistrements de façons différentes — l'une complétée, les
              autres archivées. Elle passe donc par une confirmation. */}
          {onMerge && (
            <SecondaryButton icon={Merge} onClick={onMerge}>
              Fusionner
            </SecondaryButton>
          )}

          <SecondaryButton icon={X} onClick={onClear}>
            Désélectionner
          </SecondaryButton>
        </>
      )}

      {/* Compte rendu : une écriture partielle doit se voir, pas se devenir. */}
      {outcome && !busy && (
        <span
          aria-live="polite"
          className={`flex items-center gap-1.5 text-xs font-medium ${
            outcome.failed > 0 ? 'text-danger' : 'text-teal-ink'
          }`}
        >
          {outcome.failed > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          )}
          {outcome.aborted
            ? `Interrompu après ${outcome.updated}`
            : outcome.failed > 0
              ? `${outcome.updated} enregistrées, ${outcome.failed} en échec`
              : `${outcome.updated} enregistrée${outcome.updated > 1 ? 's' : ''}`}
        </span>
      )}
    </div>
  );
}
