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
  Link2Off,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountButton } from './components/AccountButton';
import { AssignModal } from './components/AssignModal';
import { BulkActionBar, type BulkPatch } from './components/BulkActionBar';
import { ExportButton } from './components/ExportButton';
import { FilterBar } from './components/FilterBar';
import { KpiPanel } from './components/KpiPanel';
import { LeadCard } from './components/LeadCard';
import { LeadList } from './components/LeadList';
import { LeadModal } from './components/LeadModal';
import { MergeModal } from './components/MergeModal';
import { PeriodFilter } from './components/PeriodFilter';
import { SectorPanel } from './components/SectorPanel';
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
import { useAdminAuth } from './hooks/useAdminAuth';
import { useDeepLink } from './hooks/useDeepLink';
import { useLeads, useStaff, useTerritories, type LeadTable } from './hooks/useLeads';
import { useSelection } from './hooks/useSelection';
import { useViewPreference } from './hooks/useViewPreference';
import { useViewer } from './hooks/useViewer';
import { updateRecord, updateRecords, usesDirectToken } from './lib/airtable';
import { planDeepLink } from './lib/deepLink';
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
import { buildDuplicateIndex, groupByAddress, keepDuplicates } from './lib/duplicates';
import { mergeFields, planMerge, type MergePlan } from './lib/merge';
import type { Lead } from './lib/records';
import { STATUS_TONE, type Status } from './lib/schema';
import { sectorKeyOf } from './lib/territories';
import { WRITE_TARGET } from './lib/writeTargets';

/** Nombre de cartes rendues d'un coup — le reste à la demande. */
const PAGE = 60;

/** Les deux listes, plus le tableau de bord. */
type View = LeadTable | 'kpi' | 'sectors';

const TAB_LABEL: Record<View, string> = {
  contact: 'Demandes de contact',
  solar: 'Leads simulateur',
  kpi: 'KPI',
  sectors: 'Sectorisation',
};

export default function App() {
  const { staff, byId, error: staffError } = useStaff();
  // Sectorisation commerciale : oriente les listes de collaborateurs vers le
  // commercial du département de la demande. Absente, tout reste utilisable.
  const {
    territories,
    sectors,
    coverage,
    loading: territoriesLoading,
    error: territoriesError,
    refresh: refreshTerritories,
  } = useTerritories();
  // Identité transmise par l'hôte Softr : conditionne l'action « M'assigner ».
  const viewer = useViewer(staff);
  // Session d'écriture. Sous le régime historique — variables Google absentes —
  // `required` est faux et rien ne change : la porte ne s'affiche même pas.
  const auth = useAdminAuth();
  const [tab, setTab] = useState<View>('contact');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [assigning, setAssigning] = useState<Lead | null>(null);
  const [merging, setMerging] = useState<MergePlan | null>(null);

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
    // La sectorisation n'a ni période ni statut : elle porte sa propre
    // recherche. L'entrée existe pour que `filters[tab]` reste total.
    sectors: EMPTY_FILTERS,
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

  /* ------------------------------------------------------------ lien profond */

  // `?lead=rec…` ouvre une demande, `?assignee=me` filtre sur celles du
  // visiteur : c'est ce que porte le mail d'assignation envoyé par Airtable.
  // Les règles sont dans `lib/deepLink` ; ici on ne fait qu'appliquer.
  const deepLink = useDeepLink();

  // Le plan ne vaut rien avant que les données soient là : sur une liste vide,
  // tout enregistrement paraît introuvable. La table RH compte aussi, c'est
  // elle qui traduit l'email du visiteur en identifiant.
  const linkReady =
    !contact.loading && !solar.loading && (staff.length > 0 || Boolean(staffError));

  const plan = useMemo(
    () =>
      linkReady
        ? planDeepLink({
            link: deepLink,
            viewerStaffId: viewer.staff?.id ?? null,
            contact: contact.leads,
            solar: solar.leads,
          })
        : null,
    [linkReady, deepLink, viewer.staff, contact.leads, solar.leads],
  );

  // Appliqué une seule fois. Refermer la fiche, changer d'onglet ou retirer le
  // filtre sont des gestes de l'utilisateur ; un effet qui les défait au rendu
  // suivant rendrait l'écran inutilisable.
  const linkApplied = useRef(false);
  useEffect(() => {
    if (linkApplied.current || !plan) return;
    linkApplied.current = true;
    if (plan.open) setSelected(plan.open);
    if (plan.tab) setTab(plan.tab);
    if (plan.assignee.contact || plan.assignee.solar) {
      setFilters((prev) => ({
        ...prev,
        contact: plan.assignee.contact
          ? { ...prev.contact, assignee: plan.assignee.contact }
          : prev.contact,
        solar: plan.assignee.solar
          ? { ...prev.solar, assignee: plan.assignee.solar }
          : prev.solar,
      }));
    }
  }, [plan]);

  // Les compteurs reflètent la période choisie mais pas les autres filtres,
  // sinon filtrer sur un statut afficherait zéro partout ailleurs.
  const stats = useMemo(
    () => computeStats(applyPeriod(active.leads, current.from, current.to)),
    [active.leads, current.from, current.to],
  );
  const options = useMemo(() => deriveOptions(active.leads), [active.leads]);

  // Doublons repérés sur la **table entière**, jamais sur la liste filtrée :
  // restreindre d'abord masquerait le jumeau qui porte l'autre statut, c'est-à-
  // dire le cas qu'on cherche. Le compteur du filtre en dépend aussi.
  const duplicates = useMemo(() => buildDuplicateIndex(active.leads), [active.leads]);
  const universe = useMemo(
    () =>
      current.duplicates === 'only' ? keepDuplicates(active.leads, duplicates) : active.leads,
    [active.leads, current.duplicates, duplicates],
  );

  const filtered = useMemo(() => applyFilters(universe, current), [universe, current]);
  // Filtrage puis tri, deux étapes distinctes : les vues reçoivent le résultat
  // et n'ont rien à recalculer.
  const sorted = useMemo(() => {
    const ordered = sortLeads(filtered, sort);
    // Le regroupement s'applique **après** le tri, et seulement quand on
    // examine les doublons : il rassemble les lignes d'une même adresse sans
    // écraser le tri choisi, qui continue d'ordonner groupes et lignes.
    return current.duplicates === 'only' ? groupByAddress(ordered, duplicates) : ordered;
  }, [filtered, sort, current.duplicates, duplicates]);

  // Sélection tenue au-dessus des vues, sur l'ensemble **visible** : c'est ce
  // qui la fait survivre à la bascule liste/grille, et ce qui garantit qu'une
  // action groupée ne touche jamais une ligne hors écran.
  const visibleIds = useMemo(() => sorted.map((l) => l.id), [sorted]);
  const selection = useSelection(visibleIds);

  /**
   * Secteur commun à la sélection, pour l'assignation groupée.
   *
   * `null` dès que deux départements se mêlent : le cas utile est celui d'un
   * lot filtré sur un département, où mettre son commercial en tête épargne
   * une recherche. Sur un lot hétérogène, mettre en avant l'un des secteurs
   * orienterait l'assignation des demandes qui relèvent des autres.
   */
  const bulkSector = useMemo(() => {
    if (!selection.count) return null;
    const keys = new Set<string>();
    for (const lead of sorted) {
      if (selection.ids.has(lead.id)) keys.add(sectorKeyOf(lead));
      if (keys.size > 1) return null;
    }
    const [key] = [...keys];
    return key ? sectors.get(key) ?? null : null;
  }, [selection.count, selection.ids, sorted, sectors]);

  /**
   * Plan de fusion de la sélection, s'il y en a un.
   *
   * `planMerge` refuse un lot hétérogène — adresses différentes, tables
   * différentes, moins de deux lignes — et c'est cette même règle qui décide
   * de l'apparition du bouton. Une seule définition de « fusionnable », donc
   * pas de bouton qui propose une action que l'écriture refusera.
   */
  const mergePlan = useMemo(() => {
    if (selection.count < 2) return null;
    return planMerge(sorted.filter((l) => selection.ids.has(l.id)));
  }, [selection.count, selection.ids, sorted]);

  /**
   * Applique une fusion : complète la demande conservée, archive les autres.
   *
   * Deux écritures distinctes et dans cet ordre : si l'archivage échoue, la
   * cible est déjà complétée et rien n'est perdu — l'inverse laisserait des
   * demandes archivées dont les valeurs n'ont pas été reprises.
   */
  const applyMerge = useCallback(
    async (plan: MergePlan) => {
      const target = WRITE_TARGET[plan.target.source];
      const fields = mergeFields(plan);

      if (Object.keys(fields).length) {
        await updateRecord(target.tableId, plan.target.id, fields);
      }
      await updateRecords(
        target.tableId,
        plan.sources.map((s) => ({ id: s.id, fields: { [target.status]: 'Archivé' } })),
      );

      // Correction locale plutôt qu'un rechargement de 440 lignes. `merged`
      // vient du plan, donc l'écran montre exactement ce qui a été écrit.
      const source = plan.target.source === 'contact' ? contact : solar;
      source.patchLocal(plan.target.id, plan.merged);
      for (const s of plan.sources) source.patchLocal(s.id, { status: 'Archivé' });
      selection.clear();
    },
    [contact, solar, selection],
  );

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
          <div className="flex items-center gap-3">
            <SecondaryButton
              icon={RefreshCw}
              busy={active.loading}
              onClick={() => void active.refresh()}
            >
              Actualiser
            </SecondaryButton>
            {/* Seul point de connexion de l'application. Invisible tant que le
                serveur n'exige pas de session. */}
            <AccountButton auth={auth} />
          </div>
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

        {/* Un lien de mail peut survivre à la demande qu'il désigne. Sans ce
            message, la fiche ne s'ouvrirait simplement pas, sans rien dire. */}
        {plan?.missing && (
          <Callout tone="amber" icon={Link2Off}>
            <strong>Demande introuvable.</strong> Le lien ouvert désigne un
            enregistrement absent des deux tables — il a pu être supprimé
            depuis l'envoi du mail.
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
            { id: 'sectors', label: TAB_LABEL.sectors, count: territories.length },
          ]}
        />

        {tab === 'sectors' ? (
          <SectorPanel
            territories={territories}
            staff={staff}
            loading={territoriesLoading}
            error={territoriesError}
            onRefresh={refreshTerritories}
            canWrite={auth.canWrite}
          />
        ) : tab === 'kpi' ? (
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
          duplicateAddresses={duplicates.addresses}
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
                duplicates={duplicates}
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
                      duplicate={duplicates.marks.get(lead.id)}
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
            sector={bulkSector}
            coverage={coverage}
            onApply={applyBulk}
            onClear={selection.clear}
            onMerge={mergePlan ? () => setMerging(mergePlan) : undefined}
          />
        )}
      </main>

      {assigning && (
        <AssignModal
          lead={assigning}
          staff={staff.filter((m) => m.active)}
          viewerStaffId={viewer.staff?.id ?? null}
          sectors={sectors}
          coverage={coverage}
          onClose={() => setAssigning(null)}
          onAssign={assign}
        />
      )}

      {merging && (
        <MergeModal
          plan={merging}
          onClose={() => setMerging(null)}
          onMerge={applyMerge}
        />
      )}

      {selected && (
        <LeadModal
          lead={selected}
          staff={staff}
          sectors={sectors}
          coverage={coverage}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
