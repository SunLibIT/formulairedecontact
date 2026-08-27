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
  FilterX,
  Inbox,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserX,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { AssignModal } from './components/AssignModal';
import { BulkActionBar, type BulkPatch } from './components/BulkActionBar';
import { ExportButton } from './components/ExportButton';
import { FilterBar } from './components/FilterBar';
import { KpiPanel } from './components/KpiPanel';
import { LeadCard } from './components/LeadCard';
import { LeadList } from './components/LeadList';
import { LeadModal } from './components/LeadModal';
import { PeriodFilter } from './components/PeriodFilter';
import { ViewSwitcher } from './components/ViewSwitcher';
import {
  Callout,
  EmptyState,
  ErrorState,
  LeadCardSkeleton,
  LeadRowSkeleton,
  SecondaryButton,
  StatTile,
  Tabs,
  TopProgressBar,
} from './components/ui';
import { useLeads, useStaff, type LeadTable } from './hooks/useLeads';
import { useSelection } from './hooks/useSelection';
import { useViewPreference } from './hooks/useViewPreference';
import { useViewer } from './hooks/useViewer';
import { updateRecord, updateRecords, usesDirectToken } from './lib/airtable';
import {
  ALL,
  applyFilters,
  applyPeriod,
  computeStats,
  deriveOptions,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  sortLeads,
  type FilterState,
  type SortState,
} from './lib/filters';
import type { Lead } from './lib/records';
import { STATUS_TONE, type Status } from './lib/schema';
import { WRITE_TARGET } from './lib/writeTargets';

/** Nombre de cartes rendues d'un coup — le reste à la demande. */
const PAGE = 60;

/** Les deux listes, plus le tableau de bord. */
type View = LeadTable | 'kpi';

const TAB_LABEL: Record<View, string> = {
  contact: 'Demandes de contact',
  solar: 'Leads simulateur',
  kpi: 'KPI',
};

export default function App() {
  const { staff, byId, error: staffError } = useStaff();
  // Identité transmise par l'hôte Softr : conditionne l'action « M'assigner ».
  const viewer = useViewer(staff);
  const [tab, setTab] = useState<View>('contact');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [assigning, setAssigning] = useState<Lead | null>(null);

  // Les deux tables sont chargées d'emblée : elles totalisent moins de 800
  // enregistrements, ce qui rend les compteurs d'onglets exacts et le
  // basculement instantané.
  const contact = useLeads('contact', byId);
  const solar = useLeads('solar', byId);
  // L'onglet KPI lit les deux tables ; on l'aligne sur les demandes de
  // contact pour l'état de chargement et le bouton d'actualisation.
  const active = tab === 'solar' ? solar : contact;

  const [filters, setFilters] = useState<Record<View, FilterState>>({
    contact: EMPTY_FILTERS,
    solar: EMPTY_FILTERS,
    kpi: EMPTY_FILTERS,
  });
  const [visible, setVisible] = useState(PAGE);
  // Le tri vit au-dessus des vues : il est conservé quand on bascule.
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  // Vue résolue à partir de la largeur d'écran, de l'URL puis de la
  // préférence stockée. Indépendante des données : basculer ne relance rien.
  const { view, setView, canChoose } = useViewPreference();
  const listView = view === 'list';

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
  // Filtrage puis tri, deux étapes distinctes : les vues reçoivent le résultat
  // et n'ont rien à recalculer.
  const sorted = useMemo(() => sortLeads(filtered, sort), [filtered, sort]);

  // Sélection tenue au-dessus des vues, sur l'ensemble **visible** : c'est ce
  // qui la fait survivre à la bascule liste/grille, et ce qui garantit qu'une
  // action groupée ne touche jamais une ligne hors écran.
  const visibleIds = useMemo(() => sorted.map((l) => l.id), [sorted]);
  const selection = useSelection(visibleIds);

  /** Bascule un statut depuis une tuile : re-cliquer désélectionne. */
  const toggleStatus = (status: Status) =>
    patchFilters({ status: current.status === status ? ALL : status });

  const onSaved = (patch: Partial<Lead>) => {
    if (selected) active.patchLocal(selected.id, patch);
  };

  /**
   * Écrit une assignation, depuis la modale dédiée.
   *
   * L'erreur remonte à l'appelant : la modale l'affiche à l'endroit où
   * l'utilisateur agit, plutôt que dans un bandeau en haut de page qu'il ne
   * regarde pas.
   */
  const assign = useCallback(
    async (lead: Lead, staffId: string | null) => {
      const target = WRITE_TARGET[lead.source];
      await updateRecord(target.tableId, lead.id, {
        // Champ de liaison : un tableau d'identifiants, jamais une chaîne.
        [target.assignee]: staffId ? [staffId] : [],
      });
      const source = lead.source === 'contact' ? contact : solar;
      source.patchLocal(lead.id, {
        assigneeIds: staffId ? [staffId] : [],
        assigneeNames: staffId ? [byId.get(staffId) ?? staffId] : [],
      });
    },
    [byId, contact, solar],
  );

  /**
   * Applique une modification à toute la sélection.
   *
   * L'écriture est étalée en lots de dix par le transport ; on rapporte la
   * progression et on corrige la liste en local à la fin, plutôt que de
   * recharger 438 lignes pour en avoir changé vingt.
   */
  const applyBulk = useCallback(
    async (
      patch: BulkPatch,
      handlers: { onProgress: (done: number, total: number) => void; signal: AbortSignal },
    ) => {
      const target = WRITE_TARGET[tab === 'solar' ? 'solar' : 'contact'];
      const fields: Record<string, unknown> = {};
      const localPatch: Partial<Lead> = {};

      if (patch.status) {
        fields[target.status] = patch.status;
        localPatch.status = patch.status;
      }
      if (patch.priority) {
        fields[target.priority] = patch.priority;
        localPatch.priority = patch.priority;
      }
      if (patch.assigneeId !== undefined) {
        const id = patch.assigneeId;
        fields[target.assignee] = id ? [id] : [];
        localPatch.assigneeIds = id ? [id] : [];
        localPatch.assigneeNames = id ? [byId.get(id) ?? id] : [];
      }

      const ids = [...selection.ids];
      const result = await updateRecords(
        target.tableId,
        ids.map((id) => ({ id, fields })),
        handlers,
      );

      // Seules les lignes réellement écrites sont corrigées en local : afficher
      // un changement qu'Airtable a refusé serait un mensonge.
      const failed = new Set(result.failed);
      for (const id of ids) {
        if (!failed.has(id)) active.patchLocal(id, localPatch);
      }

      return { updated: result.updated, aborted: result.aborted, failed: result.failed.length };
    },
    [tab, byId, selection.ids, active],
  );

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
            setTab(id as View);
            setVisible(PAGE);
          }}
          items={[
            { id: 'contact', label: TAB_LABEL.contact, count: contact.leads.length },
            { id: 'solar', label: TAB_LABEL.solar, count: solar.leads.length },
            { id: 'kpi', label: TAB_LABEL.kpi },
          ]}
        />

        {tab === 'kpi' ? (
          <>
            {/* Le total n'est pas passé : le panneau l'affiche déjà, calculé
                sur sa propre sélection de source. */}
            <PeriodFilter key={tab} filters={current} onChange={patchFilters} />
            <KpiPanel
              contactLeads={contact.leads}
              solarLeads={solar.leads}
              filters={current}
            />
          </>
        ) : (
          <>
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
          searchPlaceholder="Nom, email, entreprise, ville, code postal…"
        />

        {/* Quatre états, déclinés par vue : chargement, erreur, aucun
            résultat après filtrage, table vide. */}
        {active.error && active.leads.length === 0 ? (
          <ErrorState
            message={active.error}
            busy={active.loading}
            onRetry={() => void active.refresh()}
          />
        ) : active.loading && active.leads.length === 0 ? (
          // Squelettes plutôt qu'un spinner, et propres à chaque vue : la
          // forme de ce qui arrive apparaît tout de suite et rien ne saute
          // quand les données atterrissent.
          <>
            <p aria-live="polite" className="text-sm text-muted">
              Chargement des demandes…
            </p>
            {listView ? (
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                {Array.from({ length: 10 }, (_, i) => (
                  <LeadRowSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <LeadCardSkeleton key={i} />
                ))}
              </div>
            )}
          </>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={active.leads.length ? Trash2 : Inbox}
            title={active.leads.length ? 'Aucun résultat' : 'Aucune demande'}
          >
            {active.leads.length ? (
              <span className="flex flex-col items-center gap-3">
                Aucune demande ne correspond aux filtres actifs.
                <SecondaryButton icon={FilterX} onClick={resetFilters}>
                  Réinitialiser les filtres
                </SecondaryButton>
              </span>
            ) : (
              `La table « ${TAB_LABEL[tab]} » est vide.`
            )}
          </EmptyState>
        ) : (
          <>
            {/* Barre d'outils du contenu : compteur à gauche, sélecteur
                d'affichage à droite. Masqué sous 700 px, où une seule vue a
                du sens. */}
            <div className="flex items-start justify-between gap-3">
              <p aria-live="polite" className="text-sm text-muted">
                {sorted.length} demande{sorted.length > 1 ? 's' : ''}
                {sorted.length !== active.leads.length && ` sur ${active.leads.length}`}
              </p>
              <div className="flex items-start gap-3">
                {/* L'export porte sur la liste triée et filtrée, celle-là
                    même qui est rendue en dessous. */}
                <ExportButton leads={sorted} source={tab} />
                {canChoose && <ViewSwitcher value={view} onChange={setView} />}
              </div>
            </div>

            {listView ? (
              // La liste est virtualisée : elle affiche l'ensemble sans
              // pagination, d'où l'absence de bouton « Voir plus ».
              <LeadList
                leads={sorted}
                sort={sort}
                onSortChange={setSort}
                onOpen={setSelected}
                onAssign={setAssigning}
                selection={selection}
              />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {sorted.slice(0, visible).map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onOpen={() => setSelected(lead)}
                      onAssign={setAssigning}
                    />
                  ))}
                </div>

                {/* Divulgation progressive : on ne monte pas 438 cartes d'un coup. */}
                {visible < sorted.length && (
                  <div className="flex justify-center">
                    <SecondaryButton onClick={() => setVisible((v) => v + PAGE)}>
                      Voir plus ({sorted.length - visible} restantes)
                    </SecondaryButton>
                  </div>
                )}
              </>
            )}
          </>
        )}
          </>
        )}

        {/* Apparaît dès qu'une ligne est sélectionnée. Hors de la vue liste
            la sélection n'a pas d'entrée, donc la barre ne s'affiche pas. */}
        {listView && selection.count > 0 && (
          <BulkActionBar
            count={selection.count}
            staff={staff.filter((m) => m.active)}
            onApply={applyBulk}
            onClear={selection.clear}
          />
        )}
      </main>

      {assigning && (
        <AssignModal
          lead={assigning}
          staff={staff.filter((m) => m.active)}
          viewerStaffId={viewer.staff?.id ?? null}
          onClose={() => setAssigning(null)}
          onAssign={assign}
        />
      )}

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
