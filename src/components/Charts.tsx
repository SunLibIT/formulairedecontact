/**
 * Graphiques du tableau de bord.
 *
 * Deux règles issues du guide de visualisation, qui expliquent l'essentiel des
 * choix ici :
 *
 *  - **Des barres nominales portent une seule teinte.** Colorer « par
 *    collaborateur » ou « par motif » avec une palette catégorielle
 *    dépenserait le canal identité à ré-encoder ce que la longueur de la barre
 *    dit déjà. Le teal de la charte suffit.
 *  - **Les couleurs de statut sont réservées** et vont toujours avec une icône
 *    et un libellé. Le vert de marque tombe à 2,75:1 sur blanc, sous le seuil
 *    de 3:1 : la valeur est donc affichée en clair sur chaque barre, ce qui
 *    fournit le canal de secours exigé.
 *
 * Pas de double axe, jamais : deux mesures d'échelles différentes font deux
 * graphiques.
 */
import { useState, type ReactNode } from 'react';
import type { Tone } from '../lib/schema';
import { TONE_ICON } from '../lib/tones';

/** Teinte unique des barres nominales — accent de la charte. */
const NOMINAL_FILL = 'var(--teal)';

/** Couleur de remplissage par ton, pour les seules barres de statut. */
const TONE_FILL: Record<Tone, string> = {
  neutral: 'var(--muted)',
  fresh: 'var(--green)',
  action: 'var(--amber)',
  qualified: 'var(--info)',
  rejected: 'var(--red)',
};

/* ------------------------------------------------------------------ cadre */

export function ChartCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/* -------------------------------------------------------- barres horizontales */

export interface BarDatum {
  label: string;
  value: number;
  /** Uniquement pour les barres de statut. Absent = teinte nominale unique. */
  tone?: Tone;
  /** Complément affiché à droite de la valeur (part, sous-total…). */
  note?: string;
}

/**
 * Barres horizontales : libellé à gauche, barre au centre, valeur à droite.
 *
 * Libellés et valeurs sont tous visibles en texte, ce qui rend le graphique
 * lisible sans percevoir la couleur — c'est aussi la vue tabulaire que le
 * guide exige en repli.
 */
export function HBars({
  data,
  total,
  emptyLabel = 'Aucune donnée',
}: {
  data: BarDatum[];
  /** Base des pourcentages. Par défaut la plus grande valeur. */
  total?: number;
  emptyLabel?: string;
}) {
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const base = total ?? data.reduce((s, d) => s + d.value, 0);

  return (
    <ul className="space-y-2">
      {data.map((d) => {
        const Icon = d.tone ? TONE_ICON[d.tone] : null;
        const share = base ? Math.round((d.value / base) * 100) : 0;
        return (
          <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              {Icon && (
                <Icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: TONE_FILL[d.tone!] }}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
              <span className="truncate" title={d.label}>
                {d.label}
              </span>
            </span>

            {/* Piste discrète, barre fine à extrémité arrondie. */}
            <span className="h-2 overflow-hidden rounded-full bg-canvas">
              <span
                className="block h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`,
                  background: d.tone ? TONE_FILL[d.tone] : NOMINAL_FILL,
                }}
              />
            </span>

            <span className="whitespace-nowrap text-xs tabular-nums text-ink">
              <span className="font-semibold">{d.value}</span>
              <span className="ml-1 text-muted">{d.note ?? `${share} %`}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------- colonnes */

/**
 * Frise mensuelle. Étiquettes directes **sélectives** — le maximum et le
 * dernier mois seulement, jamais un nombre sur chaque colonne. Le détail
 * complet passe par le survol, et une table masquée assure la lecture par
 * lecteur d'écran.
 */
export function Columns({
  data,
  caption,
}: {
  data: Array<{ key: string; label: string; count: number }>;
  caption: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  if (!data.length) {
    return <p className="py-6 text-center text-sm text-muted">Aucune donnée</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const peak = data.reduce((best, d) => (d.count > best.count ? d : best), data[0]);
  const last = data[data.length - 1];

  return (
    <>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ minHeight: 132 }}>
        {data.map((d) => {
          const labelled = d.key === peak.key || d.key === last.key;
          const active = hover === d.key;
          return (
            <div
              key={d.key}
              // Cible de survol plus grande que la marque elle-même.
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              className="group flex min-w-8 flex-1 cursor-default flex-col items-center gap-1"
            >
              <span
                className={`text-[10px] tabular-nums transition-opacity ${
                  labelled || active ? 'text-ink opacity-100' : 'opacity-0'
                }`}
              >
                {d.count}
              </span>
              <span
                className="w-full rounded-t transition-all duration-300"
                style={{
                  height: Math.max((d.count / max) * 96, d.count > 0 ? 3 : 1),
                  background: active ? 'var(--teal-deep)' : NOMINAL_FILL,
                  opacity: active ? 1 : 0.85,
                }}
              />
              <span className="whitespace-nowrap text-[10px] text-muted">{d.label}</span>
            </div>
          );
        })}
      </div>

      {/* Vue tabulaire de repli, exigée par le guide : lisible par lecteur
          d'écran, invisible à l'écran. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Demandes</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ------------------------------------------------------------------ jauge */

/**
 * Jauge d'un ratio unique. Une piste sur la même rampe que la valeur, jamais
 * un camembert à deux parts.
 */
export function Meter({
  value,
  label,
  hint,
  tone = 'qualified',
}: {
  /** Entre 0 et 1, ou `null` si non calculable. */
  value: number | null;
  label: string;
  hint?: string;
  tone?: Tone;
}) {
  const pct = value == null ? null : Math.round(value * 100);
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="text-3xl font-bold tabular-nums text-ink">
        {pct == null ? '—' : `${pct} %`}
      </p>
      <span className="mt-2 block h-2 overflow-hidden rounded-full bg-canvas">
        <span
          className="block h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct ?? 0}%`, background: TONE_FILL[tone] }}
        />
      </span>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
