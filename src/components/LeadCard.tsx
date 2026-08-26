/**
 * Carte de demande — unique, pour les deux sources.
 *
 * Hiérarchie de lecture, de haut en bas : **identité, puis décision, puis
 * contact**. La version précédente faisait l'inverse — email et téléphone
 * étaient les éléments les plus visibles alors qu'on ne scanne pas une file
 * d'attente par email, tandis que le motif et l'ancienneté, qui décident de
 * l'ordre de traitement, étaient en gris tout en bas.
 *
 * Deux signaux, deux formes, pas de concurrence :
 *  - la **priorité** est un liseré de 3 px à gauche, doublé d'un texte masqué
 *    pour les lecteurs d'écran ;
 *  - l'**ancienneté** est le seul badge de la carte.
 *
 * Le statut reste visible en ligne de métadonnée, avec son icône : il informe
 * sans revendiquer la place d'un badge.
 */
import { HardHat, Landmark, MapPin, Sun, User, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import {
  ageInDays,
  ageTone,
  DEFAULT_AGE_THRESHOLDS,
  formatAge,
  formatPersonName,
  formatPhone,
  type AgeThresholds,
} from '../lib/format';
import { shortMotive } from '../lib/motives';
import type { Lead } from '../lib/records';
import { STATUS_TONE, type Status } from '../lib/schema';
import { TONE_CLASS, TONE_ICON } from '../lib/tones';

/**
 * Icône de catégorie. Conservée parce qu'elle porte une information — le type
 * de demandeur — contrairement aux icônes d'email et de téléphone retirées,
 * qui ne faisaient que redire ce que la donnée montre déjà. L'ancienne icône
 * d'immeuble servait à la fois au type et au motif : la collision de sens est
 * levée, le motif n'a plus d'icône.
 */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  'Un installateur': HardHat,
  'Un particulier': User,
  'Une entreprise': Landmark,
  'Une collectivité': Landmark,
  'Abonné SunLib': Sun,
  Particulier: User,
  Entreprise: Landmark,
};

/** Libellé court du type de demandeur — « Un installateur » scanne mal. */
const CATEGORY_LABEL: Record<string, string> = {
  'Un installateur': 'Installateur',
  'Un particulier': 'Particulier',
  'Une entreprise': 'Entreprise',
  'Une collectivité': 'Collectivité',
  'Abonné SunLib': 'Abonné',
};

/** Liseré de priorité. « Basse » n'en porte pas : l'absence est un signal. */
const PRIORITY_EDGE: Record<string, string> = {
  Haute: 'var(--red)',
  Moyenne: 'var(--amber-soft)',
};

export interface QuickAction {
  label: string;
  /** Champs à écrire côté Airtable. */
  patch: { status?: Status; assigneeId?: string | null };
}

export function LeadCard({
  lead,
  onOpen,
  onQuickAction,
  viewerStaffId,
  thresholds = DEFAULT_AGE_THRESHOLDS,
}: {
  lead: Lead;
  onOpen: () => void;
  /** Exécute l'action rapide. Résout quand l'écriture est terminée. */
  onQuickAction?: (lead: Lead, action: QuickAction) => Promise<void>;
  /** Enregistrement RH du visiteur, pour proposer « M'assigner ». */
  viewerStaffId?: string | null;
  thresholds?: AgeThresholds;
}) {
  const [busy, setBusy] = useState(false);

  const days = ageInDays(lead.date);
  const tone = ageTone(days, thresholds);
  const StatusIcon = TONE_ICON[STATUS_TONE[lead.status]];
  const CategoryIcon = CATEGORY_ICON[lead.category] ?? User;

  const assignee = lead.assigneeNames.map(formatPersonName).join(', ');
  const unassigned = !lead.assigneeIds.length && !lead.assigneeNames.length;
  const edge = PRIORITY_EDGE[lead.priority];

  // Une seule action, celle qui fait avancer le dossier là où il en est.
  // Pas d'action inventée sur un dossier déjà traité.
  const action: QuickAction | null = unassigned && viewerStaffId
    ? { label: "M'assigner", patch: { assigneeId: viewerStaffId } }
    : lead.status === 'Nouveau'
      ? { label: 'Marquer contacté', patch: { status: 'A contacter' } }
      : null;

  const run = async () => {
    if (!action || !onQuickAction || busy) return;
    setBusy(true);
    try {
      await onQuickAction(lead, action);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Ouvrir la demande de ${formatPersonName(lead.fullName)}`}
      // `h-full` + `flex-col` : toutes les cartes d'une rangée prennent la même
      // hauteur et leur pied s'aligne en bas, quelle que soit la longueur du
      // message. La grille n'est pas touchée.
      className="flex h-full cursor-pointer flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:bg-canvas"
      style={
        edge
          ? {
              borderLeft: `3px solid ${edge}`,
              // Le liseré doit être franc : pas d'arrondi de ce côté.
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
            }
          : undefined
      }
    >
      {/* Le sens n'est jamais porté par la couleur seule : la priorité est
          énoncée en texte pour les lecteurs d'écran. */}
      <span className="sr-only">Priorité {lead.priority}.</span>

      <div className="min-w-0 flex-1 p-4">
        {/* ---- identité ---- */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate font-semibold text-ink">
            {formatPersonName(lead.fullName)}
          </h3>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${TONE_CLASS[tone]}`}
            title={`Reçue il y a ${days ?? '?'} jour(s)`}
          >
            {formatAge(days)}
          </span>
        </div>

        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <CategoryIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate">
            {CATEGORY_LABEL[lead.category] ?? lead.category ?? 'Type inconnu'}
            {lead.company && ` · ${lead.company}`}
          </span>
        </p>

        {/* Ville seule, pas l'adresse complète : minimisation des données.
            L'adresse reste dans la fiche de détail, consultée à la demande. */}
        {lead.address.city && (
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">
              {lead.address.city}
              {lead.address.department && ` (${lead.address.department})`}
            </span>
          </p>
        )}

        {/* ---- décision ---- */}
        {lead.motive && (
          <p className="mt-3 truncate text-sm font-semibold text-ink" title={lead.motive}>
            {shortMotive(lead.motive)}
          </p>
        )}

        {/* Style éditorial : le message est la voix du demandeur, pas une
            métadonnée. Deux lignes pleines, pas quarante caractères. */}
        {lead.message && (
          <p className="lead-message mt-1.5 text-sm text-muted">{lead.message}</p>
        )}
      </div>

      {/* ---- contact et action, en pied aligné en bas ---- */}
      <div className="mt-auto min-w-0 border-t border-line px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-xs">
          <StatusIcon
            className={`h-3.5 w-3.5 shrink-0 ${TONE_CLASS[STATUS_TONE[lead.status]].split(' ').find((c) => c.startsWith('text-')) ?? ''}`}
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="truncate font-medium text-ink">{lead.status}</span>
          <span className="shrink-0 text-muted" aria-hidden="true">
            ·
          </span>
          <span className="truncate text-muted">{assignee || 'Non assigné'}</span>
        </p>

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            {/* Cibles tactiles de 44 px, obtenues par le padding vertical. */}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                onClick={stop}
                className="min-w-0 truncate py-1.5 text-xs text-teal-ink hover:underline"
              >
                {lead.email}
              </a>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                onClick={stop}
                className="min-w-0 truncate py-1.5 text-xs tabular-nums text-teal-ink hover:underline"
              >
                {formatPhone(lead.phone)}
              </a>
            )}
          </div>

          {action && onQuickAction && (
            <button
              type="button"
              onClick={(e) => {
                // Sans cet arrêt, l'action ouvrirait aussi la fiche.
                e.stopPropagation();
                void run();
              }}
              disabled={busy}
              className="shrink-0 rounded-control bg-brand px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? '…' : action.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Empêche un lien du pied d'ouvrir la fiche. */
const stop = (e: React.MouseEvent) => e.stopPropagation();
