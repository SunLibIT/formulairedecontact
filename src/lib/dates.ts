/**
 * Arithmétique de jours calendaires.
 *
 * Un « jour » a deux sens dans cette application, et les confondre a coûté un
 * décalage d'un à deux jours sur toutes les comparaisons de période :
 *
 *  - **Le jour du lecteur** — « aujourd'hui », « il y a 30 jours ». Il dépend
 *    du fuseau du navigateur. C'est `todayIso` et `isoDay`.
 *  - **La borne d'un filtre** — une chaîne `YYYY-MM-DD` déjà posée, qu'il faut
 *    décaler ou comparer. Elle n'a plus de fuseau : c'est une étiquette.
 *    C'est `shiftIso` et `dayNumber`.
 *
 * Le piège est de mélanger les deux, comme le faisait `previousPeriod` :
 * elle interprétait la borne en heure locale (`new Date('2026-08-01T00:00:00')`)
 * puis la réécrivait en UTC (`toISOString()`). À Paris, minuit local est la
 * veille en UTC, donc chaque borne reculait d'un jour. Ici, tout le calcul sur
 * les étiquettes reste en UTC de bout en bout, et le fuseau n'intervient qu'au
 * moment de demander quel jour il est pour l'utilisateur.
 */

const DAY_MS = 86_400_000;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Étiquette `YYYY-MM-DD` → nombre de jours depuis l'époque.
 *
 * `null` si la chaîne n'est pas une date exploitable — un champ vide, une
 * saisie partielle pendant que l'utilisateur tape dans l'`input[type=date]`.
 */
export function dayNumber(iso: string): number | null {
  const m = ISO_DAY.exec((iso ?? '').trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(t)) return null;
  // Date.UTC accepte 2026-02-31 et le reporte au 3 mars. On refuse : une
  // borne inventée passerait inaperçue jusqu'au graphique.
  const back = new Date(t).toISOString().slice(0, 10);
  return back === m[0] ? Math.round(t / DAY_MS) : null;
}

/** Retour de `dayNumber` vers l'étiquette. */
export function dayIso(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Décale une borne de `days` jours. Chaîne vide si la borne est illisible,
 * pour que l'appelant reste sur le cas « pas de borne » sans distinction.
 */
export function shiftIso(iso: string, days: number): string {
  const n = dayNumber(iso);
  return n == null ? '' : dayIso(n + days);
}

/** Nombre de jours d'une plage **bornes comprises**, comme `applyPeriod`. */
export function spanInDays(from: string, to: string): number | null {
  const start = dayNumber(from);
  const end = dayNumber(to);
  if (start == null || end == null || end < start) return null;
  return end - start + 1;
}

/**
 * `YYYY-MM-DD` **dans le fuseau local**, jamais en UTC.
 *
 * C'est la seule fonction du module qui regarde le fuseau, et c'est voulu :
 * « aujourd'hui » est une notion locale. Passer par `toISOString` sans le
 * décalage ferait basculer la borne d'un jour tous les soirs à Paris.
 */
export function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Le jour courant du lecteur, en étiquette. */
export function todayIso(now: Date = new Date()): string {
  return isoDay(now);
}
