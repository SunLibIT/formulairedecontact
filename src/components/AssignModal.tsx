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
 *
 * Le département de la demande oriente le choix : le commercial qui couvre le
 * secteur est remonté en tête de liste et proposé en un clic. Rien n'est
 * imposé — la sectorisation est une recommandation, pas une règle d'écriture,
 * et un département non couvert (les DOM, notamment) laisse simplement la
 * liste dans son état alphabétique habituel.
 */
import { AlertTriangle, Check, MapPin, User, UserMinus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { formatPersonName } from '../lib/format';
import type { Lead, StaffMember } from '../lib/records';
import {
  formatSector,
  sectorForLead,
  sectorKeyOf,
  staffOptionsFor,
  type SectorIndex,
} from '../lib/territories';
import { SearchableSelect } from './SearchableSelect';
import { Callout, PrimaryButton, SecondaryButton } from './ui';

export function AssignModal({
  lead,
  staff,
  viewerStaffId,
  sectors,
  coverage,
  onClose,
  onAssign,
}: {
  lead: Lead;
  staff: StaffMember[];
  /** Collaborateur correspondant au visiteur, si on a pu l'identifier. */
  viewerStaffId?: string | null;
  /** Sectorisation commerciale. Vide tant qu'elle n'est pas chargée. */
  sectors: SectorIndex;
  /** Départements couverts par collaborateur, pour situer chaque ligne. */
  coverage: ReadonlyMap<string, string[]>;
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

  const department = sectorKeyOf(lead);
  const sector = sectorForLead(lead, sectors);
  const options = useMemo(
    () => staffOptionsFor(staff, sector, coverage),
    [staff, sector, coverage],
  );

  // Raccourci de secteur : seulement quand il désigne une personne et une
  // seule, et qu'elle n'est pas déjà l'assignée. Deux commerciaux sur un même
  // département sont un cas légal, mais il n'y a alors rien à préremplir.
  const sectorRep =
    sector?.staffIds.length === 1
      ? staff.find((s) => s.id === sector.staffIds[0])
      : undefined;
  const showSectorShortcut = sectorRep && current !== sectorRep.id;

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
        // Pas d'`overflow-hidden` : il découpait la liste déroulante dès
        // qu'elle dépassait du panneau. Les coins sont donc arrondis sur
        // l'en-tête et le pied eux-mêmes.
        className="modal-panel flex w-full max-w-lg flex-col rounded-t-card bg-surface sm:rounded-card"
      >
        <header className="flex items-start justify-between gap-3 rounded-t-card border-b border-line bg-canvas px-5 py-4">
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

        <div className="space-y-5 px-5 py-5">
          {/* État actuel, pour qu'on sache ce qu'on remplace. */}
          <p className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
            <span className="text-muted">Actuellement :</span>
            <span className={current ? 'font-semibold text-ink' : 'text-muted'}>
              {lead.assigneeNames.map(formatPersonName).join(', ') || 'non assignée'}
            </span>
          </p>

          {/* Secteur de la demande. Affiché dès qu'un département est connu,
              y compris quand il n'est pas couvert : « pas de commercial pour
              ce département » est une information, l'absence de ligne non. */}
          {department && (
            <div className="space-y-2.5 rounded-control bg-canvas px-3 py-2.5">
              <p className="flex items-start gap-2 text-sm">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="text-muted">Secteur : </span>
                  {sector ? (
                    <>
                      <span className="font-semibold text-ink">{formatSector(sector)}</span>
                      <span className="text-muted">
                        {' — '}
                        {sector.staffIds
                          .map((id) => staff.find((s) => s.id === id)?.name)
                          .filter((n): n is string => Boolean(n))
                          .map(formatPersonName)
                          .join(', ') || 'aucun commercial rattaché'}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">
                      département {department}, hors sectorisation
                    </span>
                  )}
                </span>
              </p>

              {showSectorShortcut && (
                <SecondaryButton
                  icon={Check}
                  busy={saving}
                  onClick={() => void commit(sectorRep.id)}
                >
                  Assigner à {formatPersonName(sectorRep.name)}
                </SecondaryButton>
              )}
            </div>
          )}

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
                options={options}
                pinnedLabel={sector ? `Secteur ${sector.code}` : undefined}
                restLabel="Autres collaborateurs"
              />
            </div>
          </label>

          {error && (
            <Callout tone="danger" icon={AlertTriangle}>
              {error}
            </Callout>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas px-5 py-3 sm:rounded-b-card">
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
