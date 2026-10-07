/**
 * Gestion des statuts de suivi — réservée aux admins (groupes RH Direction et
 * Administratif).
 *
 * Ajouter, renommer, recolorer, réordonner, archiver. Jamais supprimer : des
 * demandes sont liées à chaque statut, et le proxy refuse de toute façon un
 * `DELETE` sur la table Statuts. Un statut archivé quitte les menus de saisie
 * mais reste affiché sur les demandes qui le portent, et se restaure d'un clic.
 *
 * Les statuts qui portent un **rôle** — les sept d'origine — se renomment et
 * se recolorent, mais ne s'archivent pas : les KPI, l'archivage des doublons,
 * les tuiles et le webhook Typeform s'y accrochent. Les archiver retirerait
 * « Nouveau » du formulaire alors que chaque demande entrante y arrive.
 *
 * Pas d'écriture optimiste : chaque changement attend la ligne renvoyée par
 * Airtable, qui fait foi, puis la remplace dans le registre. Un renommage
 * refusé laisse donc l'ancien nom affiché, avec le message d'Airtable tel quel.
 */
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Lock,
  Plus,
  Settings2,
  X,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { createRecord, updateRecord } from '../lib/airtable';
import { STATUS, TABLES, TONES, type Tone } from '../lib/schema';
import { byOrder, toStatusDef, type StatusDef } from '../lib/statuses';
import { TONE_ACCENT, TONE_ICON } from '../lib/tones';
import { Callout, PrimaryButton, SecondaryButton, StatusBadge } from './ui';

interface Props {
  /** Tous les statuts, archivés compris. */
  statuses: StatusDef[];
  /** Nombre de demandes par identifiant de statut, les deux tables confondues. */
  usage: Map<string, number>;
  /** Erreur de chargement de la table Statuts, s'il y en a une. */
  loadError: string;
  /** Remplace la liste après une écriture réussie. */
  onChange: (next: StatusDef[]) => void;
  onClose: () => void;
}

const normName = (s: string) =>
  s.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function StatusManagerModal({ statuses, usage, loadError, onChange, onClose }: Props) {
  const dialogRef = useDialog(onClose);
  const titleId = useId();
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const sorted = useMemo(() => [...statuses].sort(byOrder), [statuses]);
  const active = sorted.filter((s) => !s.archived);
  const archived = sorted.filter((s) => s.archived);

  /** Un nom vide ou déjà pris — accents et casse ignorés — est refusé avant l'écriture. */
  const nameProblem = (name: string, selfId?: string): string => {
    if (!name.trim()) return 'Le nom ne peut pas être vide.';
    const taken = statuses.some((s) => s.id !== selfId && normName(s.name) === normName(name));
    return taken ? 'Un statut porte déjà ce nom.' : '';
  };

  const replaceAll = (updated: StatusDef[]) => {
    const byId = new Map(updated.map((s) => [s.id, s]));
    onChange(statuses.map((s) => byId.get(s.id) ?? s));
  };

  const write = async (id: string, fields: Record<string, unknown>) => {
    setFailure('');
    setPending(id);
    try {
      const record = await updateRecord(TABLES.statuses, id, fields);
      replaceAll([toStatusDef(record)]);
      return true;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Écriture refusée');
      return false;
    } finally {
      setPending(null);
    }
  };

  /** Échange la position de deux statuts voisins : deux écritures, l'une après l'autre. */
  const move = async (status: StatusDef, direction: -1 | 1) => {
    const index = active.findIndex((s) => s.id === status.id);
    const other = active[index + direction];
    if (!other) return;
    setFailure('');
    setPending(status.id);
    try {
      // Des ordres égaux ou absents s'échangeraient sans effet : on repart des
      // positions affichées, qui sont toujours distinctes.
      const a = await updateRecord(TABLES.statuses, status.id, { [STATUS.order]: index + 1 + direction });
      const b = await updateRecord(TABLES.statuses, other.id, { [STATUS.order]: index + 1 });
      replaceAll([toStatusDef(a), toStatusDef(b)]);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Écriture refusée');
    } finally {
      setPending(null);
    }
  };

  const create = async (name: string, tone: Tone) => {
    setFailure('');
    setPending('new');
    try {
      const last = Math.max(0, ...statuses.filter((s) => s.order < Number.MAX_SAFE_INTEGER).map((s) => s.order));
      const record = await createRecord(TABLES.statuses, {
        [STATUS.name]: name.trim(),
        [STATUS.tone]: tone,
        [STATUS.order]: last + 1,
      });
      onChange([...statuses, toStatusDef(record)]);
      return true;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Création refusée');
      return false;
    } finally {
      setPending(null);
    }
  };

  const rowProps = (s: StatusDef) => ({
    status: s,
    count: usage.get(s.id) ?? 0,
    busy: pending === s.id,
    disabled: pending !== null && pending !== s.id,
    confirming: confirming === s.id,
    nameProblem: (name: string) => nameProblem(name, s.id),
    onRename: (name: string) => write(s.id, { [STATUS.name]: name.trim() }),
    onTone: (tone: Tone) => void write(s.id, { [STATUS.tone]: tone }),
    onAskArchive: () => setConfirming(s.id),
    onCancelArchive: () => setConfirming(null),
    onArchive: (value: boolean) => {
      setConfirming(null);
      void write(s.id, { [STATUS.archived]: value });
    },
  });

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
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-panel flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-card bg-surface sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-teal-soft text-teal-ink"
            >
              <Settings2 className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-bold text-ink">
                Gérer les statuts
              </h2>
              <p className="text-sm text-muted">
                Les changements s&apos;appliquent à toutes les demandes, pour tout le
                monde. Un statut archivé quitte les menus mais reste affiché sur
                les demandes qui le portent.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-control p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loadError && (
            <Callout tone="danger" icon={AlertTriangle}>
              <strong>Table Statuts illisible.</strong> {loadError} La liste ci-dessous
              est celle d&apos;origine : rechargez la page avant de la modifier.
            </Callout>
          )}
          {failure && (
            <div aria-live="polite">
              <Callout tone="danger" icon={AlertTriangle}>
                <strong>Écriture refusée.</strong> {failure}
              </Callout>
            </div>
          )}

          <ul className="divide-y divide-line rounded-card border border-line">
            {active.map((s, i) => (
              <StatusRow
                key={s.id}
                {...rowProps(s)}
                onUp={i > 0 ? () => void move(s, -1) : undefined}
                onDown={i < active.length - 1 ? () => void move(s, 1) : undefined}
              />
            ))}
          </ul>

          <NewStatusRow
            busy={pending === 'new'}
            disabled={pending !== null && pending !== 'new'}
            nameProblem={(name) => nameProblem(name)}
            onCreate={create}
          />

          {archived.length > 0 && (
            <details className="rounded-card border border-line">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
                Statuts archivés ({archived.length})
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {archived.map((s) => (
                  <StatusRow key={s.id} {...rowProps(s)} />
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ligne */

function StatusRow({
  status,
  count,
  busy,
  disabled,
  confirming,
  nameProblem,
  onRename,
  onTone,
  onUp,
  onDown,
  onAskArchive,
  onCancelArchive,
  onArchive,
}: {
  status: StatusDef;
  count: number;
  busy: boolean;
  disabled: boolean;
  confirming: boolean;
  nameProblem: (name: string) => string;
  onRename: (name: string) => Promise<boolean>;
  onTone: (tone: Tone) => void;
  onUp?: () => void;
  onDown?: () => void;
  onAskArchive: () => void;
  onCancelArchive: () => void;
  onArchive: (value: boolean) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(status.name);
  const [touched, setTouched] = useState(false);
  const problem = touched ? nameProblem(draft) : '';
  const system = status.role !== null;
  const locked = busy || disabled;

  // Le brouillon suit le nom enregistré tant qu'on ne l'édite pas.
  if (!touched && draft !== status.name) setDraft(status.name);

  const commit = async () => {
    if (draft.trim() === status.name) {
      setTouched(false);
      setDraft(status.name);
      return;
    }
    if (nameProblem(draft)) return;
    if (await onRename(draft)) setTouched(false);
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="w-36 shrink-0">
        <StatusBadge status={{ ...status, name: draft.trim() || status.name }} />
      </div>

      <div className="min-w-[10rem] flex-1">
        <label htmlFor={inputId} className="sr-only">
          Nom du statut {status.name}
        </label>
        <input
          id={inputId}
          className="field"
          value={draft}
          disabled={locked}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${inputId}-err` : undefined}
          onChange={(e) => {
            setTouched(true);
            setDraft(e.target.value);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape' && touched) {
              // Annule l'édition sans fermer la fenêtre.
              e.stopPropagation();
              setTouched(false);
              setDraft(status.name);
            }
          }}
        />
        {problem && (
          <p id={`${inputId}-err`} className="mt-1 text-xs text-danger">
            {problem}
          </p>
        )}
      </div>

      <ToneSwatches
        value={status.tone}
        disabled={locked}
        label={`Couleur du statut ${status.name}`}
        onChange={onTone}
      />

      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
        {count} demande{count > 1 ? 's' : ''}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {!status.archived && (
          <>
            <IconButton icon={ArrowUp} label={`Monter ${status.name}`} onClick={onUp} disabled={locked || !onUp} />
            <IconButton icon={ArrowDown} label={`Descendre ${status.name}`} onClick={onDown} disabled={locked || !onDown} />
          </>
        )}

        {busy ? (
          <Loader2 className="mx-2 h-[18px] w-[18px] animate-spin text-muted" strokeWidth={2} aria-label="Enregistrement…" />
        ) : status.archived ? (
          <SecondaryButton icon={ArchiveRestore} disabled={disabled} onClick={() => onArchive(false)}>
            Restaurer
          </SecondaryButton>
        ) : system ? (
          // Statut système : pas d'archivage, et l'écran dit pourquoi plutôt
          // que de présenter un bouton désactivé muet.
          <span
            className="inline-flex items-center gap-1.5 px-2 text-xs text-muted"
            title="Utilisé par les indicateurs, l'archivage des doublons et les nouvelles demandes"
          >
            <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Statut système
          </span>
        ) : confirming ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs font-medium text-ink">
              Archiver{count ? ` (${count} demande${count > 1 ? 's' : ''} le gardent)` : ''} ?
            </span>
            <IconButton icon={Check} label="Confirmer l'archivage" onClick={() => onArchive(true)} tone="danger" />
            <IconButton icon={X} label="Annuler" onClick={onCancelArchive} />
          </span>
        ) : (
          <SecondaryButton icon={Archive} disabled={disabled} onClick={onAskArchive}>
            Archiver
          </SecondaryButton>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ ajout */

function NewStatusRow({
  busy,
  disabled,
  nameProblem,
  onCreate,
}: {
  busy: boolean;
  disabled: boolean;
  nameProblem: (name: string) => string;
  onCreate: (name: string, tone: Tone) => Promise<boolean>;
}) {
  const inputId = useId();
  const [name, setName] = useState('');
  const [tone, setTone] = useState<Tone>('neutral');
  const problem = name ? nameProblem(name) : '';
  const valid = Boolean(name.trim()) && !problem;

  const submit = async () => {
    if (!valid) return;
    if (await onCreate(name, tone)) {
      setName('');
      setTone('neutral');
    }
  };

  return (
    <div className="space-y-3 rounded-card border border-dashed border-line p-4">
      <h3 className="text-sm font-semibold text-ink">Nouveau statut</h3>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor={inputId} className="sr-only">
            Nom du nouveau statut
          </label>
          <input
            id={inputId}
            className="field"
            placeholder="Nom du statut, ex. « Rendez-vous fixé »"
            value={name}
            disabled={busy || disabled}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${inputId}-err` : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          {problem && (
            <p id={`${inputId}-err`} className="mt-1 text-xs text-danger">
              {problem}
            </p>
          )}
        </div>
        <ToneSwatches value={tone} disabled={busy || disabled} label="Couleur du nouveau statut" onChange={setTone} />
        <PrimaryButton busy={busy} disabled={!valid || disabled} onClick={() => void submit()}>
          <Plus className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          Ajouter
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- primitives */

/**
 * Palette fermée des tons de la charte, en boutons radio.
 *
 * Chaque pastille porte l'icône du ton et son nom en libellé accessible : le
 * choix ne repose jamais sur la seule perception de la couleur.
 */
function ToneSwatches({
  value,
  disabled,
  label,
  onChange,
}: {
  value: Tone;
  disabled: boolean;
  label: string;
  onChange: (tone: Tone) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 items-center gap-1">
      {TONES.map(({ tone, label: toneLabel }) => {
        const Icon = TONE_ICON[tone];
        const checked = tone === value;
        return (
          <button
            key={tone}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={toneLabel}
            title={toneLabel}
            disabled={disabled}
            onClick={() => !checked && onChange(tone)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-shadow focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${TONE_ACCENT[tone]} ${
              checked ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: typeof Check;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-control p-1.5 transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'danger' ? 'text-danger hover:bg-danger-bg' : 'text-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
