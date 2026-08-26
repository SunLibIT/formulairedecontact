/**
 * Suivi des demandes de contact SunLib.
 *
 * Ce composant n'est plus qu'une orchestration : le transport est dans
 * `lib/airtable`, la normalisation dans `lib/records`, le filtrage et les
 * compteurs dans `lib/filters`, le chargement dans `hooks/useLeads`. La
 * version précédente concentrait les quatre dans 1157 lignes, avec deux jeux
 * de logique parallèles qui divergeaient.
 */
import {
  AlertTriangle,
  Inbox,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserX,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { FilterBar } from './components/FilterBar';
import { LeadCard } from './components/LeadCard';
import { LeadModal } from './components/LeadModal';
import { PeriodFilter } from './components/PeriodFilter';
import {
  Callout,
  EmptyState,
  LeadCardSkeleton,
  SecondaryButton,
  StatTile,
  Tabs,
  TopProgressBar,
} from './components/ui';
import { useLeads, useStaff, type LeadTable } from './hooks/useLeads';
import { usesDirectToken } from './lib/airtable';
import {
  ALL,
  applyFilters,
  applyPeriod,
  computeStats,
  deriveOptions,
  EMPTY_FILTERS,
  type FilterState,
} from './lib/filters';
import type { Lead } from './lib/records';
import { STATUS_TONE, type Status } from './lib/schema';

/** Nombre de cartes rendues d'un coup — le reste à la demande. */
const PAGE = 60;

const TAB_LABEL: Record<LeadTable, string> = {
  contact: 'Demandes de contact',
  solar: 'Leads simulateur',
};

export default function App() {
  const { staff, byId, error: staffError } = useStaff();
  const [tab, setTab] = useState<LeadTable>('contact');
  const [selected, setSelected] = useState<Lead | null>(null);

  // Les deux tables sont chargées d'emblée : elles totalisent moins de 800
  // enregistrements, ce qui rend les compteurs d'onglets exacts et le
  // basculement instantané.
  const contact = useLeads('contact', byId);
  const solar = useLeads('solar', byId);
  const active = tab === 'contact' ? contact : solar;

  const [filters, setFilters] = useState<Record<LeadTable, FilterState>>({
    contact: EMPTY_FILTERS,
    solar: EMPTY_FILTERS,
  });
  const [visible, setVisible] = useState(PAGE);

  const current = filters[tab];

  const patchFilters = useCallback(
    (patch: Partial<FilterState>) => {
      setFilters((prev) => ({ ...prev, [tab]: { ...prev[tab], ...patch } }));
      setVisible(PAGE); // tout changement de filtre repart du haut de la liste
    },
    [tab],
  );

  const resetFilters = useCallback(() => {
    setFilters((prev) => ({ ...prev, [tab]: EMPTY_FILTERS }));
    setVisible(PAGE);
  }, [tab]);

  // Les compteurs reflètent la période choisie mais pas les autres filtres,
  // sinon filtrer sur un statut afficherait zéro partout ailleurs.
  const stats = useMemo(
    () => computeStats(applyPeriod(active.leads, current.from, current.to)),
    [active.leads, current.from, current.to],
  );
  const options = useMemo(() => deriveOptions(active.leads), [active.leads]);
  const filtered = useMemo(() => applyFilters(active.leads, current), [active.leads, current]);

  /** Bascule un statut depuis une tuile : re-cliquer désélectionne. */
  const toggleStatus = (status: Status) =>
    patchFilters({ status: current.status === status ? ALL : status });

  const onSaved = (patch: Partial<Lead>) => {
    if (selected) active.patchLocal(selected.id, patch);
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Visible où que l'on soit dans la page, contrairement au spinner du
          bouton « Actualiser ». Couvre les deux tables : basculer d'onglet
          pendant un chargement doit rester lisible. */}
      <TopProgressBar active={contact.loading || solar.loading} />

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-xl font-bold text-ink">Suivi des demandes</h1>
            <p className="text-sm text-muted">
              {active.lastUpdate
                ? `Actualisé à ${active.lastUpdate.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Chargement…'}
            </p>
          </div>
          <SecondaryButton
            icon={RefreshCw}
            busy={active.loading}
            onClick={() => void active.refresh()}
          >
            Actualiser
          </SecondaryButton>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-6 py-6">
        {usesDirectToken && (
          <Callout tone="amber" icon={ShieldAlert}>
            <strong>Token Airtable exposé.</strong> L'application appelle Airtable
            directement avec <code>VITE_AIRTABLE_TOKEN</code>, qui est compilé dans le
            bundle navigateur. Acceptable en développement local uniquement — en
            production, retirez cette variable pour que les requêtes passent par{' '}
            <code>/api/airtable</code>.
          </Callout>
        )}

        {staffError && (
          <Callout tone="amber" icon={AlertTriangle}>
            Les collaborateurs n'ont pas pu être chargés ({staffError}). Les
            assignations s'affichent par identifiant.
          </Callout>
        )}

        {active.error && (
          <Callout tone="danger" icon={AlertTriangle}>
            <strong>Chargement impossible.</strong> {active.error}
          </Callout>
        )}

        <Tabs
          value={tab}
          onChange={(id) => {
            setTab(id as LeadTable);
            setVisible(PAGE);
          }}
          items={[
            { id: 'contact', label: TAB_LABEL.contact, count: contact.leads.length },
            { id: 'solar', label: TAB_LABEL.solar, count: solar.leads.length },
          ]}
        />

        <section
          aria-label="Répartition par statut"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Ni couleur ni icône ne sont passées : la tuile les déduit du ton
              du statut qu'elle compte, donc elle affiche exactement le même
              signal visuel que le badge correspondant sur les cartes. */}
          <StatTile
            label="Nouveau"
            value={stats.byStatus.Nouveau}
            tone={STATUS_TONE.Nouveau}
            active={current.status === 'Nouveau'}
            onClick={() => toggleStatus('Nouveau')}
          />
          <StatTile
            label="À contacter"
            value={stats.byStatus['A contacter']}
            tone={STATUS_TONE['A contacter']}
            active={current.status === 'A contacter'}
            onClick={() => toggleStatus('A contacter')}
          />
          <StatTile
            label="Qualifié"
            value={stats.byStatus.Qualifié}
            tone={STATUS_TONE.Qualifié}
            active={current.status === 'Qualifié'}
            onClick={() => toggleStatus('Qualifié')}
          />
          {/* Seule exception : « non assigné » n'est pas un statut. Son icône
              reprend celle de la ligne « assigné à » des cartes. */}
          <StatTile
            label="Non assigné"
            value={stats.unassigned}
            icon={UserX}
            hint={`sur ${stats.total} sur la période`}
            tone="neutral"
            active={current.assignee === 'unassigned'}
            onClick={() =>
              patchFilters({
                assignee: current.assignee === 'unassigned' ? ALL : 'unassigned',
              })
            }
          />
        </section>

        {/* `key` sur l'onglet : le choix « Sur mesure » est un état interne au
            composant, il ne doit pas se propager d'un onglet à l'autre. */}
        <PeriodFilter
          key={tab}
          filters={current}
          onChange={patchFilters}
          matching={stats.total}
        />

        <FilterBar
          filters={current}
          onChange={patchFilters}
          onReset={resetFilters}
          options={options}
          stats={stats}
          searchPlaceholder="Nom, email, entreprise, ville, partenaire…"
        />

        {active.loading && active.leads.length === 0 ? (
          // Squelettes plutôt qu'un spinner : la forme de la liste apparaît
          // tout de suite et rien ne saute quand les données arrivent.
          <>
            <p aria-live="polite" className="text-sm text-muted">
              Chargement des demandes…
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <LeadCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={active.leads.length ? Trash2 : Inbox}
            title={active.leads.length ? 'Aucun résultat' : 'Aucune demande'}
          >
            {active.leads.length
              ? 'Aucune demande ne correspond aux filtres actifs.'
              : `La table « ${TAB_LABEL[tab]} » est vide.`}
          </EmptyState>
        ) : (
          <>
            <p aria-live="polite" className="text-sm text-muted">
              {filtered.length} demande{filtered.length > 1 ? 's' : ''}
              {filtered.length !== active.leads.length && ` sur ${active.leads.length}`}
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.slice(0, visible).map((lead) => (
                <LeadCard key={lead.id} lead={lead} onOpen={() => setSelected(lead)} />
              ))}
            </div>

            {/* Divulgation progressive : on ne monte pas 438 cartes d'un coup. */}
            {visible < filtered.length && (
              <div className="flex justify-center">
                <SecondaryButton onClick={() => setVisible((v) => v + PAGE)}>
                  Voir plus ({filtered.length - visible} restantes)
                </SecondaryButton>
              </div>
            )}
          </>
        )}
      </main>

      {selected && (
        <LeadModal
          lead={selected}
          staff={staff}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
