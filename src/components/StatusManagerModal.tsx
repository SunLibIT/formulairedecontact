/**
 * Gestion des statuts de suivi — réservée aux admins (groupes RH Direction et
 * Administratif).
 *
 * Tout statut se renomme, se recolore (couleur libre), se réordonne, change de
 * rôle, s'archive ou se supprime. Aucun n'est figé.
 *
 * - **Rôle** : ce que l'app sait d'un statut — celui des nouvelles demandes,
 *   celui de l'archivage, ceux des taux… (`ROLE_LABEL`). Un rôle se porte par
 *   un seul statut ; l'attribuer à un statut le retire à celui qui l'avait.
 *   Un rôle que plus personne ne porte éteint la règle qui en dépend, sans
 *   rien casser : la tuile disparaît, le bouton aussi.
 * - **Archiver** retire le statut des menus ; les demandes le gardent.
 * - **Supprimer** retire la ligne. Si des demandes le portent, il faut d'abord
 *   choisir vers quel statut les basculer : une suppression ne laisse jamais
 *   de demande sans statut.
 *
 * Pas d'écriture optimiste : chaque changement attend la ligne renvoyée par
 * Airtable, qui fait foi. Les mises à jour du registre passent par une
 * fonction de l'état précédent, pour que deux écritures rapprochées ne
 * s'effacent pas l'une l'autre.
 */
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { createRecord, deleteRecord, updateRecord, updateRecords, type AirtableRecord } from '../lib/airtable';
import {
  ROLE_LABEL,
  STATUS,
  STATUS_COLOR_PRESETS,
  STATUS_ROLES,
  TABLES,
  type StatusRole,
} from '../lib/schema';
import { FALLBACK_COLOR, byOrder, normaliseHex, toStatusDef, type StatusDef } from '../lib/statuses';
import { ListeChoix, Tooltip } from './kit';
import { Callout, PrimaryButton, SecondaryButton, StatusBadge } from './ui';

type Update = (change: (prev: StatusDef[]) => StatusDef[]) => void;

interface Props {
  /** Tous les statuts, archivés compris. */
  statuses: StatusDef[];
  /** Nombre de demandes par identifiant de statut, les deux tables confondues. */
  usage: Map<string, number>;
  /** Erreur de chargement de la table Statuts, s'il y en a une. */
  loadError: string;
  /** Applique un changement au registre, à partir de son état courant. */
  onChange: Update;
  /** Bascule les demandes d'un statut vers un autre, avant sa suppression. */
  onReassign: (fromId: string, to: StatusDef) => Promise<void>;
  onClose: () => void;
}

const normName = (s: string) =>
  s.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * La ligne renvoyée par Airtable après une écriture, ou une erreur.
 *
 * Une réponse sans nom ne se lit pas comme un statut vide : elle signale une
 * réponse indexée autrement que par identifiant. L'accepter a déjà affiché
 * « A relancer » comme une ligne grise sans nom, et fait croire à une perte de
 * données — mieux vaut un message que l'écran faux.
 */
function readBack(record: AirtableRecord): StatusDef {
  if (typeof record.fields?.[STATUS.name] !== 'string') {
    throw new Error(
      "Enregistré dans Airtable, mais la réponse est illisible : rechargez la page pour voir l'état réel.",
    );
  }
  return toStatusDef(record);
}

export function StatusManagerModal({
  statuses,
  usage,
  loadError,
  onChange,
  onReassign,
  onClose,
}: Props) {
  const dialogRef = useDialog(onClose);
  const titleId = useId();
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState('');

  const sorted = useMemo(() => [...statuses].sort(byOrder), [statuses]);
  const active = sorted.filter((s) => !s.archived);
  const archived = sorted.filter((s) => s.archived);

  /** Un nom vide ou déjà pris — accents et casse ignorés — est refusé avant l'écriture. */
  const nameProblem = (name: string, selfId?: string): string => {
    if (!name.trim()) return 'Le nom ne peut pas être vide.';
    const taken = statuses.some((s) => s.id !== selfId && normName(s.name) === normName(name));
    return taken ? 'Un statut porte déjà ce nom.' : '';
  };

  const merge = (rows: StatusDef[]) => {
    const byId = new Map(rows.map((s) => [s.id, s]));
    onChange((prev) => prev.map((s) => byId.get(s.id) ?? s));
  };

  /** Exécute une suite d'écritures pour une ligne, en affichant son état et l'erreur éventuelle. */
  const run = async (id: string, job: () => Promise<void>, fallback = 'Écriture refusée') => {
    setFailure('');
    setPending(id);
    try {
      await job();
      return true;
    } catch (e) {
      setFailure(errorText(e, fallback));
      return false;
    } finally {
      setPending(null);
    }
  };

  const patch = (id: string, fields: Record<string, unknown>) =>
    run(id, async () => {
      merge([readBack(await updateRecord(TABLES.statuses, id, fields))]);
    });

  /**
   * Échange la position de deux statuts voisins.
   *
   * Toute la liste active est renumérotée 1, 2, 3… dans l'ordre affiché, et
   * seules les lignes dont le numéro change sont écrites. Échanger les deux
   * seuls voisins laissait des ordres en double ailleurs (deux statuts à 9),
   * et le clic suivant n'avait alors aucun effet visible.
   */
  const move = (status: StatusDef, direction: -1 | 1) => {
    const index = active.findIndex((s) => s.id === status.id);
    const other = active[index + direction];
    if (!other) return;
    const next = [...active];
    next[index] = other;
    next[index + direction] = status;
    const order = new Map(next.map((s, i) => [s.id, i + 1]));
    const changed = next.filter((s) => s.order !== order.get(s.id));
    void run(status.id, async () => {
      const result = await updateRecords(
        TABLES.statuses,
        changed.map((s) => ({ id: s.id, fields: { [STATUS.order]: order.get(s.id) } })),
      );
      if (result.failed.length) throw new Error("Le nouvel ordre n'a pas pu être enregistré.");
      onChange((prev) => prev.map((s) => (order.has(s.id) ? { ...s, order: order.get(s.id)! } : s)));
    });
  };

  /** Un rôle n'a qu'un porteur : on le retire d'abord à celui qui l'avait. */
  const setRole = (status: StatusDef, role: StatusRole | null) =>
    void run(status.id, async () => {
      const rows: StatusDef[] = [];
      const holder = role ? statuses.find((s) => s.role === role && s.id !== status.id) : undefined;
      if (holder) {
        rows.push(readBack(await updateRecord(TABLES.statuses, holder.id, { [STATUS.role]: null })));
      }
      rows.push(readBack(await updateRecord(TABLES.statuses, status.id, { [STATUS.role]: role })));
      merge(rows);
    });

  const remove = (status: StatusDef, target: StatusDef | null) =>
    run(
      status.id,
      async () => {
        // Les demandes d'abord : si la bascule échoue, rien n'est supprimé.
        if (target) await onReassign(status.id, target);
        await deleteRecord(TABLES.statuses, status.id);
        onChange((prev) => prev.filter((s) => s.id !== status.id));
      },
      'Suppression refusée',
    );

  const create = (name: string, color: string) =>
    run(
      'new',
      async () => {
        const last = Math.max(
          0,
          ...statuses.filter((s) => s.order < Number.MAX_SAFE_INTEGER).map((s) => s.order),
        );
        const record = await createRecord(TABLES.statuses, {
          [STATUS.name]: name.trim(),
          [STATUS.color]: color,
          [STATUS.order]: last + 1,
        });
        const created = readBack(record);
        onChange((prev) => [...prev, created]);
      },
      'Création refusée',
    );

  const rowProps = (s: StatusDef) => ({
    status: s,
    count: usage.get(s.id) ?? 0,
    others: active.filter((o) => o.id !== s.id),
    busy: pending === s.id,
    disabled: pending !== null && pending !== s.id,
    nameProblem: (name: string) => nameProblem(name, s.id),
    onRename: (name: string) => patch(s.id, { [STATUS.name]: name.trim() }),
    onColor: (color: string) => void patch(s.id, { [STATUS.color]: color }),
    onRole: (role: StatusRole | null) => setRole(s, role),
    onArchive: (value: boolean) => void patch(s.id, { [STATUS.archived]: value }),
    onDelete: (target: StatusDef | null) => remove(s, target),
  });

  return (
    <div
      className="modal-overlay fixed inset-0 z-[2010] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
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
        className="modal-panel flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-card bg-surface sm:rounded-card"
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
                monde. Le nom s&apos;enregistre avec Entrée ou en quittant le champ.
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
          <div aria-live="polite">
            {failure && (
              <Callout tone="danger" icon={AlertTriangle}>
                <strong>Écriture refusée.</strong> {failure}
              </Callout>
            )}
          </div>

          <ul className="divide-y divide-line rounded-card border border-line">
            {active.map((s, i) => (
              <StatusRow
                key={s.id}
                {...rowProps(s)}
                onUp={i > 0 ? () => move(s, -1) : undefined}
                onDown={i < active.length - 1 ? () => move(s, 1) : undefined}
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

type Confirm = null | 'archive' | 'delete';

function StatusRow({
  status,
  count,
  others,
  busy,
  disabled,
  nameProblem,
  onRename,
  onColor,
  onRole,
  onUp,
  onDown,
  onArchive,
  onDelete,
}: {
  status: StatusDef;
  count: number;
  /** Statuts actifs vers lesquels basculer les demandes avant une suppression. */
  others: StatusDef[];
  busy: boolean;
  disabled: boolean;
  nameProblem: (name: string) => string;
  onRename: (name: string) => Promise<boolean>;
  onColor: (color: string) => void;
  onRole: (role: StatusRole | null) => void;
  onUp?: () => void;
  onDown?: () => void;
  onArchive: (value: boolean) => void;
  onDelete: (target: StatusDef | null) => Promise<boolean>;
}) {
  const inputId = useId();
  const roleId = useId();
  const [draft, setDraft] = useState(status.name);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [target, setTarget] = useState('');
  const problem = editing ? nameProblem(draft) : '';
  const locked = busy || disabled;

  // Le brouillon suit le nom enregistré tant qu'on ne l'édite pas.
  if (!editing && draft !== status.name) setDraft(status.name);

  const commit = async () => {
    if (!editing) return;
    if (draft.trim() === status.name) {
      setEditing(false);
      return;
    }
    if (nameProblem(draft)) return;
    if (await onRename(draft)) setEditing(false);
  };

  const targetStatus = others.find((o) => o.id === target) ?? null;

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
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
            readOnly={locked}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${inputId}-err` : undefined}
            onChange={(e) => {
              setEditing(true);
              setDraft(e.target.value);
            }}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commit();
              }
              if (e.key === 'Escape' && editing) {
                // Annule l'édition sans fermer la fenêtre.
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setEditing(false);
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
          ) : (
            <IconButton
              icon={Archive}
              label={`Archiver ${status.name}`}
              onClick={() => setConfirm('archive')}
              disabled={locked}
            />
          )}
          {!busy && (
            <IconButton
              icon={Trash2}
              label={`Supprimer ${status.name}`}
              tone="danger"
              onClick={() => {
                setTarget('');
                setConfirm('delete');
              }}
              disabled={locked}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:pl-[9.75rem]">
        <ColorPicker
          value={status.color}
          disabled={locked}
          label={`Couleur du statut ${status.name}`}
          onChange={onColor}
        />
        <div className="flex items-center gap-2">
          <span id={roleId} className="text-xs font-medium text-muted">
            Rôle
          </span>
          <span className="min-w-[13rem]">
            <ListeChoix
              compact
              ariaLabel="Rôle"
              value={status.role ?? ''}
              disabled={locked}
              onChange={(v) => onRole((v || null) as StatusRole | null)}
              options={[{ v: '', l: 'Aucun' }, ...STATUS_ROLES.map((r) => ({ v: r, l: ROLE_LABEL[r] }))]}
            />
          </span>
        </div>
      </div>

      {confirm === 'archive' && (
        <ConfirmBar
          tone="amber"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            onArchive(true);
          }}
          confirmLabel="Archiver"
        >
          Archiver « {status.name} » ? Il quitte les menus de saisie
          {count ? ` ; ${count} demande${count > 1 ? 's le gardent' : ' le garde'}` : ''}.
          {status.role && ` Son rôle « ${ROLE_LABEL[status.role].split(' —')[0]} » reste actif.`}
        </ConfirmBar>
      )}

      {confirm === 'delete' && (
        <ConfirmBar
          tone="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (await onDelete(targetStatus)) setConfirm(null);
          }}
          confirmLabel="Supprimer"
          confirmDisabled={count > 0 && !targetStatus}
        >
          <span className="block">
            Supprimer définitivement « {status.name} » ?
            {status.role && ` La règle « ${ROLE_LABEL[status.role].split(' —')[0]} » ne s’appliquera plus tant qu’aucun autre statut ne la reprend.`}
          </span>
          {count > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>
                {count} demande{count > 1 ? 's le portent' : ' le porte'} : basculer vers
              </span>
              <span className="min-w-[12rem]">
                <ListeChoix
                  compact
                  ariaLabel="Statut de bascule"
                  attente="— choisir un statut —"
                  value={target}
                  onChange={setTarget}
                  options={others.map((o) => ({ v: o.id, l: o.name }))}
                />
              </span>
            </div>
          )}
        </ConfirmBar>
      )}
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
  onCreate: (name: string, color: string) => Promise<boolean>;
}) {
  const inputId = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState(FALLBACK_COLOR);
  const problem = name ? nameProblem(name) : '';
  const valid = Boolean(name.trim()) && !problem;

  const submit = async () => {
    if (!valid) return;
    if (await onCreate(name, color)) {
      setName('');
      setColor(FALLBACK_COLOR);
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
            readOnly={busy || disabled}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${inputId}-err` : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
          {problem && (
            <p id={`${inputId}-err`} className="mt-1 text-xs text-danger">
              {problem}
            </p>
          )}
        </div>
        <PrimaryButton busy={busy} disabled={!valid || disabled} onClick={() => void submit()}>
          <Plus className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          Ajouter
        </PrimaryButton>
      </div>
      <ColorPicker value={color} disabled={busy || disabled} label="Couleur du nouveau statut" onChange={setColor} />
    </div>
  );
}

/* ---------------------------------------------------------------- primitives */

/**
 * Couleur **libre** : un sélecteur natif (n'importe quelle teinte) et un champ
 * hexadécimal, plus les couleurs de la charte en raccourci. La pastille du
 * statut en est dérivée (`statusChipStyle`) et le nom est toujours écrit : le
 * sens ne repose jamais sur la seule couleur.
 */
function ColorPicker({
  value,
  disabled,
  label,
  onChange,
}: {
  value: string;
  disabled: boolean;
  label: string;
  onChange: (color: string) => void;
}) {
  const hexId = useId();
  const [hex, setHex] = useState(value);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(value);
  if (!editing && hex !== value) setHex(value);

  // React relaie l'événement `input` du sélecteur natif sous le nom
  // `onChange` : une valeur par mouvement de souris, donc une écriture par
  // pixel. Le vrai `change` — émis à la fermeture du sélecteur — n'est
  // accessible qu'en natif.
  const nativeRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    const el = nativeRef.current;
    if (!el) return;
    const commit = () => {
      const next = normaliseHex(el.value);
      if (next && next !== latest.current.value) latest.current.onChange(next);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);
  useEffect(() => setPreview(value), [value]);

  const commitHex = () => {
    setEditing(false);
    const next = normaliseHex(hex);
    if (next && next !== value) onChange(next);
    else setHex(value);
  };

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted">Couleur</span>
      <input
        ref={nativeRef}
        type="color"
        value={preview}
        disabled={disabled}
        aria-label={`${label} — sélecteur libre`}
        // Aperçu local pendant le choix ; l'écriture attend la fermeture du
        // sélecteur (événement natif `change`, branché plus haut).
        onChange={(e) => setPreview(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-control border border-line bg-surface p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <label htmlFor={hexId} className="sr-only">
        {label} — code hexadécimal
      </label>
      <input
        id={hexId}
        className="field w-24 py-1 font-mono text-xs"
        value={hex}
        readOnly={disabled}
        spellCheck={false}
        onChange={(e) => {
          setEditing(true);
          setHex(e.target.value);
        }}
        onBlur={commitHex}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitHex();
          }
        }}
      />
      <span className="flex items-center gap-1">
        {STATUS_COLOR_PRESETS.map((p) => {
          const checked = p.color === value;
          return (
            <Tooltip content={p.label}><button
              key={p.color}
              type="button"
              aria-label={`${p.label}${checked ? ' (actuelle)' : ''}`}
              aria-pressed={checked}
              disabled={disabled}
              onClick={() => !checked && onChange(p.color)}
              className={`h-5 w-5 rounded-full transition-shadow focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                checked ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''
              }`}
              style={{ backgroundColor: p.color }}
            /></Tooltip>
          );
        })}
      </span>
    </div>
  );
}

function ConfirmBar({
  tone,
  children,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  tone: 'amber' | 'danger';
  children: React.ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={`Confirmer : ${confirmLabel.toLowerCase()}`}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-control border px-3 py-2.5 text-xs ${
        tone === 'danger'
          ? 'border-danger-border bg-danger-bg text-danger'
          : 'border-amber-border bg-amber-bg text-amber'
      }`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-2">
        <SecondaryButton onClick={onCancel}>Annuler</SecondaryButton>
        <SecondaryButton
          tone={tone === 'danger' ? 'danger' : 'default'}
          icon={Check}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </SecondaryButton>
      </div>
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
    <Tooltip content={label}><button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-control p-1.5 transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'danger' ? 'text-danger hover:bg-danger-bg' : 'text-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </button></Tooltip>
  );
}
