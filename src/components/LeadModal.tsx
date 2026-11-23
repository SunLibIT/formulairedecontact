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
 * Charte : en-tête fixe, corps défilant (deux colonnes sur grand écran depuis
 * le 23/11/2026 : la demande à gauche, le suivi à droite), pied fixe ; `role="dialog"` +
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
  Archive,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Euro,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Save,
  Settings2,
  Sun,
  User,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { updateRecord } from '../lib/airtable';
import type { DuplicateMark } from '../lib/duplicates';
import { formatPersonName, formatPhone } from '../lib/format';
import { duplicateNote } from '../lib/leadActions';
import { formatAddress, type Lead, type StaffMember } from '../lib/records';
import {
  PRIORITIES,
  PRIORITY_TONE,
  type Priority,
} from '../lib/schema';
import {
  isLegacyId,
  selectableStatuses,
  statusForRole,
  type StatusDef,
  type StatusRegistry,
} from '../lib/statuses';
import {
  sectorForLead,
  staffGroups,
  staffOptionsFor,
  type CoverageIndex,
  type SectorIndex,
} from '../lib/territories';
import { TONE_STYLE, statusChipStyle } from '../lib/tones';
import { ListeChoix, Monogram, Tooltip } from './kit';
import { WRITE_TARGET, statusWrite } from '../lib/writeTargets';
import { SearchableSelect } from './SearchableSelect';
import { Callout, PriorityBadge, RelativeDate, SecondaryButton, StatusBadge } from './ui';

interface Props {
  lead: Lead;
  staff: StaffMember[];
  statuses: StatusRegistry;
  /** Ouvre la gestion des statuts. Absent — non-admin — : pas de bouton. */
  onManageStatuses?: () => void;
  /** Sectorisation commerciale. Vide tant qu'elle n'est pas chargée. */
  sectors: SectorIndex;
  /** Départements couverts par collaborateur. */
  coverage: CoverageIndex;
  /** Renseigné quand l'adresse de la demande en porte plusieurs. */
  duplicate?: DuplicateMark;
  /** Archive cette demande répétée. Absent : pas de bouton d'archivage. */
  onArchiveDuplicate?: (lead: Lead) => Promise<void>;
  onClose: () => void;
  /** Applique le changement dans la liste sans rechargement complet. */
  onSaved: (patch: Partial<Lead>) => void;
}

export function LeadModal({
  lead,
  staff,
  statuses,
  onManageStatuses,
  sectors,
  coverage,
  duplicate,
  onArchiveDuplicate,
  onClose,
  onSaved,
}: Props) {
  const [status, setStatus] = useState<StatusDef>(lead.status);
  const statusId = useId();
  // Raccourci « Hors critères » : le statut qui porte ce rôle, sous son nom
  // courant. Aucun ne le porte — un admin l'a retiré — : pas de bouton.
  const rejected = statusForRole(statuses, 'hors_criteres');
  const [priority, setPriority] = useState<Priority>(lead.priority);
  const [partner, setPartner] = useState(lead.partner);
  const [assigneeId, setAssigneeId] = useState(lead.assigneeIds[0] ?? '');
  const [notes, setNotes] = useState(lead.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** Archivage : deux temps, comme partout ailleurs sur un geste irréversible à l'œil. */
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const titleId = useId();
  // Piège de focus, Échap, verrou de défilement et restitution du focus :
  // mutualisés avec la modale d'assignation.
  const dialogRef = useDialog(onClose);

  const dirty =
    status.id !== lead.status.id ||
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

  const persist = async (overrides: Partial<{ status: StatusDef }> = {}) => {
    const nextStatus = overrides.status ?? status;
    setSaving(true);
    setError('');
    const t = WRITE_TARGET[lead.source];
    // Le lien est réécrit à chaque enregistrement, même inchangé : c'est ce
    // qui rattache une demande encore lue sur l'ancien select. Sauf pour un
    // libellé hérité inconnu, qui n'a pas de ligne Statuts à désigner.
    const write = isLegacyId(nextStatus.id) ? null : statusWrite(lead.source, nextStatus);
    try {
      await updateRecord(t.tableId, lead.id, {
        ...write?.fields,
        [t.priority]: priority,
        [t.partner]: partner,
        // Champ de liaison : un tableau d'identifiants, jamais une chaîne.
        [t.assignee]: assigneeId ? [assigneeId] : [],
        [t.notes]: notes,
      });
      const name = staff.find((s) => s.id === assigneeId)?.name;
      onSaved({
        ...write?.local,
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
  const name = formatPersonName(lead.fullName) || lead.fullName || 'Sans nom';
  const subtitle = [lead.category, lead.company].filter(Boolean).join(' · ');
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : '';

  return (
    <div
      // Voile dense + flou + ombre du panneau : le fond cesse d'être lisible.
      className="modal-overlay fixed inset-0 z-[2000] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
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
        onKeyDown={(e) => {
          // Ctrl/⌘ + Entrée enregistre, d'où que l'on soit dans la fiche.
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && dirty && !saving) {
            e.preventDefault();
            void persist();
          }
        }}
        className="modal-panel flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card bg-surface sm:rounded-card lg:max-w-5xl"
      >
        {/* ---- en-tête fixe : qui, où en est la demande, depuis quand ---- */}
        <header className="flex items-start gap-3 border-b border-line bg-surface px-5 py-4">
          <Monogram name={lead.fullName} size={44} />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg font-bold leading-tight text-ink">
              {name}
            </h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusBadge status={lead.status} />
              <PriorityBadge priority={lead.priority} />
              <span className="inline-flex items-center gap-1 rounded-md bg-canvas px-2 py-0.5 font-medium">
                {lead.source === 'solar' ? (
                  <Sun className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Mail className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                )}
                {lead.source === 'solar' ? 'Lead simulateur' : 'Demande de contact'}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                Reçue <RelativeDate iso={lead.date} />
              </span>
            </div>
          </div>
          <Tooltip content="Fermer (Échap)">
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </button>
          </Tooltip>
        </header>

        {/* ---- corps défilant : deux colonnes sur grand écran ---- */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
            {/* Colonne de gauche : la demande, en lecture */}
            <div className="space-y-4">
              {/* Doublon : à trancher avant le reste. Le bouton n'apparaît que
                  sur une demande effectivement répétée. */}
              {duplicate && onArchiveDuplicate && (
                <section className="space-y-2.5 rounded-card border border-amber-border bg-amber-bg p-3.5">
                  <p className="flex items-start gap-2 text-sm">
                    <Copy className="mt-0.5 h-4 w-4 shrink-0 text-amber" strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="font-semibold text-ink">Demande répétée</span>
                      <span className="text-muted">
                        {' — '}
                        {duplicateNote(duplicate).title}.
                      </span>{' '}
                      <span className="text-muted">
                        L'archiver la retire des listes sans rien supprimer : son
                        statut passe à « Archivé » et tout reste consultable dans
                        Airtable.
                      </span>
                    </span>
                  </p>

                  {confirmingArchive ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">Archiver cette demande&nbsp;?</span>
                      <SecondaryButton
                        icon={Archive}
                        busy={archiving}
                        onClick={() => {
                          setArchiving(true);
                          setError('');
                          void (async () => {
                            try {
                              await onArchiveDuplicate(lead);
                              onClose();
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "L'archivage n'a pas pu être enregistré. Réessayez.",
                              );
                              setArchiving(false);
                              setConfirmingArchive(false);
                            }
                          })();
                        }}
                      >
                        Confirmer
                      </SecondaryButton>
                      <SecondaryButton onClick={() => setConfirmingArchive(false)} disabled={archiving}>
                        Annuler
                      </SecondaryButton>
                    </div>
                  ) : (
                    <SecondaryButton icon={Archive} onClick={() => setConfirmingArchive(true)}>
                      Archiver ce doublon
                    </SecondaryButton>
                  )}
                </section>
              )}

              <Carte icon={User} titre="Coordonnées">
                {/* Une tuile par ligne, à toutes les largeurs : côte à côte, la
                    demi-colonne laissait ~150 px à l'e-mail, coupé même sur un
                    grand écran. */}
                <div className="grid gap-2">
                  <TuileContact
                    icon={Mail}
                    label="E-mail"
                    valeur={lead.email}
                    href={lead.email ? `mailto:${lead.email}` : ''}
                    action="Écrire"
                  />
                  <TuileContact
                    icon={Phone}
                    label="Téléphone"
                    valeur={lead.phone ? formatPhone(lead.phone) : ''}
                    copie={lead.phone}
                    href={lead.phone ? `tel:${lead.phone}` : ''}
                    action="Appeler"
                  />
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Field icon={MapPin} label="Adresse" wide>
                    {address ? (
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span>{address}</span>
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-ink hover:underline"
                        >
                          Voir sur la carte
                          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                        </a>
                      </span>
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
                </dl>
              </Carte>

              {(lead.motive || lead.message) && (
                <Carte icon={MessageSquare} titre="La demande">
                  {lead.motive && (
                    <p className="flex items-start gap-2 text-sm font-semibold text-ink">
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
                      <span className="min-w-0 break-words">{lead.motive}</span>
                    </p>
                  )}
                  {lead.message && (
                    // Citation : c'est la voix du demandeur, pas une valeur de champ.
                    <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-control bg-canvas px-3.5 py-3 text-sm italic leading-relaxed text-ink">
                      {lead.message}
                    </blockquote>
                  )}
                </Carte>
              )}

              {lead.source === 'solar' && lead.metrics && (
                <Carte icon={Sun} titre="Simulation">
                  <div className="grid grid-cols-3 gap-2">
                    <Metric icon={Euro} label="Facture" value={lead.metrics.monthlyBill} unit="€/mois" />
                    <Metric icon={Sun} label="Puissance" value={lead.metrics.recommendedPower} unit="kWc" />
                    <Metric icon={Zap} label="Conso." value={lead.metrics.annualConsumption} unit="kWh/an" />
                  </div>
                </Carte>
              )}
            </div>

            {/* Colonne de droite : le suivi, en écriture. Collée en haut sur
                grand écran pour rester sous la main pendant la lecture. */}
            <div className="space-y-4 lg:sticky lg:top-0">
              <Carte icon={ClipboardList} titre="Suivi commercial">
                <div className="grid gap-4">
                  {/* Les deux listes reprennent le code couleur de la valeur choisie. */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      <label htmlFor={statusId} className="mb-1.5 block text-xs font-medium text-muted">
                        Statut
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          {/* Un statut archivé ou hérité reste dans la liste quand la
                              demande le porte, pour ne pas le réécrire en silence. */}
                          <ListeChoix
                            id={statusId}
                            autoFocus
                            ariaLabel="Statut"
                            value={status.id}
                            onChange={(v) => {
                              const next = statuses.byId.get(v);
                              if (next) setStatus(next);
                            }}
                            options={selectableStatuses(statuses, status).map((st) => ({
                              v: st.id,
                              l: st.name,
                              rendu: <PastilleStatut nom={st.name} couleur={st.color} />,
                            }))}
                            style={{ ...statusChipStyle(status.color), fontWeight: 600 }}
                          />
                        </span>
                        {onManageStatuses && (
                          <Tooltip content="Gérer les statuts">
                            <button
                              type="button"
                              onClick={onManageStatuses}
                              className="inline-flex shrink-0 items-center justify-center self-stretch rounded-control border border-line bg-surface px-2.5 text-muted transition-colors hover:text-ink focus-visible:shadow-focus focus-visible:outline-none"
                              aria-label="Gérer les statuts"
                            >
                              <Settings2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    <Champ text="Priorité">
                      <ListeChoix
                        ariaLabel="Priorité"
                        value={priority}
                        onChange={(v) => setPriority(v as Priority)}
                        options={PRIORITIES.map((p) => ({ v: p, l: p }))}
                        style={{ ...TONE_STYLE[PRIORITY_TONE[priority]], fontWeight: 600 }}
                      />
                    </Champ>
                  </div>

                  {/* Le commercial du département est remonté en tête de liste. */}
                  <Champ text={sector ? `Assigné à · secteur ${sector.code}` : 'Assigné à'}>
                    <SearchableSelect
                      ariaLabel="Assigné à"
                      emptyLabel="Non assigné"
                      searchPlaceholder="Rechercher un collaborateur…"
                      value={assigneeId}
                      onChange={setAssigneeId}
                      options={assigneeOptions}
                      groups={staffGroups(sector)}
                    />
                  </Champ>

                  <Label text="Partenaire">
                    <input
                      className="field"
                      value={partner}
                      onChange={(e) => setPartner(e.target.value)}
                      placeholder="Aucun"
                    />
                  </Label>

                  <Label text="Notes internes">
                    <textarea
                      className="field min-h-28 resize-y"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Contexte, échanges, prochaine étape…"
                    />
                  </Label>
                </div>
              </Carte>

              {error && (
                <Callout tone="danger" icon={AlertTriangle}>
                  {error}
                </Callout>
              )}
            </div>
          </div>
        </div>

        {/* ---- pied fixe ---- */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-5 py-3">
          {/* « Hors critères » en un clic : il pose un statut que la liste
              ci-dessus permet de changer aussitôt, il ne détruit rien. */}
          {rejected ? (
            <SecondaryButton
              tone="danger"
              icon={AlertTriangle}
              busy={saving}
              disabled={status.id === rejected.id}
              onClick={() => void persist({ status: rejected })}
            >
              {rejected.name}
            </SecondaryButton>
          ) : (
            <span />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && !saving && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[color:var(--amber-soft)]" />
                Modifications non enregistrées
              </span>
            )}
            <SecondaryButton onClick={onClose}>Fermer</SecondaryButton>
            {/* Désactivé tant que rien n'a changé. */}
            <Tooltip content="Enregistrer (Ctrl + Entrée)">
              <button
                type="button"
                onClick={() => persist()}
                disabled={saving || !dirty}
                className="group inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(14,147,132,.7)] transition-[transform,opacity] hover:-translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <Save className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </Tooltip>
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

/** Libellé posé au-dessus d'un menu du Kit : jamais de `<label>` autour d'un `Deroulant`. */
function Champ({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{text}</span>
      {children}
    </div>
  );
}

/** Option de statut : pastille ronde à la couleur Airtable du statut. */
function PastilleStatut({ nom, couleur }: { nom: string; couleur: string }) {
  return (
    <>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', flex: 'none', background: couleur }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</span>
    </>
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
    <div className="rounded-control bg-canvas px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </p>
      {/* Unité sous la valeur : sur un écran étroit, « 228 000 kWh/an »
          en ligne se coupait au milieu de l'unité. */}
      <p className="mt-0.5 whitespace-nowrap text-base font-bold tabular-nums text-ink sm:text-lg">
        {value != null ? value.toLocaleString('fr-FR') : '—'}
      </p>
      {value != null && <p className="whitespace-nowrap text-[11px] font-medium text-muted">{unit}</p>}
    </div>
  );
}

/** Section de la fiche : carte blanche, titre précédé d'une pastille d'icône teal. */
function Carte({ icon: Icon, titre, children }: { icon: LucideIcon; titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,26,40,.05)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-[8px] bg-teal-soft text-teal">
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
        {titre}
      </h3>
      {children}
    </section>
  );
}

/**
 * Tuile de coordonnée : la valeur, un bouton pour la copier et un lien
 * d'action (écrire, appeler). Vide : un tiret, pas de bouton.
 */
function TuileContact({
  icon: Icon,
  label,
  valeur,
  copie,
  href,
  action,
}: {
  icon: LucideIcon;
  label: string;
  valeur: string;
  /** Texte copié, s'il diffère de l'affichage (numéro brut). */
  copie?: string;
  href: string;
  action: string;
}) {
  const [copie_ok, setCopieOk] = useState(false);
  const copier = () => {
    const texte = copie || valeur;
    void navigator.clipboard?.writeText(texte).then(
      () => {
        setCopieOk(true);
        window.setTimeout(() => setCopieOk(false), 1400);
      },
      () => {},
    );
  };
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-control border border-line bg-canvas px-3 py-2.5">
      <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-surface text-teal-ink">
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
        {valeur ? (
          // Jamais tronqué : une coordonnée coupée ne sert à rien. Sur un écran
          // étroit, l'e-mail passe à la ligne où il peut.
          <a href={href} className="block text-sm font-semibold text-ink [overflow-wrap:anywhere] hover:text-teal-ink hover:underline">
            {valeur}
          </a>
        ) : (
          <Dash />
        )}
      </div>
      {valeur && (
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip content={copie_ok ? 'Copié' : `Copier ${label.toLowerCase()}`}>
            <button
              type="button"
              onClick={copier}
              aria-label={`Copier ${label.toLowerCase()}`}
              className="grid h-8 w-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              {copie_ok ? (
                <Check className="h-4 w-4 text-teal" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
          <a
            href={href}
            className="hidden rounded-[8px] px-2 py-1 text-xs font-semibold text-teal-ink transition-colors hover:bg-teal-soft sm:inline-block"
          >
            {action}
          </a>
        </div>
      )}
    </div>
  );
}
