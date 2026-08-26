/**
 * Onglet KPI.
 *
 * Ne déclenche aucune requête : les deux tables sont déjà chargées pour les
 * autres onglets, tout se recalcule à partir des mêmes `Lead[]`.
 *
 * Le filtre par collaborateur s'applique à **tout** le panneau, y compris à la
 * comparaison de période : c'est ce qui permet de lire la performance d'une
 * personne et non un extrait décoratif.
 */
import { Clock, Inbox, Minus, TrendingDown, TrendingUp, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyPeriod, type FilterState } from '../lib/filters';
import {
  byMonth,
  countBy,
  perAssignee,
  previousPeriod,
  summarise,
  trend,
  withTail,
} from '../lib/kpi';
import type { Lead } from '../lib/records';
import { STATUSES, STATUS_TONE } from '../lib/schema';
import { ChartCard, Columns, HBars, Meter, type BarDatum } from './Charts';
import { SearchableSelect } from './SearchableSelect';
import { Callout, SegmentedFilter, StatTile } from './ui';

type Source = 'contact' | 'solar' | 'both';

const SOURCES: Array<{ value: Source; label: string }> = [
  { value: 'contact', label: 'Demandes' },
  { value: 'solar', label: 'Simulateur' },
  { value: 'both', label: 'Les deux' },
];

export function KpiPanel({
  contactLeads,
  solarLeads,
  filters,
}: {
  contactLeads: Lead[];
  solarLeads: Lead[];
  /** Bornes de période, partagées avec les autres onglets. */
  filters: FilterState;
}) {
  const [source, setSource] = useState<Source>('contact');
  const [assignee, setAssignee] = useState('');

  const pool = useMemo(() => {
    if (source === 'contact') return contactLeads;
    if (source === 'solar') return solarLeads;
    return [...contactLeads, ...solarLeads];
  }, [source, contactLeads, solarLeads]);

  /** Collaborateurs présents dans les données, pour ne proposer que du utile. */
  const staffOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const lead of pool) {
      lead.assigneeIds.forEach((id, i) => names.set(id, lead.assigneeNames[i] ?? id));
    }
    const collator = new Intl.Collator('fr');
    return [...names.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [pool]);

  const scoped = useMemo(() => {
    if (!assignee) return pool;
    if (assignee === 'unassigned') {
      return pool.filter((l) => !l.assigneeIds.length && !l.assigneeNames.length);
    }
    return pool.filter((l) => l.assigneeIds.includes(assignee));
  }, [pool, assignee]);

  const current = useMemo(
    () => applyPeriod(scoped, filters.from, filters.to),
    [scoped, filters.from, filters.to],
  );

  // Période antérieure de même durée, pour la variation. Absente si aucune
  // borne n'est posée : comparer « tout » à « rien » n'aurait pas de sens.
  const previous = useMemo(() => {
    const range = previousPeriod(filters.from, filters.to);
    return range ? applyPeriod(scoped, range.from, range.to) : null;
  }, [scoped, filters.from, filters.to]);

  const summary = useMemo(() => summarise(current), [current]);
  const variation = previous ? trend(current.length, previous.length) : null;

  const statusBars: BarDatum[] = useMemo(
    () =>
      STATUSES.filter((s) => summary.byStatus[s] > 0).map((s) => ({
        label: s,
        value: summary.byStatus[s],
        tone: STATUS_TONE[s],
      })),
    [summary],
  );

  const months = useMemo(() => byMonth(current), [current]);

  const loads = useMemo(() => perAssignee(current), [current]);
  const loadBars: BarDatum[] = useMemo(
    () =>
      withTail(
        loads.map((l) => ({ label: l.name, count: l.total })),
        9,
      ).map((s) => {
        const row = loads.find((l) => l.name === s.label);
        return {
          label: s.label,
          value: s.count,
          note: row?.untouched ? `dont ${row.untouched} à traiter` : undefined,
        };
      }),
    [loads],
  );

  const categories = useMemo(
    () => countBy(current, (l) => l.category).map(toBar),
    [current],
  );
  const motives = useMemo(
    () => withTail(countBy(current, (l) => l.motive), 6).map(toBar),
    [current],
  );
  const departments = useMemo(
    () => withTail(countBy(current, (l) => l.address.department), 8).map(toBar),
    [current],
  );
  const partners = useMemo(
    () => withTail(countBy(current, (l) => l.partner), 6).map(toBar),
    [current],
  );

  const periodLabel = filters.from || filters.to ? 'sur la période' : 'depuis le début';

  return (
    <div className="space-y-4">
      {/* Filtres propres au panneau, sur une seule ligne au-dessus des
          graphiques, comme le veut le guide. */}
      <div className="flex flex-wrap items-end gap-4 rounded-card border border-line bg-surface p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Source</span>
          <SegmentedFilter
            label="Source des demandes"
            options={SOURCES}
            value={source}
            onChange={setSource}
          />
        </label>

        <label className="block min-w-56">
          <span className="mb-1.5 block text-xs font-medium text-muted">Collaborateur</span>
          <SearchableSelect
            ariaLabel="Filtrer les indicateurs par collaborateur"
            emptyLabel="Tous les collaborateurs"
            searchPlaceholder="Rechercher…"
            value={assignee}
            onChange={setAssignee}
            options={[
              { value: 'unassigned', label: 'Non assignées' },
              ...staffOptions,
            ]}
          />
        </label>
      </div>

      {current.length === 0 ? (
        <Callout tone="info" icon={Inbox}>
          Aucune demande ne correspond à cette sélection. Élargissez la période ou
          changez de collaborateur.
        </Callout>
      ) : (
        <>
          {/* ---- ligne d'indicateurs ---- */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={`Demandes ${periodLabel}`}
              value={current.length}
              icon={Inbox}
              tone="qualified"
              hint={
                variation == null
                  ? previous
                    ? 'aucune demande sur la période précédente'
                    : undefined
                  : undefined
              }
            />
            <StatTile
              label="À traiter"
              value={summary.untouched}
              tone={STATUS_TONE.Nouveau}
              hint={
                summary.medianUntouchedAge != null
                  ? `ancienneté médiane ${summary.medianUntouchedAge} j`
                  : undefined
              }
            />
            <StatTile
              label="Non assignées"
              value={summary.unassigned}
              icon={UserX}
              tone="neutral"
            />
            <StatTile
              label="En attente > 14 jours"
              value={summary.staleCount}
              icon={Clock}
              tone={summary.staleCount > 0 ? 'action' : 'neutral'}
            />
          </div>

          {/* La tendance est à double codage : icône ET signe, jamais la
              couleur seule. */}
          {variation != null && (
            <TrendLine value={variation} current={current.length} previous={previous!.length} />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Meter
              value={summary.qualificationRate}
              label="Taux de qualification"
              tone="qualified"
              hint={`${summary.qualified} qualifiées sur ${
                summary.qualified + summary.rejected
              } tranchées — les demandes non traitées sont exclues du calcul`}
            />
            <Meter
              value={summary.handledRate}
              label="Taux de traitement"
              tone="fresh"
              hint={`${current.length - summary.untouched} demandes sorties de « Nouveau » sur ${current.length}`}
            />
          </div>

          {/* ---- graphiques ---- */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title="Répartition par statut" subtitle="Part de l'ensemble sélectionné">
              <HBars data={statusBars} total={current.length} />
            </ChartCard>

            <ChartCard
              title="Charge par collaborateur"
              subtitle="Une demande partagée compte pour chacun"
            >
              <HBars data={loadBars} total={current.length} />
            </ChartCard>

            <ChartCard
              title="Volume par mois"
              subtitle="Les mois sans demande restent affichés"
              action={<span className="text-xs text-muted">{months.length} mois</span>}
            >
              <Columns data={months} caption="Nombre de demandes par mois" />
            </ChartCard>

            <ChartCard title="Type de demandeur">
              <HBars data={categories} total={current.length} />
            </ChartCard>

            <ChartCard title="Motif de la demande" subtitle="Renseigné sur une partie seulement">
              <HBars data={motives} total={current.length} emptyLabel="Aucun motif renseigné" />
            </ChartCard>

            <ChartCard title="Départements" subtitle="Les huit premiers, le reste replié">
              <HBars data={departments} total={current.length} />
            </ChartCard>

            {partners.length > 0 && (
              <ChartCard title="Partenaires" subtitle="Demandes rattachées à un partenaire">
                <HBars data={partners} total={current.length} />
              </ChartCard>
            )}
          </div>

          <p className="text-xs text-muted">
            Le délai de traitement n'est pas calculable : Airtable ne conserve pas la
            date de changement de statut. L'ancienneté affichée est celle de la
            demande, pas le temps de réponse.
          </p>
        </>
      )}
    </div>
  );
}

const toBar = (s: { label: string; count: number }): BarDatum => ({
  label: s.label,
  value: s.count,
});

/** Variation entre périodes, à double codage icône + signe. */
function TrendLine({
  value,
  current,
  previous,
}: {
  value: number;
  current: number;
  previous: number;
}) {
  const pct = Math.round(value * 100);
  const flat = Math.abs(pct) < 1;
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown;
  // Plus de demandes est une bonne nouvelle ici : le vert va à la hausse.
  const tone = flat ? 'text-muted' : value > 0 ? 'text-[color:var(--green)]' : 'text-amber';

  return (
    <p className={`flex items-center gap-2 text-sm font-medium ${tone}`}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>
        {flat ? 'stable' : `${pct > 0 ? '+' : ''}${pct} %`} par rapport à la période
        précédente
      </span>
      <span className="font-normal text-muted">
        ({previous} → {current})
      </span>
    </p>
  );
}
