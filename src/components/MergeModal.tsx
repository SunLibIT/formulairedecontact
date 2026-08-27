/**
 * Fusion de demandes répétées — confirmation avant écriture.
 *
 * Montre le plan **avant** de l'appliquer, et en entier : quelle demande est
 * conservée, quels champs elle reçoit et d'où ils viennent, lesquelles passent
 * en « Archivé ». Une fusion touche plusieurs enregistrements d'un coup ; la
 * décrire après coup ne servirait à rien.
 *
 * Ce que l'écran doit rendre évident, c'est que **rien n'est supprimé** : les
 * demandes archivées gardent toutes leurs valeurs dans Airtable et sortent
 * seulement des listes. C'est ce qui rend le geste rattrapable, et il faut
 * qu'un utilisateur pressé le sache sans lire une note de bas de page.
 */
import { AlertTriangle, ArrowDown, X } from 'lucide-react';
import { useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { formatPersonName } from '../lib/format';
import type { MergePlan } from '../lib/merge';
import { Callout, PrimaryButton, SecondaryButton, StatusBadge } from './ui';

/** Date lisible d'une demande, pour situer les lignes du plan. */
function day(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';
}

export function MergeModal({
  plan,
  onClose,
  onMerge,
}: {
  plan: MergePlan;
  onClose: () => void;
  /** Écrit la fusion : complète la cible, archive les sources. */
  onMerge: (plan: MergePlan) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useDialog(onClose);

  const commit = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onMerge(plan);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "La fusion n'a pas pu être enregistrée. Réessayez.",
      );
    } finally {
      setSaving(false);
    }
  };

  const count = plan.sources.length;

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-title"
        tabIndex={-1}
        className="modal-panel flex max-h-full w-full max-w-lg flex-col rounded-t-card bg-surface sm:rounded-card"
      >
        <header className="flex items-start justify-between gap-3 rounded-t-card border-b border-line bg-canvas px-5 py-4">
          <div className="min-w-0">
            <h2 id="merge-title" className="text-base font-bold text-ink">
              Fusionner {plan.sources.length + 1} demandes
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted">
              {formatPersonName(plan.target.fullName)} · {plan.target.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-control p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* La demande conservée, en premier : c'est le résultat, pas une
              étape. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Demande conservée
            </h3>
            <div className="mt-1.5 rounded-card border border-teal bg-teal-soft/40 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {day(plan.target.date)} · la plus récente
                </span>
                <StatusBadge status={plan.target.status} compact />
              </div>
              <p className="mt-1 text-xs text-muted">
                Son statut et sa priorité ne changent pas.
              </p>
            </div>
          </section>

          {/* Ce qu'elle reçoit. Chaque ligne dit d'où vient la valeur : une
              reprise anonyme serait invérifiable. */}
          {plan.filled.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Champs complétés ({plan.filled.length})
              </h3>
              <ul className="mt-1.5 divide-y divide-line rounded-card border border-line">
                {plan.filled.map((f) => (
                  <li key={f.fieldId} className="flex items-baseline gap-2 px-3 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted">{f.label}</span>
                    <span className="min-w-0 flex-1 break-words font-medium text-ink">
                      {f.display}
                    </span>
                    <span className="shrink-0 text-xs text-muted">du {f.from}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.archiveOnly && (
            <Callout tone="info" icon={AlertTriangle}>
              La demande conservée est déjà complète : aucune valeur ne sera reprise.
              La fusion se limitera à archiver {count === 1 ? 'le doublon' : 'les doublons'}.
            </Callout>
          )}

          {/* Les archivées, avec leur statut : c'est là que se voit la
              contradiction éventuelle — un « Qualifié » qu'on met de côté
              mérite d'être remarqué avant de valider. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {count === 1 ? 'Demande archivée' : `Demandes archivées (${count})`}
            </h3>
            <ul className="mt-1.5 divide-y divide-line rounded-card border border-line">
              {plan.sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-ink">{day(s.date)}</span>
                  <StatusBadge status={s.status} compact />
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted">
              Rien n'est supprimé : elles gardent toutes leurs valeurs dans Airtable et
              sortent seulement des listes. L'opération se défait en leur rendant leur
              statut.
            </p>
          </section>

          {error && (
            <Callout tone="danger" icon={AlertTriangle}>
              {error}
            </Callout>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 rounded-b-card border-t border-line bg-canvas px-5 py-3">
          <SecondaryButton onClick={onClose} disabled={saving}>
            Annuler
          </SecondaryButton>
          {/* `arrow` retiré : la flèche de progression suggère une étape
              suivante, or la fusion est l'action terminale. */}
          <PrimaryButton onClick={commit} busy={saving} arrow={false}>
            {plan.archiveOnly ? 'Archiver les doublons' : 'Fusionner'}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
}
