/**
 * Carte de demande — unique, pour les deux sources.
 *
 * Hiérarchie de lecture, de haut en bas : **identité, puis décision, puis
 * contact**. La version précédente faisait l'inverse — email et téléphone
 * étaient les éléments les plus visibles alors qu'on ne scanne pas une file
 * d'attente par email, tandis que le motif et l'ancienneté, qui décident de
 * l'ordre de traitement, étaient en gris tout en bas.
 *
 * Un seul badge en haut à droite, l'**ancienneté** : c'est elle qui décide de
 * l'ordre de traitement. Statut, priorité et assigné se lisent ensemble sur
 * une ligne de suivi en pied de carte — remonter la priorité à côté de
 * l'ancienneté recréerait la concurrence de badges qu'on cherche à éviter.
 *
 * Le liseré de priorité à gauche a été essayé puis retiré : trop appuyé sur
 * une grille de cartes, où chaque bord coloré tire l'œil. Il reste en vue
 * liste, où les lignes sont denses et n'ont pas la place d'une pastille.
 */
import { HardHat, Landmark, MapPin, Sun, User, type LucideIcon } from 'lucide-react';
import {
  ageInDays,
  ageTone,
  DEFAULT_AGE_THRESHOLDS,
  formatAge,
  formatPersonName,
  formatPhone,
  type AgeThresholds,
} from '../lib/format';
import { categoryLabel } from '../lib/leadActions';
import { shortMotive } from '../lib/motives';
import type { Lead } from '../lib/records';
import { TONE_CLASS } from '../lib/tones';
import { PriorityBadge, StatusBadge } from './ui';

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

export function LeadCard({
  lead,
  onOpen,
  thresholds = DEFAULT_AGE_THRESHOLDS,
}: {
  lead: Lead;
  onOpen: () => void;
  thresholds?: AgeThresholds;
}) {

  const days = ageInDays(lead.date);
  const tone = ageTone(days, thresholds);
  const CategoryIcon = CATEGORY_ICON[lead.category] ?? User;

  const assignee = lead.assigneeNames.map(formatPersonName).join(', ');



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
    >
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
            {categoryLabel(lead) || 'Type inconnu'}
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

      {/* ---- contact, en pied aligné en bas ---- */}
      <div className="mt-auto min-w-0 border-t border-line px-4 py-2.5">
        {/* Les trois attributs de suivi sur une seule ligne : statut,
            priorité, assigné. La priorité n'est pas remontée en haut à droite
            parce qu'elle y concurrencerait le badge d'ancienneté — c'est
            justement la concurrence qu'on cherchait à supprimer. Seul le nom
            de l'assigné se tronque, les deux signaux restent entiers. */}
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {/* Pastille pleine : le statut portait sa couleur sur une icône de
              14 px et son libellé en gris neutre, ce qui ne se voyait pas.
              C'est le premier signal de tri visuel d'une file d'attente. */}
          <StatusBadge status={lead.status} compact />
          <PriorityBadge priority={lead.priority} />
          <span className="min-w-0 truncate text-muted">
            {assignee || 'Non assigné'}
          </span>
        </div>

        {/* Contacts en pied : cibles tactiles de 44 px obtenues par le
            padding vertical. Plus de bouton d'action ici — faire avancer un
            dossier passe par la vue liste ou par la fiche. */}
        <div className="mt-1.5 flex min-w-0 flex-col">
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
      </div>
    </article>
  );
}

/** Empêche un lien du pied d'ouvrir la fiche. */
const stop = (e: React.MouseEvent) => e.stopPropagation();
