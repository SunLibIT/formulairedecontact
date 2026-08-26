/**
 * Primitives d'interface conformes à la charte SunLib.
 *
 * Points de charte appliqués ici, et qui étaient violés dans la version
 * précédente :
 *  - un élément actif ne porte ni bordure ni liseré : onglet actif = simple
 *    soulignement teal ;
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
  Circle,
  Clock,
  Loader2,
  Minus,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PRIORITY_TONE, STATUS_TONE, type Priority, type Status } from '../lib/schema';

/* ------------------------------------------------------------------ badges */

type Tone = 'neutral' | 'pending' | 'positive' | 'negative';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted border-line',
  pending: 'bg-amber-bg text-amber border-amber-border',
  positive: 'bg-teal-soft text-teal-ink border-teal-soft',
  negative: 'bg-danger-bg text-danger border-danger-border',
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: Circle,
  pending: Clock,
  positive: Check,
  negative: AlertTriangle,
};

export function StatusBadge({ status }: { status: Status }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = PRIORITY_TONE[priority] ?? 'neutral';
  // La priorité est une échelle, pas un état : on la code par un glyphe de
  // niveau plutôt que par l'icône d'état, pour ne pas confondre les deux.
  const glyph = priority === 'Haute' ? '▲' : priority === 'Basse' ? '▼' : '■';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden="true" className="text-[9px] leading-none">
        {glyph}
      </span>
      {priority}
    </span>
  );
}

/* ------------------------------------------------------------------- tuile */

export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={interactive ? active : undefined}
      className={`flex w-full items-center justify-between gap-3 rounded-card border p-4 text-left transition-colors ${
        active
          ? 'border-line bg-teal-soft'
          : 'border-line bg-surface ' + (interactive ? 'hover:bg-canvas' : '')
      } ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-muted">{label}</p>
        {/* Métrique « reine » : nettement plus grande que le contexte. */}
        <p className={`text-3xl font-bold ${active ? 'text-teal-ink' : 'text-ink'}`}>
          {value}
        </p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
      <span
        className={`shrink-0 rounded-control p-2.5 ${
          active ? 'bg-surface text-teal-ink' : 'bg-teal-soft text-teal-ink'
        }`}
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
}

/**
 * Onglets de navigation de contenu : soulignement teal sur l'actif, aucune
 * bordure ni encadré. Navigation clavier par flèches, comme l'exige la charte.
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

  const move = (from: number, delta: number) => {
    const next = (from + delta + items.length) % items.length;
    onChange(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="Sources de demandes" className="flex gap-6 border-b border-line">
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
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
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 pt-2 text-sm transition-colors ${
              active
                ? 'border-teal font-bold text-teal-ink'
                : 'border-transparent font-medium text-muted hover:text-ink'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active ? 'bg-teal-soft text-teal-ink' : 'border border-line text-muted'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
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

/** Effacement par « × » **dans** le champ, visible seulement s'il y a du texte. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        strokeWidth={2}
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-canvas hover:text-ink"
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

  return <time dateTime={iso} title={absolute}>{label}</time>;
}

export { Minus };
