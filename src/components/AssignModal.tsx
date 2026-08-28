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
import { AlertTriangle, Check, MapPin, User, UserCheck, UserMinus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { formatPersonName } from '../lib/format';
import { formatLocality, type Lead, type StaffMember } from '../lib/records';
import {
  sectorForLead,
  sectorKeyOf,
  staffGroups,
  staffOptionsFor,
  type CoverageIndex,
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
  coverage: CoverageIndex;
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
  // Seule la sectorisation porte le nom du département ; une demande n'en
  // stocke que le numéro. Hors secteur — les DOM — on affiche donc le numéro
  // seul, ce qui reste la clé du choix.
  const departmentName = sector?.name ?? '';
  const locality = formatLocality(lead.address);
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

  /**
   * Personne choisie dont la fiche RH n'a pas d'adresse.
   *
   * On regarde le choix courant, pas les raccourcis : ceux-ci écrivent
   * immédiatement, il n'y a pas d'instant où l'avertir servirait. Le
   * complément « sans email » de la liste couvre ce cas-là, en amont du clic.
   */
  const chosenWithoutEmail = choice
    ? staff.find((s) => s.id === choice && !s.email.trim())
    : undefined;

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
        // `max-w-2xl` et non `lg` : on choisit un collaborateur en se
        // reportant au département de la demande, donc l'en-tête, la liste
        // déroulante et les codes départements qu'elle affiche doivent tenir
        // à l'écran en même temps sans se couper.
        className="modal-panel flex w-full max-w-2xl flex-col rounded-t-card bg-surface sm:rounded-card"
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

            {/* Département du demandeur, en clair. C'est sur lui qu'on choisit
                un collaborateur, il doit donc se lire avant même d'ouvrir la
                liste : le bloc secteur, plus bas, peut être recouvert par la
                liste déroulante quand elle s'ouvre vers le haut.
                « non renseigné » est écrit plutôt que rien : une ligne absente
                laisse croire à un oubli d'affichage. */}
            <p className="mt-1.5 flex items-center gap-1.5 text-sm">
              <MapPin
                className="h-4 w-4 shrink-0 text-muted"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {department ? (
                <>
                  <span className="shrink-0 font-semibold text-ink">
                    Département {department}
                    {departmentName && ` · ${departmentName}`}
                  </span>
                  {locality && (
                    <span className="min-w-0 truncate text-muted">{locality}</span>
                  )}
                </>
              ) : (
                <span className="text-muted">Département non renseigné</span>
              )}
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

          {/* Commercial du secteur. Affiché dès qu'un département est connu,
              y compris quand il n'est pas couvert : « pas de commercial pour
              ce département » est une information, l'absence de ligne non.
              Le numéro du département n'est pas répété ici — il est dans
              l'en-tête, et cette ligne ne répond qu'à « qui le couvre ? ». */}
          {department && (
            <div className="space-y-2.5 rounded-control bg-canvas px-3 py-2.5">
              <p className="flex items-start gap-2 text-sm">
                <UserCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="text-muted">Commercial du secteur : </span>
                  {sector ? (
                    <span className="font-semibold text-ink">
                      {sector.staffIds
                        .map((id) => staff.find((s) => s.id === id)?.name)
                        .filter((n): n is string => Boolean(n))
                        .map(formatPersonName)
                        .join(', ') || (
                        <span className="font-normal text-muted">
                          aucun commercial rattaché
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted">
                      aucun — département {department} hors sectorisation
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
                groups={staffGroups(sector)}
              />
            </div>
          </label>

          {/* Fiche sans adresse : l'assignation s'écrira, mais le mail que
              l'automatisation Airtable envoie au commercial n'aura pas de
              destinataire — et rien, nulle part, ne le dirait. On le dit ici,
              avant le clic, sans empêcher quoi que ce soit : la personne est
              peut-être prévenue autrement. */}
          {chosenWithoutEmail && (
            <Callout tone="amber" icon={AlertTriangle}>
              {formatPersonName(chosenWithoutEmail.name)} n'a pas d'adresse email dans la
              table RH. L'assignation sera enregistrée, mais la notification ne partira
              pas.
            </Callout>
          )}

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
