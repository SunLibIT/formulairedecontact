/**
 * Extraction marketing de la liste affichée.
 *
 * Le bouton n'a aucun réglage : il exporte **exactement** ce que la vue montre,
 * filtres et période compris. C'est ce qui rend le résultat prévisible — ce
 * qu'on voit est ce qu'on emporte — et ce qui évite un second jeu de règles de
 * sélection à maintenir.
 *
 * Le seul écart possible entre la liste et le fichier est la fusion des
 * demandes répétées d'une même adresse. Il est annoncé **avant** le clic : un
 * fichier plus court que la liste, sans explication, se lit comme un export
 * tronqué.
 */
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { downloadCsv, toCsv } from '../lib/csv';
import {
  buildMarketingExport,
  dedupeByEmail,
  exportFilename,
} from '../lib/marketingExport';
import type { Lead, LeadSource } from '../lib/records';
import { SecondaryButton } from './ui';

export function ExportButton({
  leads,
  source,
}: {
  leads: Lead[];
  source: LeadSource;
}) {
  // Le compte rendu est mémorisé **avec la liste** qui l'a produit : au
  // moindre changement de filtre la référence change et le message disparaît,
  // plutôt que de continuer à annoncer un export qui ne correspond plus à ce
  // qui est affiché. Pas d'effet ni de minuteur pour cela.
  const [done, setDone] = useState<{ text: string; of: Lead[] } | null>(null);
  const message = done?.of === leads ? done.text : '';

  // Seuls les compteurs sont calculés au rendu ; les 25 colonnes ne le sont
  // qu'au clic. Sérialiser 2 000 contacts à chaque frappe dans la recherche
  // serait du travail jeté.
  //
  // Le dédoublonnage est appliqué ici aussi, sans quoi le bouton annoncerait
  // un nombre que le fichier ne tiendrait pas.
  const { exportable, merged } = useMemo(() => {
    const { kept } = dedupeByEmail(leads);
    return { exportable: kept.length, merged: leads.length - kept.length };
  }, [leads]);

  const run = () => {
    const result = buildMarketingExport(leads);
    const ok = downloadCsv(exportFilename(source), toCsv(result));

    if (!ok) {
      setDone({ text: 'Téléchargement bloqué par le navigateur.', of: leads });
      return;
    }

    const n = result.rows.length;
    const parts = [`${n} contact${n > 1 ? 's' : ''} exporté${n > 1 ? 's' : ''}`];
    if (result.merged) {
      parts.push(`${result.merged} en doublon fusionné${result.merged > 1 ? 's' : ''}`);
    }
    if (result.withoutEmail) parts.push(`${result.withoutEmail} sans email`);

    setDone({ text: `${parts.join(' · ')}.`, of: leads });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <SecondaryButton icon={Download} onClick={run} disabled={exportable === 0}>
        Exporter{exportable > 0 && ` (${exportable})`}
      </SecondaryButton>

      {/* Un seul emplacement pour deux états : ce que l'export va fusionner
          tant qu'on n'a pas cliqué, ce qu'il a fait ensuite. Rien à dire
          quand le fichier reflète la liste ligne pour ligne. */}
      {(message || merged > 0) && (
        <p aria-live="polite" className="text-xs text-muted">
          {message || `${merged} demande${merged > 1 ? 's' : ''} en doublon à fusionner`}
        </p>
      )}
    </div>
  );
}
