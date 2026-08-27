/**
 * Sectorisation commerciale — administration de la table de référence.
 *
 * Une ligne = un département français = un commercial. C'est cette table qui
 * oriente les listes d'assignation ; la modifier ici change immédiatement ce
 * que voient les autres écrans, d'où le rechargement après chaque écriture.
 *
 * ## Ce que la page fait, et ce qu'elle refuse de faire
 *
 * L'édition est **inline et immédiate** : changer un commercial écrit dans la
 * seconde. Pas de mode « brouillon » avec un bouton Enregistrer — sur 95 lignes
 * dont on ne touche qu'une ou deux, un formulaire global ferait porter le risque
 * de perte sur l'ensemble.
 *
 * L'écriture est **optimiste, avec retour en arrière** : la cellule affiche la
 * nouvelle valeur tout de suite, et la reprend si Airtable refuse. Une liste de
 * référence se relit constamment ; attendre le serveur à chaque frappe rendrait
 * la page poussive pour rien.
 *
 * Le **code département est immuable** après création. C'est la clé de
 * rapprochement avec les demandes : la changer sur une ligne existante
 * déplacerait silencieusement tout un secteur. Pour corriger un code, on
 * supprime et on recrée — le geste est alors explicite.
 *
 * La suppression demande confirmation dans la ligne même, pas dans une
 * boîte de dialogue : le contexte reste visible pendant qu'on décide.
 */
import { AlertTriangle, Check, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createRecord, deleteRecord, updateRecord } from '../lib/airtable';
import type { StaffMember, Territory } from '../lib/records';
import { REGIONS, TABLES, TERRITORY } from '../lib/schema';
import { formatPersonName } from '../lib/format';
import { Callout, SearchField, SecondaryButton } from './ui';
import { SearchableSelect } from './SearchableSelect';

interface Props {
  territories: Territory[];
  staff: StaffMember[];
  loading: boolean;
  error: string;
  /** Recharge depuis Airtable en vidant le cache de session. */
  onRefresh: () => Promise<void> | void;
  /** Faux en lecture seule : la page reste consultable, sans contrôles. */
  canWrite: boolean;
}

/** Ce qu'une ligne en cours d'écriture affiche. */
type Pending = Record<string, boolean>;

export function SectorPanel({
  territories,
  staff,
  loading,
  error,
  onRefresh,
  canWrite,
}: Props) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending>({});
  const [failure, setFailure] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Édition locale : ce que l'écran montre pendant qu'Airtable enregistre, et
  // ce sur quoi on revient en cas de refus.
  const [overrides, setOverrides] = useState<Record<string, Partial<Territory>>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const staffOptions = useMemo(
    () =>
      staff
        .filter((s) => s.active)
        .map((s) => ({ value: s.id, label: s.name, hint: s.group })),
    [staff],
  );

  const rows = useMemo(() => {
    const merged = territories
      .filter((t) => !removed.has(t.id))
      .map((t) => ({ ...t, ...overrides[t.id] }));

    const q = query.trim().toLowerCase();
    const filtered = q
      ? merged.filter((t) => {
          const names = t.staffIds
            .map((id) => staff.find((s) => s.id === id)?.name ?? '')
            .join(' ');
          return `${t.code} ${t.name} ${t.region} ${names}`.toLowerCase().includes(q);
        })
      : merged;

    // Tri par code : c'est l'ordre dans lequel on cherche un département.
    return [...filtered].sort((a, b) => a.code.localeCompare(b.code));
  }, [territories, overrides, removed, query, staff]);

  const uncovered = rows.filter((t) => t.staffIds.length === 0).length;

  /**
   * Écrit un champ, en affichant tout de suite le résultat attendu.
   *
   * En cas de refus, l'affichage revient à la valeur d'avant et le message
   * d'Airtable est montré tel quel : « unknown field name » ou une option de
   * liste inconnue en disent plus long qu'un « échec » générique.
   */
  const write = async (
    row: Territory,
    fields: Record<string, unknown>,
    optimistic: Partial<Territory>,
  ) => {
    setFailure('');
    setPending((p) => ({ ...p, [row.id]: true }));
    setOverrides((o) => ({ ...o, [row.id]: { ...o[row.id], ...optimistic } }));
    try {
      await updateRecord(TABLES.territories, row.id, fields);
      // Le cache de session porte encore l'ancienne valeur : les listes
      // d'assignation des autres onglets la liraient sans ce rechargement.
      await onRefresh();
      setOverrides((o) => {
        const next = { ...o };
        delete next[row.id];
        return next;
      });
    } catch (e) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[row.id];
        return next;
      });
      setFailure(e instanceof Error ? e.message : 'Écriture refusée');
    } finally {
      setPending((p) => ({ ...p, [row.id]: false }));
    }
  };

  const remove = async (row: Territory) => {
    setFailure('');
    setConfirming(null);
    setPending((p) => ({ ...p, [row.id]: true }));
    setRemoved((r) => new Set(r).add(row.id));
    try {
      await deleteRecord(TABLES.territories, row.id);
      await onRefresh();
      setRemoved((r) => {
        const next = new Set(r);
        next.delete(row.id);
        return next;
      });
    } catch (e) {
      setRemoved((r) => {
        const next = new Set(r);
        next.delete(row.id);
        return next;
      });
      setFailure(e instanceof Error ? e.message : 'Suppression refusée');
    } finally {
      setPending((p) => ({ ...p, [row.id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Callout tone="danger" icon={AlertTriangle}>
          <strong>Sectorisation illisible.</strong> {error}
        </Callout>
      )}

      {failure && (
        <Callout tone="danger" icon={AlertTriangle}>
          <strong>Écriture refusée.</strong> {failure}
        </Callout>
      )}

      {!canWrite && (
        <Callout tone="info" icon={AlertTriangle}>
          Consultation seule. Connectez-vous avec un compte collaborateur pour
          modifier la sectorisation.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Département, code, région, commercial…"
        />
        <SecondaryButton icon={RefreshCw} busy={loading} onClick={() => void onRefresh()}>
          Actualiser
        </SecondaryButton>
        {canWrite && (
          <SecondaryButton icon={Plus} onClick={() => setCreating((v) => !v)}>
            Ajouter
          </SecondaryButton>
        )}
      </div>

      <p aria-live="polite" className="text-sm text-muted">
        {rows.length} département{rows.length > 1 ? 's' : ''}
        {rows.length !== territories.length && ` sur ${territories.length}`}
        {/* Une ligne sans commercial ne rapproche rien : c'est le défaut le plus
            coûteux de cette table, et il ne se voit pas autrement. */}
        {uncovered > 0 && (
          <span className="text-amber"> · {uncovered} sans commercial</span>
        )}
      </p>

      {creating && canWrite && (
        <NewRow
          staffOptions={staffOptions}
          existingCodes={territories.map((t) => t.code)}
          onCancel={() => setCreating(false)}
          onCreate={async (fields) => {
            setFailure('');
            try {
              await createRecord(TABLES.territories, fields);
              await onRefresh();
              setCreating(false);
            } catch (e) {
              setFailure(e instanceof Error ? e.message : 'Création refusée');
            }
          }}
        />
      )}

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-4 py-3 font-medium">Code</th>
              <th scope="col" className="px-4 py-3 font-medium">Département</th>
              <th scope="col" className="px-4 py-3 font-medium">Région</th>
              <th scope="col" className="px-4 py-3 font-medium">Commercial</th>
              <th scope="col" className="px-4 py-3 font-medium">Actif</th>
              {canWrite && <th scope="col" className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busy = pending[row.id];
              return (
                <tr
                  key={row.id}
                  className={`border-b border-line last:border-0 ${
                    busy ? 'opacity-60' : ''
                  } ${row.active ? '' : 'bg-canvas'}`}
                >
                  <td className="px-4 py-2 font-semibold text-ink">{row.code}</td>

                  <td className="px-4 py-2">
                    {canWrite ? (
                      <input
                        type="text"
                        defaultValue={row.name}
                        disabled={busy}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value === row.name) return;
                          void write(row, { [TERRITORY.name]: value }, { name: value });
                        }}
                        className="w-full min-w-[8rem] rounded-control border border-line bg-surface px-2 py-1 text-ink"
                        aria-label={`Nom du département ${row.code}`}
                      />
                    ) : (
                      <span className="text-ink">{row.name}</span>
                    )}
                  </td>

                  <td className="px-4 py-2">
                    {canWrite ? (
                      <select
                        value={row.region}
                        disabled={busy}
                        onChange={(e) => {
                          const value = e.target.value;
                          void write(row, { [TERRITORY.region]: value }, { region: value });
                        }}
                        className="w-full min-w-[11rem] rounded-control border border-line bg-surface px-2 py-1 text-ink"
                        aria-label={`Région du département ${row.code}`}
                      >
                        <option value="">—</option>
                        {REGIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-ink">{row.region || '—'}</span>
                    )}
                  </td>

                  <td className="px-4 py-2">
                    {canWrite ? (
                      <div className="min-w-[13rem]">
                        <SearchableSelect
                          ariaLabel={`Commercial du département ${row.code}`}
                          emptyLabel="Aucun"
                          searchPlaceholder="Rechercher…"
                          value={row.staffIds[0] ?? ''}
                          options={staffOptions}
                          onChange={(id) => {
                            // Champ de liaison : un TABLEAU d'identifiants,
                            // jamais une chaîne. Vide pour retirer.
                            void write(
                              row,
                              { [TERRITORY.salesRep]: id ? [id] : [] },
                              { staffIds: id ? [id] : [] },
                            );
                          }}
                        />
                      </div>
                    ) : (
                      <span className="text-ink">
                        {row.staffIds
                          .map((id) => formatPersonName(staff.find((s) => s.id === id)?.name ?? ''))
                          .join(', ') || '—'}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.active}
                        disabled={busy || !canWrite}
                        onChange={(e) => {
                          const value = e.target.checked;
                          void write(row, { [TERRITORY.active]: value }, { active: value });
                        }}
                        className="h-4 w-4 accent-teal"
                        aria-label={`Département ${row.code} actif`}
                      />
                      <span className="text-xs text-muted">
                        {row.active ? 'Actif' : 'Neutralisé'}
                      </span>
                    </label>
                  </td>

                  {canWrite && (
                    <td className="px-4 py-2 text-right">
                      {confirming === row.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void remove(row)}
                            className="inline-flex items-center gap-1 rounded-control border border-danger-border bg-danger-bg px-2 py-1 text-xs font-medium text-danger"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                            Supprimer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            aria-label="Annuler la suppression"
                            className="rounded-control border border-line px-2 py-1 text-muted"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirming(row.id)}
                          aria-label={`Supprimer le département ${row.code}`}
                          disabled={busy}
                          className="rounded-control p-1.5 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 6 : 5} className="px-4 py-8 text-center text-muted">
                  {loading ? 'Chargement…' : 'Aucun département ne correspond.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Le code département est la clé de rapprochement avec les demandes : il ne
        s&apos;édite pas après création. Pour le corriger, supprimez la ligne et
        recréez-la. Neutraliser une ligne la retire de la sectorisation sans
        perdre son historique.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- création */

/**
 * Ligne de création.
 *
 * Le code est vérifié ici, avant l'appel : deux caractères, et pas déjà pris.
 * Airtable accepterait un doublon sans broncher, et deux lignes pour le même
 * département fusionneraient leurs commerciaux dans l'index — un secteur se
 * retrouverait avec deux titulaires sans que personne l'ait décidé.
 */
function NewRow({
  staffOptions,
  existingCodes,
  onCancel,
  onCreate,
}: {
  staffOptions: Array<{ value: string; label: string; hint?: string }>;
  existingCodes: string[];
  onCancel: () => void;
  onCreate: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);

  const trimmed = code.trim().toUpperCase();
  const taken = existingCodes.includes(trimmed);
  // Deux caractères : « 01 » et non « 1 ». La colonne est un texte, et le zéro
  // initial fait partie de la clé.
  const wellFormed = /^[0-9]{2}$/.test(trimmed) || trimmed === '2A' || trimmed === '2B';
  const problem = !trimmed
    ? ''
    : taken
      ? `Le code ${trimmed} existe déjà.`
      : wellFormed
        ? ''
        : 'Deux caractères attendus, zéro initial compris — « 01 », « 20 », « 2A ».';

  return (
    <div className="rounded-card border border-teal-soft bg-teal-soft/40 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="33"
            maxLength={2}
            className="w-20 rounded-control border border-line bg-surface px-2 py-1.5 text-ink"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Département</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gironde"
            className="w-44 rounded-control border border-line bg-surface px-2 py-1.5 text-ink"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Région</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-52 rounded-control border border-line bg-surface px-2 py-1.5 text-ink"
          >
            <option value="">—</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <div className="min-w-[13rem]">
          <span className="mb-1 block text-xs font-medium text-muted">Commercial</span>
          <SearchableSelect
            ariaLabel="Commercial du nouveau département"
            emptyLabel="Aucun"
            searchPlaceholder="Rechercher…"
            value={staffId}
            options={staffOptions}
            onChange={setStaffId}
          />
        </div>

        <div className="flex items-center gap-2">
          <SecondaryButton
            icon={Check}
            busy={busy}
            disabled={!trimmed || Boolean(problem)}
            onClick={() => {
              setBusy(true);
              void onCreate({
                [TERRITORY.code]: trimmed,
                [TERRITORY.name]: name.trim(),
                ...(region ? { [TERRITORY.region]: region } : {}),
                ...(staffId ? { [TERRITORY.salesRep]: [staffId] } : {}),
                [TERRITORY.active]: true,
              }).finally(() => setBusy(false));
            }}
          >
            Créer
          </SecondaryButton>
          <SecondaryButton icon={X} onClick={onCancel}>
            Annuler
          </SecondaryButton>
        </div>
      </div>

      {problem && <p className="mt-2 text-sm text-danger">{problem}</p>}
    </div>
  );
}
