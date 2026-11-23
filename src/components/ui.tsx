/**
 * Primitives d'interface conformes à la charte SunLib.
 *
 * Points de charte appliqués ici, et qui étaient violés dans la version
 * précédente :
 *  - onglets du CRM 3 : pastille blanche glissante, barre collée (Kit §10) ;
 *  - le sens n'est jamais porté par la couleur seule : chaque badge de statut
 *    porte aussi une icône et son libellé ;
 *  - le dégradé de marque est réservé au bouton d'action principale ;
 *  - une famille d'icônes unique (Lucide outline), 16 px en ligne et 18 px sur
 *    les boutons.
 */
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  PRIORITY_TONE,
  type Priority,
  type StatusDef,
  type Tone,
} from '../lib/schema';
import type { DuplicateNote } from '../lib/leadActions';
import { TONE_ACCENT, TONE_CLASS, TONE_ICON, statusAccentStyle } from '../lib/tones';
import { statusChipStyle } from '../lib/tones';
import { Tooltip } from './kit';

/* ------------------------------------------------------------------ badges */

// Le code couleur vit dans lib/tones.ts, jamais ici : un composant ne doit
// pas être l'endroit où l'on va chercher une teinte.

export function StatusBadge({
  status,
  compact = false,
}: {
  status: StatusDef;
  /** Version resserrée, pour une ligne de liste dense. */
  compact?: boolean;
}) {
  // Couleur libre, choisie par un admin : la pastille en est dérivée
  // (`statusChipStyle`). Le sens ne repose pas sur elle — le nom est écrit.
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border font-semibold ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'gap-1.5 px-2.5 py-0.5 text-xs'
      }`}
      style={statusChipStyle(status.color)}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 rounded-full ${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'}`}
        style={{ backgroundColor: status.color }}
      />
      <span className="truncate">{status.name}</span>
      {/* Un statut retiré des menus par un admin reste affiché sur les demandes
          qui le portent ; la mention dit pourquoi on ne le retrouve plus à la
          saisie. Pas pour un libellé hérité inconnu, qui n'a jamais été proposé. */}
      {status.archived && !status.unknown && (
        <span className="shrink-0 font-normal opacity-80">· archivé</span>
      )}
    </span>
  );
}

/** Pastille pleine, à la place d'une icône de ton pour un statut à couleur libre. */
function StatusDot({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="6" fill="currentColor" />
    </svg>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = PRIORITY_TONE[priority] ?? 'neutral';
  // La priorité est une échelle, pas un état : glyphe de niveau plutôt
  // qu'icône d'état. Et surtout une forme différente du statut — puce sans
  // bordure, plus petite — pour que les deux axes restent lisibles alors
  // qu'ils partagent la palette.
  const glyph = priority === 'Haute' ? '▲' : priority === 'Basse' ? '▼' : '■';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE_ACCENT[tone]}`}
    >
      <span aria-hidden="true" className="text-[8px] leading-none">
        {glyph}
      </span>
      {priority}
    </span>
  );
}

/**
 * Pastille des demandes répétées d'une même adresse.
 *
 * Ni un statut ni une priorité : une **troisième** information, donc une
 * troisième forme — contour discret, pas de fond coloré — pour ne pas entrer
 * en concurrence avec les deux axes du suivi commercial. Seule la plus
 * récente passe en teal, la couleur que la charte réserve à l'élément actif :
 * c'est celle qu'on garde en général, et la voir d'un coup d'œil est tout
 * l'intérêt du regroupement.
 *
 * Avec `onArchive`, elle devient le geste qui résout le doublon : un clic
 * demande confirmation **sur place**, un second archive. La confirmation n'est
 * pas une politesse — la pastille vit dans une carte et dans une ligne, toutes
 * deux cliquables, et un archivage parti d'un clic mal placé ne se voit pas
 * puisque la ligne disparaît de la liste.
 */
export function DuplicateBadge({
  note,
  onArchive,
}: {
  note: DuplicateNote;
  /** Archive cette demande. Absent : la pastille reste une simple mention. */
  onArchive?: () => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [failure, setFailure] = useState('');

  const shape = 'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold';
  const tone = note.latest ? 'bg-teal-soft text-teal-ink' : 'border border-line text-muted';

  // La pastille vit dans une carte et dans une ligne cliquables : sans cet
  // arrêt, chaque clic ouvrirait la fiche par-dessus la confirmation.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (!onArchive) {
    return (
      <Tooltip content={note.title}><span className={`${shape} ${tone}`}>
        <Copy className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        {note.label}
      </span></Tooltip>
    );
  }

  if (phase !== 'idle') {
    const busy = phase === 'busy';
    return (
      <span
        role="group"
        aria-label={note.archiveLabel}
        onClick={stop}
        className={`${shape} ${tone}`}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        )}
        Archiver&nbsp;?
        <button
          type="button"
          disabled={busy}
          aria-label={note.archiveLabel}
          className="rounded p-0.5 hover:bg-surface disabled:opacity-50"
          onClick={(e) => {
            stop(e);
            setPhase('busy');
            void (async () => {
              try {
                await onArchive();
                // Pas de retour à « idle » : la demande archivée quitte la
                // liste, ce composant est démonté dans la foulée.
              } catch (err) {
                setFailure(
                  err instanceof Error ? err.message : "L'archivage a échoué.",
                );
                setPhase('idle');
              }
            })();
          }}
        >
          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Annuler l'archivage"
          className="rounded p-0.5 hover:bg-surface disabled:opacity-50"
          onClick={(e) => {
            stop(e);
            setPhase('idle');
          }}
        >
          <X className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <Tooltip content={failure || note.title}><button
      type="button"
      aria-label={failure ? `${failure} ${note.archiveLabel}` : note.archiveLabel}
      onClick={(e) => {
        stop(e);
        setFailure('');
        setPhase('confirm');
      }}
      className={`${shape} transition-colors ${
        failure ? TONE_CLASS.rejected : `${tone} hover:bg-canvas`
      }`}
    >
      {failure ? (
        <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      )}
      {failure ? 'Échec' : note.label}
    </button></Tooltip>
  );
}

/* ------------------------------------------------------------------- tuile */

export function StatTile({
  label,
  value,
  icon,
  hint,
  tone = 'neutral',
  color,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  /**
   * Facultatif : par défaut la tuile prend l'icône de son ton, donc la même
   * que le badge du statut qu'elle compte. La charte veut qu'une notion garde
   * la même icône partout — en la déduisant, une divergence devient
   * impossible plutôt que simplement déconseillée.
   */
  icon?: LucideIcon;
  hint?: string;
  /** Reprend le code couleur du statut que la tuile compte. */
  tone?: Tone;
  /** Couleur libre d'un statut — prime sur `tone`, et l'icône devient une pastille. */
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = icon ?? (color ? StatusDot : TONE_ICON[tone]);
  const accent = color ? statusAccentStyle(color) : undefined;
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={interactive ? active : undefined}
      // Une tuile sélectionnée s'affirme par le fond teinté de son propre ton,
      // jamais par une bordure — la charte l'interdit explicitement.
      className={`flex w-full items-center justify-between gap-3 rounded-card border border-line p-4 text-left transition-colors ${
        active ? (accent ? '' : TONE_ACCENT[tone]) : 'bg-surface ' + (interactive ? 'hover:bg-canvas' : '')
      } ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
      style={active ? accent : undefined}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium opacity-80">{label}</p>
        {/* Métrique « reine » : nettement plus grande que le contexte. */}
        <p className={`text-3xl font-bold ${active ? '' : 'text-ink'}`}>{value}</p>
        {hint && <p className="truncate text-xs opacity-70">{hint}</p>}
      </div>
      <span
        className={`shrink-0 rounded-control p-2.5 ${
          active ? 'bg-surface' : accent ? '' : TONE_ACCENT[tone]
        }`}
        style={!active ? accent : accent ? { color: accent.color } : undefined}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- onglets */

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

/** Étirement maximal de la pastille sur la plus longue course (Kit CRM 3 §10 ter). */
const ETIRE_MAX = 0.14;
/** Hauteur du fondu sous la barre collée (Kit CRM 3 §10 bis, 27/10/2026). */
const FONDU_COLLE = 36;

/**
 * Barre d'onglets du CRM 3 (Kit §10 bis / ter, reprise de TICKETING le
 * 23/11/2026) : pastille blanche qui glisse d'un onglet à l'autre en
 * s'étirant, barre collée en haut au défilement, fond de page peint en pleine
 * largeur et fondu sous le filet une fois collée. Aucune géométrie ne dépend
 * d'une mesure (sinon la page tremble) : le fond est peint par `border-image`.
 * Navigation clavier par flèches.
 */
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const barre = useRef<HTMLDivElement | null>(null);
  const repere = useRef<HTMLDivElement | null>(null);
  const cadre = useRef<HTMLDivElement | null>(null);
  const [ind, setInd] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [elan, setElan] = useState<{ cle: number; sx: number } | null>(null);
  const depart = useRef<{ x: number; y: number } | null>(null);
  const [colle, setColle] = useState(false);
  const [gauche, setGauche] = useState(0);
  const index = Math.max(0, items.findIndex((t) => t.id === value));
  const empreinte = items.map((t) => `${t.id}:${t.count ?? ''}`).join('|');

  const move = (from: number, delta: number) => {
    const next = (from + delta + items.length) % items.length;
    onChange(items[next].id);
    refs.current[next]?.focus();
  };

  useLayoutEffect(() => {
    const bar = barre.current;
    const btn = refs.current[index];
    if (!bar || !btn) return;
    const mesurer = (deplacement: boolean) => {
      const c = { x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight };
      setInd((p) => (p && p.x === c.x && p.y === c.y && p.w === c.w && p.h === c.h ? p : c));
      const d0 = depart.current;
      if (deplacement && d0 && (d0.x !== c.x || d0.y !== c.y)) {
        const course = Math.max(1, bar.scrollWidth - c.w);
        const part = Math.sqrt(Math.min(1, Math.hypot(c.x - d0.x, c.y - d0.y) / course));
        setElan((e) => ({ cle: (e?.cle ?? 0) + 1, sx: 1 + ETIRE_MAX * part }));
      }
      depart.current = { x: c.x, y: c.y };
    };
    mesurer(true);
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => mesurer(false));
    obs.observe(bar);
    return () => obs.disconnect();
  }, [index, empreinte]);

  useEffect(() => {
    const el = repere.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([e]) => setColle(!e.isIntersecting && e.boundingClientRect.top < 0),
      { rootMargin: '0px 0px 100000px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Le fond peint déborde à gauche jusqu'au bord du bloc, pas au-delà
  // (dans Softr, il passerait sur le menu latéral).
  useEffect(() => {
    const el = cadre.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const racine = el.closest('.sdc-root') ?? document.body;
    const mesure = () => {
      const g = Math.max(0, Math.round(el.getBoundingClientRect().left - racine.getBoundingClientRect().left));
      setGauche((p) => (p === g ? p : g));
    };
    mesure();
    const ro = new ResizeObserver(mesure);
    ro.observe(racine);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div ref={repere} aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
      <div
        ref={cadre}
        className="sdc-tabbar"
        style={{
          borderImage: 'linear-gradient(to bottom, var(--bg) calc(100% - 1px), var(--line) 0) fill 0 / 0 / 0 100vmax',
          clipPath: `inset(0 -100vmax -${FONDU_COLLE + 4}px -${gauche}px)`,
        }}
      >
        <span aria-hidden="true" className="sdc-fondu" style={{ height: FONDU_COLLE, opacity: colle ? 1 : 0 }} />
        <div ref={barre} role="tablist" aria-label="Sources de demandes" className="relative flex flex-wrap gap-1">
          {ind && (
            <span
              aria-hidden="true"
              className="sdc-ind"
              style={{ transform: `translate3d(${ind.x}px, ${ind.y}px, 0)`, width: ind.w, height: ind.h }}
            >
              <span
                key={elan?.cle ?? 'pose'}
                className={elan ? 'sdc-ind-i sdc-ind-elan' : 'sdc-ind-i'}
                style={elan ? ({ '--sdc-sx': elan.sx } as CSSProperties) : undefined}
              />
            </span>
          )}
          {items.map((item, i) => {
            const active = item.id === value;
            const Icon = item.icon;
            // Avant la première mesure, l'onglet actif porte lui-même la pastille.
            const porte = active && !ind;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onChange(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') move(i, 1);
                  if (e.key === 'ArrowLeft') move(i, -1);
                  if (e.key === 'Home') move(0, 0);
                  if (e.key === 'End') move(items.length - 1, 0);
                }}
                className={porte ? 'sdc-tab sdc-tab-porte' : 'sdc-tab'}
                style={{ color: active ? 'var(--teal-ink)' : 'var(--muted)' }}
              >
                {Icon && (
                  <Icon
                    className="sdc-tab-i"
                    style={{ width: 16, height: 16, color: active ? 'var(--teal)' : undefined }}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                )}
                {item.label}
                {item.count !== undefined && (
                  <span
                    className="rounded-full px-[7px] py-[3px] text-[11.5px] font-bold leading-none"
                    style={{
                      background: active ? 'var(--teal-soft)' : '#f1f4f7',
                      color: active ? 'var(--teal-ink)' : 'var(--muted)',
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------- segmented control */

/**
 * Filtre à choix unique sur un petit ensemble fixe. Thumb blanc glissant —
 * seul cas de la charte où la surface active n'est pas `--teal-soft`.
 */
export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState({ left: 0, width: 0 });
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  // Position recalculée au changement et au redimensionnement, jamais devinée.
  useLayoutEffect(() => {
    const el = refs.current[index];
    if (!el) return;
    const update = () => setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index, options.length]);

  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative inline-flex items-center rounded-full border border-line bg-[#eef1f4] p-1"
    >
      <span
        aria-hidden="true"
        className="seg-thumb absolute bottom-1 top-1 rounded-full bg-surface"
        style={{ transform: `translateX(${thumb.left - 4}px)`, width: thumb.width }}
      />
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
              active ? 'font-bold text-teal-ink' : 'font-medium text-muted hover:text-ink'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold ${
                  active ? 'bg-teal-soft text-teal-ink' : 'border border-line text-muted'
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- recherche */

/**
 * Champ de recherche. Effacement par « × » **dans** le champ, visible
 * seulement s'il y a du texte.
 *
 * Construit en flexbox et non en positionnement absolu : la version
 * précédente superposait la loupe au texte, et `type="search"` ajoutait par
 * dessus sa propre croix native selon le navigateur. Ici la loupe, le champ et
 * la croix sont trois éléments côte à côte — ils ne peuvent pas se recouvrir,
 * et `type="text"` supprime toute décoration native.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-control border bg-surface px-3 py-2 transition-colors ${
        focused ? 'border-teal shadow-focus' : 'border-line'
      }`}
    >
      <Search
        className={`h-4 w-4 shrink-0 transition-colors ${focused ? 'text-teal-ink' : 'text-muted'}`}
        strokeWidth={2}
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label={placeholder}
        // Le focus visible est porté par le conteneur : l'anneau doit
        // entourer tout le champ, pas seulement la zone de saisie.
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-muted"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
          className="-mr-1 shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- boutons */

/** Action principale : dégradé de marque, flèche animée, état de chargement. */
export function PrimaryButton({
  children,
  onClick,
  busy = false,
  disabled = false,
  arrow = true,
}: {
  children: ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  arrow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="group inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy && <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2} aria-hidden="true" />}
      {children}
      {arrow && !busy && (
        <ArrowRight className="btn-arrow h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}

/** Action secondaire : plate, contour hairline. */
export function SecondaryButton({
  children,
  onClick,
  busy = false,
  disabled = false,
  icon: Icon,
  tone = 'default',
}: {
  children: ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-2 rounded-control border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === 'danger'
          ? 'border-danger-border bg-danger-bg text-danger hover:bg-danger-border/40'
          : 'border-line bg-surface text-ink hover:bg-canvas'
      }`}
    >
      {busy ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2} aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- divers */

export function Callout({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'amber' | 'danger';
  icon: LucideIcon;
  children: ReactNode;
}) {
  const cls = {
    info: 'bg-info-bg border-info-border text-info',
    amber: 'bg-amber-bg border-amber-border text-amber',
    danger: 'bg-danger-bg border-danger-border text-danger',
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-card border p-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Barre de progression indéterminée, fixée en haut de la fenêtre.
 *
 * Le seul retour visuel pendant un chargement était le spinner du bouton
 * « Actualiser », invisible dès qu'on avait scrollé. Cette barre reste
 * perceptible où que l'on soit dans la page, et son animation dit « ça
 * travaille » sans prétendre connaître une progression réelle.
 *
 * `aria-hidden` : l'état de chargement est déjà annoncé par le `aria-live` de
 * la liste ; le doubler ferait bavarder le lecteur d'écran pour rien.
 */
export function TopProgressBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-x-0 top-0 z-[1990] h-0.5 overflow-hidden transition-opacity duration-200 ${
        active ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {active && <div className="progress-sweep h-full w-1/3 bg-brand" />}
    </div>
  );
}

/**
 * Cartes squelettes du premier chargement.
 *
 * Préférées à un spinner centré : elles montrent la forme de ce qui arrive,
 * donc l'attente paraît plus courte et la mise en page ne saute pas quand les
 * données s'affichent.
 */
export function LeadCardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="skeleton h-5 w-20 rounded-full" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="skeleton h-3 w-4/5 rounded" />
        <div className="skeleton h-3 w-3/5 rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
      </div>
      <div className="mt-3 flex justify-between border-t border-line pt-3">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
    </div>
  );
}

/**
 * Squelette d'une ligne de liste.
 *
 * Chaque vue a le sien : montrer des cartes fantômes avant d'afficher une
 * liste, ou l'inverse, ferait sauter la mise en page au moment du rendu réel.
 */
export function LeadRowSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 border-b border-line px-3"
      style={{ height: 56 }}
    >
      <div className="min-w-0 flex-[1.4] space-y-1.5">
        <div className="skeleton h-3.5 w-2/5 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="skeleton h-3 w-3/4 rounded" />
      </div>
      <div className="min-w-0 flex-[1.5] space-y-1.5">
        <div className="skeleton h-3 w-5/6 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
      <div className="min-w-0 flex-[0.8] space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
      <div className="skeleton h-3 w-16 rounded" />
      <div className="skeleton h-5 w-10 rounded-full" />
      {/* Assigné, replié au même seuil que dans la liste réelle. */}
      <div className="skeleton hidden h-3 w-24 rounded min-[1100px]:block" />
    </div>
  );
}

/**
 * Échec de chargement, avec relance.
 *
 * Un encadré en haut de page se perd dès qu'on a défilé, et surtout il laisse
 * une zone vide en dessous sans dire quoi faire. Ici l'erreur occupe la place
 * du contenu et porte son bouton.
 */
export function ErrorState({
  message,
  onRetry,
  busy = false,
}: {
  message: string;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-card border border-danger-border bg-danger-bg p-8 text-center">
      <AlertTriangle
        className="mx-auto mb-3 h-8 w-8 text-danger"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <p className="font-semibold text-danger">Chargement impossible</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-danger/80">{message}</p>
      <div className="mt-4 flex justify-center">
        <SecondaryButton icon={RefreshCw} busy={busy} onClick={onRetry}>
          Réessayer
        </SecondaryButton>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-12 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted" strokeWidth={1.75} aria-hidden="true" />
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

/** Avatar à initiales, couleur dérivée du nom (charte : liste de notes). */
export function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  // Teinte stable pour un même nom : même personne, même couleur partout.
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      style={{
        background: `hsl(${hue} 62% 94%)`,
        color: `hsl(${hue} 45% 32%)`,
      }}
    >
      {initials || '—'}
    </span>
  );
}

/** Horodatage relatif, date absolue en infobulle (charte, principe n°5). */
export function RelativeDate({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="text-muted">—</span>;

  const absolute = d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const days = Math.round((now - d.getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const label =
    Math.abs(days) < 1
      ? "aujourd'hui"
      : Math.abs(days) < 31
        ? rtf.format(-days, 'day')
        : Math.abs(days) < 365
          ? rtf.format(-Math.round(days / 30), 'month')
          : rtf.format(-Math.round(days / 365), 'year');

  return <Tooltip content={absolute}><time dateTime={iso}>{label}</time></Tooltip>;
}
