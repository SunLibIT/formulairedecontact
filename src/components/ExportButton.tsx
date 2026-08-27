/**
 * Extraction marketing de la liste affichée.
 *
 * Le bouton n'a pas de filtre propre : il exporte **exactement** ce que la vue
 * montre, filtres et période compris, moins les contacts sans consentement.
 * C'est ce qui rend le résultat prévisible — ce qu'on voit est ce qu'on
 * emporte — et ce qui évite un second jeu de règles de sélection à maintenir.
 *
 * Le nombre de lignes et le nombre d'écartés sont affichés **avant** le clic.
 * Une exclusion RGPD annoncée après coup ne s'explique pas : l'utilisateur
 * verrait un fichier plus court que la liste sans savoir pourquoi, et
 * soupçonnerait un export tronqué.
 */
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildMarketingExport,
  downloadCsv,
  eligibleForCampaign,
  exportFilename,
  toCsv,
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

  // Seuls les compteurs sont calculés au rendu ; les lignes ne le sont qu'au
  // clic. Sérialiser 2 000 contacts à chaque frappe dans la recherche serait
  // du travail jeté.
  const { eligible, excluded } = useMemo(() => {
    const ok = leads.reduce((n, l) => n + (eligibleForCampaign(l) ? 1 : 0), 0);
    return { eligible: ok, excluded: leads.length - ok };
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
    // Les doublons d'adresse restent dans le fichier — c'est à l'outil
    // d'emailing de les fusionner — mais on annonce le nombre réel de
    // destinataires, qui est celui qui compte pour un envoi.
    if (result.uniqueEmails !== n) parts.push(`${result.uniqueEmails} adresses distinctes`);
    if (result.withoutEmail) parts.push(`${result.withoutEmail} sans email`);

    setDone({ text: `${parts.join(' · ')}.`, of: leads });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <SecondaryButton icon={Download} onClick={run} disabled={eligible === 0}>
        Exporter{eligible > 0 && ` (${eligible})`}
      </SecondaryButton>

      {/* Un seul emplacement pour deux états : la règle d'exclusion tant qu'on
          n'a pas cliqué, le résultat ensuite. */}
      <p aria-live="polite" className="text-xs text-muted">
        {message ||
          (eligible === 0
            ? 'Aucun contact avec consentement RGPD'
            : excluded > 0
              ? `${excluded} écarté${excluded > 1 ? 's' : ''} sans consentement RGPD`
              : 'Consentement RGPD vérifié')}
      </p>
    </div>
  );
}
