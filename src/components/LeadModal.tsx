/**
 * Fiche détaillée et édition du suivi — unique, pour les deux sources.
 *
 * Remplace `ContactModal` et `AirtableModal`. Corrige au passage :
 *  - l'écriture d'un statut `archived` qui n'existait ni dans le type ni dans
 *    Airtable ;
 *  - la synchronisation conditionnée à un `network_id` jamais renseigné, donc
 *    jamais déclenchée ;
 *  - l'envoi d'une chaîne dans « Assigné à », qui est un champ de liaison et
 *    attend un tableau d'identifiants ;
 *  - le rechargement de la table RH à chaque ouverture.
 *
 * Charte : en-tête fixe, corps défilant, pied fixe ; `role="dialog"` +
 * `aria-modal`, piège de focus, Échap et clic sur l'arrière-plan, restitution
 * du focus à la fermeture.
 *
 * « Hors critères » agit en un clic, sans confirmation. La charte réserve
 * l'écran de confirmation aux actions destructrices ; celle-ci ne détruit
 * rien — elle pose un statut que la liste juste au-dessus permet de changer
 * aussitôt.
 */
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Euro,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Save,
  Sun,
  User,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { updateRecord } from '../lib/airtable';
import { formatAddress, type Lead, type StaffMember } from '../lib/records';
import {
  PRIORITIES,
  PRIORITY_TONE,
  SELECTABLE_STATUSES,
  STATUSES,
  STATUS_TONE,
  type Priority,
  type Status,
} from '../lib/schema';
import {
  sectorForLead,
  staffOptionsFor,
  type CoverageIndex,
  type SectorIndex,
} from '../lib/territories';
import { TONE_CLASS } from '../lib/tones';
import { WRITE_TARGET } from '../lib/writeTargets';
import { SearchableSelect } from './SearchableSelect';
import { Callout, PriorityBadge, RelativeDate, SecondaryButton, StatusBadge } from './ui';

interface Props {
  lead: Lead;
  staff: StaffMember[];
  /** Sectorisation commerciale. Vide tant qu'elle n'est pas chargée. */
  sectors: SectorIndex;
  /** Départements couverts par collaborateur. */
  coverage: CoverageIndex;
  onClose: () => void;
  /** Applique le changement dans la liste sans rechargement complet. */
  onSaved: (patch: Partial<Lead>) => void;
}

export function LeadModal({ lead, staff, sectors, coverage, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<Status>(lead.status);
  const [priority, setPriority] = useState<Priority>(lead.priority);
  const [partner, setPartner] = useState(lead.partner);
  const [assigneeId, setAssigneeId] = useState(lead.assigneeIds[0] ?? '');
  const [notes, setNotes] = useState(lead.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const titleId = useId();
  // Piège de focus, Échap, verrou de défilement et restitution du focus :
  // mutualisés avec la modale d'assignation.
  const dialogRef = useDialog(onClose);

  const dirty =
    status !== lead.status ||
    priority !== lead.priority ||
    partner !== lead.partner ||
    notes !== lead.notes ||
    assigneeId !== (lead.assigneeIds[0] ?? '');


  const activeStaff = useMemo(
    () => staff.filter((s) => s.active || lead.assigneeIds.includes(s.id)),
    [staff, lead.assigneeIds],
  );

  // Même mise en avant que dans la modale d'assignation : le commercial du
  // département de la demande est remonté en tête, le reste de la liste garde
  // son ordre alphabétique.
  const sector = sectorForLead(lead, sectors);
  const assigneeOptions = useMemo(
    () => staffOptionsFor(activeStaff, sector, coverage),
    [activeStaff, sector, coverage],
  );

  const persist = async (overrides: Partial<{ status: Status }> = {}) => {
    const nextStatus = overrides.status ?? status;
    setSaving(true);
    setError('');
    const t = WRITE_TARGET[lead.source];
    try {
      await updateRecord(t.tableId, lead.id, {
        [t.status]: nextStatus,
        [t.priority]: priority,
        [t.partner]: partner,
        // Champ de liaison : un tableau d'identifiants, jamais une chaîne.
        [t.assignee]: assigneeId ? [assigneeId] : [],
        [t.notes]: notes,
      });
      const name = staff.find((s) => s.id === assigneeId)?.name;
      onSaved({
        status: nextStatus,
        priority,
        partner,
        notes,
        assigneeIds: assigneeId ? [assigneeId] : [],
        assigneeNames: name ? [name] : [],
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "L'enregistrement a échoué. Vérifiez la connexion et réessayez.",
      );
    } finally {
      setSaving(false);
    }
  };

  const address = formatAddress(lead.address);

  return (
    <div
      // Trois signaux de profondeur cumulés : un voile assez dense pour que
      // le fond cesse d'être lisible, un flou qui le repousse, et l'ombre
      // portée du panneau. Le voile à 40 % sans flou laissait une surface
      // blanche sur un fond quasi blanc, impossible à distinguer.
      className="modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-panel flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card bg-surface sm:rounded-card"
      >
        {/* ---- en-tête fixe ---- */}
        {/* Fond légèrement teinté : donne une structure interne au panneau et
            marque la limite de la zone défilante. */}
        <header className="flex items-start justify-between gap-3 border-b border-line bg-canvas px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-bold text-ink">
              {lead.fullName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusBadge status={lead.status} />
              <PriorityBadge priority={lead.priority} />
              <span>
                Reçue <RelativeDate iso={lead.date} />
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-control p-1.5 text-muted hover:bg-canvas hover:text-ink"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        {/* ---- corps défilant ---- */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Field icon={Mail} label="Email">
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="text-teal-ink hover:underline">
                  {lead.email}
                </a>
              ) : (
                <Dash />
              )}
            </Field>
            <Field icon={Phone} label="Téléphone">
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className="text-teal-ink hover:underline">
                  {lead.phone}
                </a>
              ) : (
                <Dash />
              )}
            </Field>
            <Field icon={Building2} label="Entreprise">
              {lead.company || <Dash />}
            </Field>
            <Field icon={User} label="Type">
              {lead.category || <Dash />}
            </Field>
            {lead.motive && (
              <Field icon={Briefcase} label="Motif" wide>
                {lead.motive}
              </Field>
            )}
            <Field icon={MapPin} label="Adresse" wide>
              {address || <Dash />}
            </Field>
          </section>

          {lead.source === 'solar' && lead.metrics && (
            <section className="grid grid-cols-3 gap-3 rounded-card border border-line bg-canvas p-3">
              <Metric icon={Euro} label="Facture" value={lead.metrics.monthlyBill} unit="€/mois" />
              <Metric icon={Sun} label="Puissance" value={lead.metrics.recommendedPower} unit="kWc" />
              <Metric icon={Zap} label="Consommation" value={lead.metrics.annualConsumption} unit="kWh/an" />
            </section>
          )}

          {lead.message && (
            <section className="rounded-card border border-line bg-canvas p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <MessageSquare className="h-4 w-4 text-teal-ink" strokeWidth={1.75} aria-hidden="true" />
                Message
              </h3>
              <p className="whitespace-pre-wrap text-sm text-ink">{lead.message}</p>
            </section>
          )}

          {/* ---- édition du suivi ---- */}
          <section className="space-y-4 rounded-card border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">Suivi commercial</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Les deux listes reprennent le code couleur de la valeur
                  sélectionnée : on lit l'état du dossier sans avoir à
                  déchiffrer le libellé. */}
              <Label text="Statut">
                <select
                  data-autofocus
                  className={`field font-semibold ${TONE_CLASS[STATUS_TONE[status]]}`}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                >
                  {/* Un statut historique hors liste reste sélectionnable pour
                      ne pas le réécrire silencieusement à l'enregistrement. */}
                  {(SELECTABLE_STATUSES.includes(status)
                    ? SELECTABLE_STATUSES
                    : STATUSES
                  ).map((s) => (
                    <option key={s} value={s} className="bg-surface font-normal text-ink">
                      {s}
                    </option>
                  ))}
                </select>
              </Label>

              <Label text="Priorité">
                <select
                  className={`field font-semibold ${TONE_CLASS[PRIORITY_TONE[priority]]}`}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p} className="bg-surface font-normal text-ink">
                      {p}
                    </option>
                  ))}
                </select>
              </Label>

              {/* Pleine largeur : la liste déroulante doit avoir la place
                  d'afficher un nom complet et les départements qu'il couvre
                  sans troncature. */}
              <div className="sm:col-span-2">
                <Label text="Assigné à">
                  {/* 35 collaborateurs : un select natif se parcourt à l'œil,
                      celui-ci se filtre au clavier et trie alphabétiquement. */}
                  <SearchableSelect
                    ariaLabel="Assigné à"
                    emptyLabel="Non assigné"
                    searchPlaceholder="Rechercher un collaborateur…"
                    value={assigneeId}
                    onChange={setAssigneeId}
                    options={assigneeOptions}
                    pinnedLabel={sector ? `Secteur ${sector.code}` : undefined}
                    restLabel="Autres collaborateurs"
                  />
                </Label>
              </div>

              <div className="sm:col-span-2">
                <Label text="Partenaire">
                  <input
                    className="field"
                    value={partner}
                    onChange={(e) => setPartner(e.target.value)}
                    placeholder="Aucun"
                  />
                </Label>
              </div>
            </div>

            <Label text="Notes">
              <textarea
                className="field min-h-24 resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contexte, échanges, prochaine étape…"
              />
            </Label>
          </section>

          {error && (
            <Callout tone="danger" icon={AlertTriangle}>
              {error}
            </Callout>
          )}
        </div>

        {/* ---- pied fixe ---- */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas px-5 py-3">
          {/* Un clic, sans confirmation. La charte proscrit l'accès direct
              aux actions destructrices, mais celle-ci ne détruit rien : elle
              pose un statut, que la liste juste au-dessus permet de changer
              aussitôt. Une confirmation n'était que de la friction sur un
              geste de tri courant. */}
          <SecondaryButton
            tone="danger"
            icon={AlertTriangle}
            busy={saving}
            disabled={status === 'Hors Critères'}
            onClick={() => void persist({ status: 'Hors Critères' })}
          >
            Hors critères
          </SecondaryButton>

          <div className="flex items-center gap-2">
            <SecondaryButton onClick={onClose}>Fermer</SecondaryButton>
            {/* Désactivé tant que rien n'a changé. */}
            <button
              type="button"
              onClick={() => persist()}
              disabled={saving || !dirty}
              className="group inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- fragments */

const Dash = () => (
  <span className="text-muted" aria-label="non renseigné">
    —
  </span>
);

function Field({
  icon: Icon,
  label,
  children,
  wide = false,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{text}</span>
      {children}
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  unit: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </p>
      {/* Valeurs numériques alignées à droite (charte). */}
      <p className="text-right text-lg font-semibold tabular-nums text-ink">
        {value != null ? value : '—'}
        {value != null && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}
