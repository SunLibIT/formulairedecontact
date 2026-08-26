/**
 * Carte de demande — unique, pour les deux sources.
 *
 * Remplace `ContactCard` et `AirtableCard`, qui étaient identiques à 90 % et
 * divergeaient sur des détails (l'une affichait `Date création`, l'autre
 * `Submit Date`, chacune reconstruisait le nom à sa façon). La normalisation
 * en `Lead` rend un seul composant suffisant.
 *
 * Charte appliquée : icône de type en tête, identité consolidée sans
 * répétition, date relative avec l'absolue en infobulle, toute la carte
 * cliquable, aucune donnée affichée deux fois.
 */
import {
  Briefcase,
  Building2,
  Euro,
  HardHat,
  Landmark,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Sun,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { formatAddress, type Lead } from '../lib/records';
import { Initials, PriorityBadge, RelativeDate, StatusBadge } from './ui';

/** Icône de catégorie, alignée sur le référentiel SunLib. */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  'Un installateur': HardHat,
  'Un particulier': User,
  'Une entreprise': Building2,
  'Une collectivité': Landmark,
  'Abonné SunLib': Sun,
  Particulier: User,
  Entreprise: Building2,
};

export function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const CategoryIcon = CATEGORY_ICON[lead.category] ?? User;
  const address = formatAddress(lead.address);
  const assignee = lead.assigneeNames.join(', ');

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
      aria-label={`Ouvrir la demande de ${lead.fullName}`}
      className="cursor-pointer rounded-card border border-line bg-surface p-4 transition-colors hover:bg-canvas"
    >
      <div className="flex items-start gap-3">
        <Initials name={lead.fullName} />

        <div className="min-w-0 flex-1">
          {/* Identité consolidée : nom + email sur la même ligne logique,
              jamais répétés plus bas. */}
          <h3 className="truncate font-semibold text-ink">{lead.fullName}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <CategoryIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{lead.category || 'Type non renseigné'}</span>
            {lead.company && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate font-medium text-ink">{lead.company}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={lead.status} />
          <PriorityBadge priority={lead.priority} />
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        {lead.email && (
          <Row icon={Mail} label="Email">
            <span className="truncate">{lead.email}</span>
          </Row>
        )}
        {lead.phone && (
          <Row icon={Phone} label="Téléphone">
            {lead.phone}
          </Row>
        )}
        {lead.motive && (
          <Row icon={Briefcase} label="Motif">
            <span className="line-clamp-1 font-medium">{lead.motive}</span>
          </Row>
        )}
        {address && (
          <Row icon={MapPin} label="Adresse">
            <span className="line-clamp-1">{address}</span>
          </Row>
        )}
        {lead.message && (
          <Row icon={MessageSquare} label="Message">
            <span className="line-clamp-1 italic text-muted">{lead.message}</span>
          </Row>
        )}

        {/* Chiffres propres au simulateur : alignés à droite, comme l'exige
            la charte pour les valeurs numériques. */}
        {lead.source === 'solar' && lead.metrics && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted">
            {lead.metrics.monthlyBill != null && (
              <Metric icon={Euro} value={`${lead.metrics.monthlyBill} €/mois`} />
            )}
            {lead.metrics.recommendedPower != null && (
              <Metric icon={Sun} value={`${lead.metrics.recommendedPower} kWc`} />
            )}
            {lead.metrics.annualConsumption != null && (
              <Metric icon={Zap} value={`${lead.metrics.annualConsumption} kWh/an`} />
            )}
          </div>
        )}
      </dl>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <User className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          {assignee ? (
            <span className="font-medium text-teal-ink">{assignee}</span>
          ) : (
            <span>Non assigné</span>
          )}
        </span>
        <span className="flex items-center gap-2 text-muted">
          {lead.partner && (
            <span className="rounded-full bg-teal-soft px-2 py-0.5 font-medium text-teal-ink">
              {lead.partner}
            </span>
          )}
          <RelativeDate iso={lead.date} />
        </span>
      </div>
    </article>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-ink">
      <dt className="sr-only">{label}</dt>
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-teal-ink"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function Metric({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
