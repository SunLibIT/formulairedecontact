/**
 * Contrôle de cohérence entre la table RH et la sectorisation commerciale.
 *
 * Les deux tables se répondent — la sectorisation pointe des fiches RH par un
 * champ de liaison — mais **rien ne vérifie ce qu'elles se disent**. Ce module
 * pose les questions qu'aucune des deux ne pose toute seule.
 *
 * L'enjeu n'est pas cosmétique : assigner une demande déclenche une
 * automatisation Airtable qui envoie un mail au commercial. Le champ « À » est
 * alimenté par l'adresse de sa fiche RH. Une fiche sans adresse, ou avec une
 * adresse fautive, ne fait pas échouer l'assignation — elle fait disparaître
 * le mail, sans erreur nulle part. C'est le pire mode de panne possible :
 * l'écran dit que c'est fait, le commercial n'a rien reçu.
 *
 * Aucune écriture : on signale, on ne corrige pas. Les fiches se corrigent
 * dans Airtable, où l'on voit le reste du dossier.
 */
import type { StaffMember } from './records';
import type { CoverageIndex } from './territories';

export type AnomalyKind =
  | 'no-email'
  | 'odd-domain'
  | 'duplicate-name'
  | 'sales-without-sector'
  | 'inactive-with-sector';

export interface Anomaly {
  kind: AnomalyKind;
  /** Personne concernée, telle qu'on la reconnaît dans la table. */
  who: string;
  /** Ce qui cloche, en une phrase. */
  detail: string;
  /**
   * Vrai quand l'anomalie casse l'envoi du mail d'assignation.
   *
   * Sépare ce qui doit être corrigé de ce qui mérite seulement un coup d'œil :
   * un commercial sans secteur reste joignable, une fiche sans adresse non.
   */
  blocking: boolean;
  staffIds: string[];
}

/** Domaine attendu, déduit des fiches plutôt que codé en dur. */
function dominantDomain(staff: StaffMember[]): string {
  const counts = new Map<string, number>();
  for (const s of staff) {
    const domain = s.email.trim().toLowerCase().split('@')[1];
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [domain, n] of counts) {
    if (n > bestCount) {
      best = domain;
      bestCount = n;
    }
  }
  // Sous trois fiches, « majoritaire » ne veut rien dire : on préfère ne rien
  // signaler que de traiter une base de test comme une anomalie.
  return bestCount >= 3 ? best : '';
}

/** Nom réduit à ce qui identifie une personne : casse et accents ignorés. */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Confronte RH et sectorisation.
 *
 * `coverage` porte les départements couverts par chaque fiche : sa présence
 * dans l'index est ce qui définit « sectorisé », et c'est ce même index qui
 * ordonne la liste d'assignation. Une seule définition, donc l'écran de
 * contrôle et la liste ne peuvent pas se contredire.
 *
 * Les anomalies bloquantes sortent en premier ; à gravité égale, l'ordre est
 * celui du nom, pour que la liste ne saute pas d'un chargement à l'autre.
 */
export function auditStaff(staff: StaffMember[], coverage: CoverageIndex): Anomaly[] {
  const found: Anomaly[] = [];
  const domain = dominantDomain(staff);
  const active = staff.filter((s) => s.active);

  for (const s of active) {
    const email = s.email.trim().toLowerCase();
    const sectorised = (coverage.get(s.id)?.length ?? 0) > 0;

    if (!email) {
      found.push({
        kind: 'no-email',
        who: s.name,
        detail: sectorised
          ? "aucune adresse email, alors que cette personne couvre un secteur : le mail d'assignation ne partira pas"
          : "aucune adresse email : le mail d'assignation ne partira pas",
        blocking: true,
        staffIds: [s.id],
      });
    } else if (domain && !email.endsWith(`@${domain}`)) {
      found.push({
        kind: 'odd-domain',
        who: s.name,
        detail: `${s.email} — domaine inhabituel, les autres fiches sont en @${domain}`,
        blocking: true,
        staffIds: [s.id],
      });
    }

    // Un commercial sans secteur n'est pas une erreur en soi — il vient
    // d'arriver, ou il travaille en binôme. C'est une question à poser, pas un
    // défaut à corriger, d'où `blocking: false`.
    if (!sectorised && s.group.trim().toLowerCase() === 'commercial') {
      found.push({
        kind: 'sales-without-sector',
        who: s.name,
        detail: 'commercial absent de la sectorisation : aucun département ne lui renvoie',
        blocking: false,
        staffIds: [s.id],
      });
    }
  }

  // Une fiche désactivée qui couvre encore un secteur continue d'être proposée
  // par la sectorisation alors qu'elle a quitté la liste d'assignation.
  for (const s of staff) {
    if (s.active) continue;
    if ((coverage.get(s.id)?.length ?? 0) === 0) continue;
    found.push({
      kind: 'inactive-with-sector',
      who: s.name,
      detail: 'fiche inactive mais toujours rattachée à des départements',
      blocking: true,
      staffIds: [s.id],
    });
  }

  // Doublons de fiche : deux lignes pour la même personne. Repérés sur le
  // **nom** et non sur l'email, parce que le cas réel est précisément celui de
  // deux adresses différentes dont une est fautive — les comparer n'aurait
  // rien trouvé.
  const byName = new Map<string, StaffMember[]>();
  for (const s of staff) {
    const key = nameKey(s.name);
    if (!key) continue;
    const group = byName.get(key);
    if (group) group.push(s);
    else byName.set(key, [s]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    found.push({
      kind: 'duplicate-name',
      who: group[0].name,
      detail: `${group.length} fiches RH pour cette personne (${group
        .map((s) => s.email.trim() || 'sans email')
        .join(', ')})`,
      blocking: false,
      staffIds: group.map((s) => s.id),
    });
  }

  const collator = new Intl.Collator('fr');
  return found.sort(
    (a, b) => Number(b.blocking) - Number(a.blocking) || collator.compare(a.who, b.who),
  );
}
