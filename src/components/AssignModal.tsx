/**
 * Assignation d'une demande — modale volontairement minimale.
 *
 * Ne fait qu'une chose : choisir à qui confier une demande. Ouvrir la fiche
 * complète pour cela demandait de parcourir tout le suivi commercial et
 * d'enregistrer l'ensemble ; ici deux clics suffisent.
 *
 * Le raccourci « M'assigner » n'apparaît que si l'hôte Softr a transmis
 * l'email du visiteur et qu'il correspond à un collaborateur. Sans identité,
 * on ne devine pas qui est « moi » : la liste complète reste le chemin normal.
 */
import { AlertTriangle, Check, User, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { formatPersonName } from '../lib/format';
import type { Lead, StaffMember } from '../lib/records';
import { SearchableSelect } from './SearchableSelect';
import { Callout, PrimaryButton, SecondaryButton } from './ui';

export function AssignModal({
  lead,
  staff,
  viewerStaffId,
  onClose,
  onAssign,
}: {
  lead: Lead;
  staff: StaffMember[];
  /** Collaborateur correspondant au visiteur, si on a pu l'identifier. */
  viewerStaffId?: string | null;
  onClose: () => void;
  /** Écrit l'assignation. `null` la retire. */
  onAssign: (lead: Lead, staffId: string | null) => Promise<void>;
}) {
  const [choice, setChoice] = useState(lead.assigneeIds[0] ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dialogRef = useDialog(onClose);

  const current = lead.assigneeIds[0] ?? '';
  const viewer = viewerStaffId ? staff.find((s) => s.id === viewerStaffId) : undefined;
  // Inutile de proposer « M'assigner » à qui l'est déjà.
  const showSelfShortcut = viewer && current !== viewer.id;

  const commit = async (staffId: string | null) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onAssign(lead, staffId);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "L'assignation n'a pas pu être enregistrée. Réessayez.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        tabIndex={-1}
        className="modal-panel flex w-full max-w-md flex-col overflow-hidden rounded-t-card bg-surface sm:rounded-card"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line bg-canvas px-5 py-4">
          <div className="min-w-0">
            <h2 id="assign-title" className="text-base font-bold text-ink">
              Assigner la demande
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted">
              {formatPersonName(lead.fullName)}
              {lead.company && ` · ${lead.company}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-control p-1.5 text-muted hover:bg-surface hover:text-ink"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {/* État actuel, pour qu'on sache ce qu'on remplace. */}
          <p className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
            <span className="text-muted">Actuellement :</span>
            <span className={current ? 'font-semibold text-ink' : 'text-muted'}>
              {lead.assigneeNames.map(formatPersonName).join(', ') || 'non assignée'}
            </span>
          </p>

          {showSelfShortcut && (
            <PrimaryButton
              busy={saving}
              arrow={false}
              onClick={() => void commit(viewer.id)}
            >
              <Check className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              M'assigner ({formatPersonName(viewer.name)})
            </PrimaryButton>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              {showSelfShortcut ? 'Ou choisir un collaborateur' : 'Collaborateur'}
            </span>
            <div data-autofocus>
              <SearchableSelect
                ariaLabel="Choisir le collaborateur à assigner"
                emptyLabel="Aucun collaborateur"
                searchPlaceholder="Rechercher…"
                value={choice}
                onChange={setChoice}
                options={staff.map((s) => ({
                  value: s.id,
                  label: s.name,
                  hint: s.group,
                }))}
              />
            </div>
          </label>

          {error && (
            <Callout tone="danger" icon={AlertTriangle}>
              {error}
            </Callout>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas px-5 py-3">
          {/* Retirer l'assignation n'est proposé que s'il y a quelque chose à
              retirer. */}
          {current ? (
            <SecondaryButton
              icon={UserMinus}
              busy={saving}
              onClick={() => void commit(null)}
            >
              Retirer
            </SecondaryButton>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <SecondaryButton onClick={onClose}>Annuler</SecondaryButton>
            <PrimaryButton
              busy={saving}
              arrow={false}
              // Rien à enregistrer si le choix n'a pas bougé.
              disabled={!choice || choice === current}
              onClick={() => void commit(choice)}
            >
              Assigner
            </PrimaryButton>
          </div>
        </footer>
      </div>
    </div>
  );
}
