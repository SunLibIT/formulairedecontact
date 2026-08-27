/**
 * Extraction du tableau de bord KPI.
 *
 * Exporte la sélection du panneau — source, collaborateur, période — telle que
 * les graphiques l'affichent. Le fichier rappelle ce périmètre dans son bloc
 * « Contexte » : un tableau de KPI sorti de son cadre n'est pas interprétable,
 * « 214 demandes » ne veut rien dire sans savoir sur quoi et sur quand.
 *
 * Pas de réglage : contrairement à l'export marketing, il n'y a rien à
 * arbitrer ici. Des indicateurs ne sont pas des données de contact, le
 * consentement RGPD ne s'y applique pas.
 */
import { Download } from 'lucide-react';
import { useState } from 'react';
import { downloadCsv, toCsv } from '../lib/csv';
import { buildKpiExport, kpiExportFilename, type KpiScope } from '../lib/kpiExport';
import type { Lead } from '../lib/records';
import { SecondaryButton } from './ui';

export function KpiExportButton({
  leads,
  scope,
}: {
  leads: Lead[];
  scope: KpiScope;
}) {
  // Mémorisé avec la liste qui l'a produit : changer de source ou de période
  // efface le message plutôt que de laisser un compte rendu périmé à l'écran.
  const [done, setDone] = useState<{ text: string; of: Lead[] } | null>(null);
  const message = done?.of === leads ? done.text : '';

  const run = () => {
    const table = buildKpiExport(leads, scope);
    const ok = downloadCsv(kpiExportFilename(), toCsv(table));
    setDone({
      text: ok
        ? `${table.rows.length} indicateurs exportés.`
        : 'Téléchargement bloqué par le navigateur.',
      of: leads,
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <SecondaryButton icon={Download} onClick={run} disabled={leads.length === 0}>
        Exporter les KPI
      </SecondaryButton>
      <p aria-live="polite" className="text-xs text-muted">
        {message || `${leads.length} demande${leads.length > 1 ? 's' : ''} analysée${leads.length > 1 ? 's' : ''}`}
      </p>
    </div>
  );
}
