/**
 * Vue liste dense — purement présentationnelle.
 *
 * Ne détient aucun état métier : filtres, tri, pagination et sélection vivent
 * au-dessus, dans `App`. Elle reçoit une liste déjà filtrée et triée, et
 * remonte les intentions de l'utilisateur.
 *
 * Toutes les règles de comportement viennent de `lib/leadActions` et tout le
 * formatage de `lib/format` : rien n'est réimplémenté ici, la vue cartes
 * consomme exactement les mêmes fonctions.
 *
 * Virtualisée : seules les lignes visibles sont montées. À 438 demandes
 * aujourd'hui le DOM resterait tenable, mais le tri et le filtrage
 * re-rendraient l'ensemble à chaque frappe.
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useRef } from 'react';
import {
  ageInDays,
  ageTone,
  DEFAULT_AGE_THRESHOLDS,
  formatAge,
  formatPersonName,
  formatPhone,
  type AgeThresholds,
} from '../lib/format';
import type { SortField, SortState } from '../lib/filters';
import type { DuplicateIndex, DuplicateMark } from '../lib/duplicates';
import { normalisePostalCode } from '../lib/geo';
import type { Selection } from '../hooks/useSelection';
import { categoryLabel, duplicateNote, priorityEdge } from '../lib/leadActions';
import { shortMotive } from '../lib/motives';
import type { Lead } from '../lib/records';
import { TONE_CLASS } from '../lib/tones';
import { DuplicateBadge, StatusBadge } from './ui';

/** Hauteur d'une ligne, en pixels. Deux lignes de texte plus le rembourrage. */
const ROW_HEIGHT = 56;

/** Lignes montées au-delà de la zone visible, pour un défilement sans à-coups. */
const OVERSCAN = 8;

/**
 * Gabarit de colonnes, partagé par l'en-tête et les lignes pour qu'ils s'alignent.
 *
 * Deux variantes, et non une seule assortie d'un `hidden` : quand « Assigné »
 * passe en `display:none`, sa piste doit disparaître avec elle, sinon
 * « Actions » glisse d'une case et toute la ligne se décale.
 *
 * Le `minmax(0, …)` est indispensable partout — sans lui, une piste prend pour
 * minimum la largeur de son contenu et les `truncate` internes ne tronquent
 * plus rien.
 */
const GRID =
  'grid items-center gap-3 ' +
  // Étroit — sans « Assigné » : 8 pistes.
  'grid-cols-[1.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_7rem_4.5rem_6.5rem] ' +
  // Large — « Assigné » revient en avant-dernière position : 9 pistes.
  'min-[1100px]:grid-cols-[1.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.85fr)_7rem_4.5rem_minmax(0,0.9fr)_6.5rem]';

/**
 * Colonne repliée sous 1 100 px, en-tête et cellule ensemble.
 *
 * Huit colonnes ne tiennent pas à toutes les largeurs : c'est « Assigné » qui
 * cède, parce que l'information reste lisible dans la fiche et dans la vue
 * cartes, alors qu'une adresse e-mail tronquée à quinze caractères ne sert
 * plus à rien.
 */
const HIDE_NARROW = 'hidden min-[1100px]:block';

interface Column {
  key: string;
  label: string;
  /** Champ de tri, si la colonne est triable. */
  sort?: SortField;
  /** Alignement à droite pour les valeurs numériques, comme l'exige la charte. */
  numeric?: boolean;
  /** Repliée sous 1 100 px, faute de place pour huit colonnes. */
  hideNarrow?: boolean;
}

// « Nom » et non « Contact » : le libellé désignait la personne *et* ses moyens
// de contact, ce qui n'a plus de sens depuis que « Coordonnées » existe à côté.
const COLUMNS: Column[] = [
  { key: 'contact', label: 'Nom', sort: 'name' },
  { key: 'motive', label: 'Motif' },
  { key: 'contacts', label: 'Coordonnées' },
  { key: 'city', label: 'CP / Ville' },
  { key: 'status', label: 'Statut', sort: 'status' },
  { key: 'age', label: 'Attente', sort: 'date', numeric: true },
  { key: 'assignee', label: 'Assigné', sort: 'assignee', hideNarrow: true },
  { key: 'actions', label: 'Actions' },
];

export function LeadList({
  leads,
  sort,
  onSortChange,
  onOpen,
  onAssign,
  thresholds = DEFAULT_AGE_THRESHOLDS,
  selection,
  duplicates,
}: {
  leads: Lead[];
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  onOpen: (lead: Lead) => void;
  /** Ouvre la modale d'assignation pour cette demande. */
  onAssign?: (lead: Lead) => void;
  thresholds?: AgeThresholds;
  selection?: Selection;
  /** Index des demandes répétées, calculé sur la table entière. */
  duplicates?: DuplicateIndex;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  /** Un clic sur un en-tête trié inverse le sens, sinon change de champ. */
  const toggleSort = (field: SortField) => {
    if (sort.field === field) {
      onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      // La date part du plus récent, un nom part de A : le défaut utile
      // dépend du champ.
      onSortChange({ field, direction: field === 'date' ? 'desc' : 'asc' });
    }
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {/* En-tête collant. `role`s explicites : la grille CSS remplace un
          tableau, il faut redire la sémantique aux lecteurs d'écran. */}
      <div
        role="row"
        className={`${GRID} sticky top-0 z-10 border-b border-line bg-canvas px-3 py-2`}
      >
        {/* Case « tout / rien ». `indeterminate` n'existe pas en attribut :
            il se pose sur l'élément, d'où la ref de rappel. */}
        <div role="columnheader" className="flex items-center justify-center">
          {selection && (
            <input
              type="checkbox"
              checked={selection.allSelected}
              ref={(el) => {
                if (el) el.indeterminate = selection.someSelected;
              }}
              onChange={selection.toggleAll}
              aria-label={
                selection.allSelected
                  ? 'Désélectionner toutes les demandes affichées'
                  : 'Sélectionner toutes les demandes affichées'
              }
              className="h-4 w-4 cursor-pointer accent-[color:var(--teal)]"
            />
          )}
        </div>

        {COLUMNS.map((col) => {
          const active = col.sort && sort.field === col.sort;
          const Icon = !col.sort
            ? null
            : !active
              ? ChevronsUpDown
              : sort.direction === 'asc'
                ? ArrowUp
                : ArrowDown;

          return (
            <div
              key={col.key}
              role="columnheader"
              aria-sort={
                col.sort
                  ? active
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined
              }
              className={
                [col.numeric ? 'text-right' : '', col.hideNarrow ? HIDE_NARROW : '']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              {col.sort ? (
                <button
                  type="button"
                  onClick={() => toggleSort(col.sort!)}
                  className={`inline-flex items-center gap-1 text-xs font-semibold transition-colors ${
                    active ? 'text-teal-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {col.label}
                  {Icon && <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />}
                </button>
              ) : (
                <span className="text-xs font-semibold text-muted">{col.label}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Conteneur défilant propre : la virtualisation impose une hauteur
          bornée. La vue cartes, elle, laisse défiler la page. */}
      <div
        ref={scrollRef}
        role="rowgroup"
        className="overflow-y-auto"
        style={{ height: 'min(70vh, 1100px)', minHeight: 320 }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const lead = leads[item.index];
            return (
              <div
                key={lead.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <Row
                  lead={lead}
                  onOpen={onOpen}
                  onAssign={onAssign}
                  thresholds={thresholds}
                  selection={selection}
                  duplicate={duplicates?.marks.get(lead.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({
  lead,
  onOpen,
  onAssign,
  thresholds,
  selection,
  duplicate,
}: {
  lead: Lead;
  onOpen: (lead: Lead) => void;
  onAssign?: (lead: Lead) => void;
  thresholds: AgeThresholds;
  selection?: Selection;
  duplicate?: DuplicateMark;
}) {

  const days = ageInDays(lead.date);
  const tone = ageTone(days, thresholds);
  const assignee = lead.assigneeNames.map(formatPersonName).join(', ');
  // Règle partagée avec l'export : un code postal à quatre chiffres est un
  // zéro initial perdu par un tableur, pas un code court.
  const postalCode = normalisePostalCode(lead.address.postalCode);


  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(lead);
        }
      }}
      aria-label={`Demande de ${formatPersonName(lead.fullName)}`}
      // `group` : les actions de fin de ligne se révèlent au survol du parent.
      className={`${GRID} group h-full cursor-pointer border-b border-line px-3 ${
        selection?.isSelected(lead.id) ? 'bg-teal-soft' : 'hover:bg-canvas'
      }`}
      // Liseré sur toutes les lignes, sans exception : voir priorityEdge.
      style={{ boxShadow: `inset 3px 0 0 0 ${priorityEdge(lead)}` }}
    >
      {/* Le liseré est une couleur : on double par du texte masqué. */}
      <span className="sr-only">Priorité {lead.priority}.</span>

      <div role="cell" className="flex items-center justify-center">
        {selection && (
          <input
            type="checkbox"
            checked={selection.isSelected(lead.id)}
            // `onClick` et non `onChange` : seul l'événement de clic porte
            // `shiftKey`, dont dépend la sélection de plage.
            onClick={(e) => {
              e.stopPropagation();
              selection.toggle(lead.id, e.shiftKey);
            }}
            onChange={() => {}}
            aria-label={`Sélectionner la demande de ${formatPersonName(lead.fullName)}`}
            className="h-4 w-4 cursor-pointer accent-[color:var(--teal)]"
          />
        )}
      </div>

      {/* Nom — deux lignes : l'identité, puis le profil du demandeur. */}
      <div role="cell" className="min-w-0">
        <p className="min-w-0 truncate text-sm font-semibold text-ink">
          {formatPersonName(lead.fullName)}
        </p>
        <p className="min-w-0 truncate text-xs text-muted">
          {[categoryLabel(lead), lead.company].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <div role="cell" className="min-w-0">
        <p className="truncate text-xs text-ink" title={lead.motive}>
          {shortMotive(lead.motive) || '—'}
        </p>
      </div>

      {/* Coordonnées — e-mail et téléphone ensemble, comme dans la carte. Le
          `href` du téléphone prend le numéro brut : seul l'affichage passe par
          `formatPhone`. Le tiret n'apparaît que si les deux manquent — sous un
          numéro présent il ne serait que du bruit. */}
      <div role="cell" className="min-w-0">
        {lead.email && (
          <span className="flex min-w-0 items-center gap-1.5">
            <a
              href={`mailto:${lead.email}`}
              onClick={stop}
              title={lead.email}
              className="min-w-0 truncate text-xs text-teal-ink hover:underline"
            >
              {lead.email}
            </a>
            {/* Contre l'adresse : c'est elle qui rassemble le groupe. */}
            {duplicate && <DuplicateBadge note={duplicateNote(duplicate)} />}
          </span>
        )}
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            onClick={stop}
            className="block min-w-0 truncate text-xs tabular-nums text-teal-ink hover:underline"
          >
            {formatPhone(lead.phone)}
          </a>
        )}
        {!lead.email && !lead.phone && <p className="text-xs text-muted">—</p>}
      </div>

      {/* Le code postal au-dessus de la ville, et non l'inverse : cinq chiffres
          en tête de colonne s'alignent d'une ligne à l'autre et se scannent
          d'une seule passe verticale, ce qui est exactement la question posée
          ici — la demande est-elle sur le bon secteur ? La ville ne répond pas
          à ça (« Saint-Priest » n'annonce pas son département) et se lit à la
          ligne suivante, où sa troncature ne coûte rien. Sans code postal elle
          remonte, plutôt que de laisser un blanc au-dessus d'elle. */}
      <div role="cell" className="min-w-0">
        {postalCode ? (
          <>
            <p className="text-xs font-semibold tabular-nums text-ink">{postalCode}</p>
            {lead.address.city && (
              <p className="truncate text-xs text-muted" title={lead.address.city}>
                {lead.address.city}
              </p>
            )}
          </>
        ) : (
          <p className="truncate text-xs text-ink" title={lead.address.city || undefined}>
            {lead.address.city || '—'}
          </p>
        )}
      </div>

      {/* Pastille pleine plutôt qu'une icône seule : le statut est le premier
          signal de tri visuel d'une file d'attente, il doit se voir de loin. */}
      <div role="cell" className="min-w-0">
        <StatusBadge status={lead.status} compact />
      </div>

      <div role="cell" className="text-right">
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${TONE_CLASS[tone]}`}
          title={`Reçue il y a ${days ?? '?'} jour(s)`}
        >
          {formatAge(days)}
        </span>
      </div>

      <div role="cell" className={`min-w-0 ${HIDE_NARROW}`}>
        <p className={`truncate text-xs ${assignee ? 'text-ink' : 'text-muted'}`}>
          {assignee || 'Non assigné'}
        </p>
      </div>

      <div role="cell" className="flex justify-end">
        {onAssign && (
          <button
            type="button"
            onClick={(e) => {
              // Sans cet arrêt, le clic ouvrirait aussi la fiche complète.
              e.stopPropagation();
              onAssign(lead);
            }}
            aria-label={`Assigner la demande de ${formatPersonName(lead.fullName)}`}
            // Révélée au survol, mais **toujours** atteignable au clavier et
            // présente là où il n'y a pas de survol — un écran tactile
            // n'aurait jamais accès à une action masquée par `:hover`.
            className="row-action truncate rounded-control border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-ink hover:bg-canvas"
          >
            Assigner
          </button>
        )}
      </div>
    </div>
  );
}

const stop = (e: React.MouseEvent) => e.stopPropagation();

