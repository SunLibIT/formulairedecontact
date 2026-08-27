/**
 * Fusion de demandes répétées d'une même personne.
 *
 * Le principe tient en une phrase : **on complète, on n'écrase jamais**. La
 * demande la plus récente est conservée telle quelle et reçoit seulement les
 * champs qu'elle laisse vides et qu'une demande antérieure avait renseignés —
 * un téléphone, une raison sociale, une ville. Les autres passent en
 * « Archivé » et sortent des listes sans rien perdre : leurs valeurs restent
 * dans Airtable, consultables et réversibles.
 *
 * Ce qui n'est **jamais** repris : le statut et la priorité. Ce sont des
 * décisions commerciales portées par la demande la plus récente, et sur 19 des
 * 37 groupes réels ces décisions se contredisent d'une demande à l'autre. Les
 * reprendre reviendrait à laisser un « Hors Critères » de juillet écraser un
 * « Qualifié » d'août.
 *
 * Aucune suppression : tout se fait en `PATCH`, donc le proxy garde ses deux
 * seules méthodes et l'opération reste rattrapable.
 */
import { normaliseEmail } from './marketingExport';
import type { Lead, LeadSource } from './records';
import { CONTACT, LEAD } from './schema';

/** Un champ complété par la fusion, tel qu'on l'annonce à l'utilisateur. */
export interface FilledField {
  /** Libellé lisible, celui de l'interface. */
  label: string;
  /** Identifiant de champ Airtable, propre à la table de la demande. */
  fieldId: string;
  /** Valeur reprise, telle qu'elle sera écrite. */
  value: string | string[];
  /** Version affichable de la valeur. */
  display: string;
  /** Date de la demande d'où elle vient, pour que la reprise soit traçable. */
  from: string;
}

export interface MergePlan {
  /** Demande conservée : la plus récente du groupe. */
  target: Lead;
  /** Demandes qui passeront en « Archivé ». */
  sources: Lead[];
  /** Champs vides de la cible que la fusion va renseigner. */
  filled: FilledField[];
  /**
   * La demande conservée telle qu'elle sera **après** écriture.
   *
   * Permet à l'interface de se corriger en mémoire sans recharger les 440
   * lignes de la table. C'est le plan lui-même qui la produit, donc elle ne
   * peut pas décrire un résultat différent de celui écrit.
   */
  merged: Lead;
  /**
   * Vrai quand la cible n'a rien à recevoir. La fusion consiste alors
   * seulement à archiver les doublons — ce qui reste utile, et il faut le dire
   * plutôt que de laisser croire à un transfert de données.
   */
  archiveOnly: boolean;
}

/**
 * Champs repris, dans l'ordre où ils comptent pour un commercial.
 *
 * Statut, priorité, email et date en sont volontairement absents : les deux
 * premiers sont des décisions, les deux suivants l'identité même de la
 * demande.
 *
 * `read` sort une chaîne ou un tableau d'identifiants ; une valeur vide ou un
 * tableau vide signifie « non renseigné », donc à compléter.
 */
interface Mergeable {
  label: string;
  field: (source: LeadSource) => string;
  read: (lead: Lead) => string | string[];
  /**
   * Reporte la valeur du donneur sur une copie de la cible.
   *
   * Sert à produire `plan.merged`, c'est-à-dire l'état exact que l'écran doit
   * afficher après l'écriture. Déclaré à côté de `read` pour que les deux ne
   * puissent pas désigner deux champs différents.
   */
  assign: (target: Lead, donor: Lead) => Lead;
}

const MERGEABLE: readonly Mergeable[] = [
  {
    label: 'Téléphone',
    field: (s) => (s === 'contact' ? CONTACT.phone : LEAD.phone),
    read: (l) => l.phone.trim(),
    assign: (t, d) => ({ ...t, phone: d.phone }),
  },
  {
    label: 'Société',
    // La table du simulateur n'a pas de raison sociale ; le champ est filtré
    // en amont par `fieldFor`, qui renvoie une chaîne vide.
    field: (s) => (s === 'contact' ? CONTACT.company : ''),
    read: (l) => l.company.trim(),
    assign: (t, d) => ({ ...t, company: d.company }),
  },
  {
    label: 'Adresse',
    field: (s) => (s === 'contact' ? CONTACT.address : LEAD.address),
    read: (l) => l.address.line1.trim(),
    assign: (t, d) => ({ ...t, address: { ...t.address, line1: d.address.line1 } }),
  },
  {
    label: 'Ville',
    field: (s) => (s === 'contact' ? CONTACT.city : LEAD.city),
    read: (l) => l.address.city.trim(),
    assign: (t, d) => ({ ...t, address: { ...t.address, city: d.address.city } }),
  },
  {
    label: 'Code postal',
    field: (s) => (s === 'contact' ? CONTACT.postalCode : LEAD.postalCode),
    read: (l) => l.address.postalCode.trim(),
    assign: (t, d) => ({
      ...t,
      address: { ...t.address, postalCode: d.address.postalCode, department: d.address.department },
    }),
  },
  {
    label: 'Partenaire',
    field: (s) => (s === 'contact' ? CONTACT.partner : LEAD.partner),
    read: (l) => l.partner.trim(),
    assign: (t, d) => ({ ...t, partner: d.partner }),
  },
  {
    label: 'Assigné à',
    field: (s) => (s === 'contact' ? CONTACT.assignee : LEAD.assignee),
    read: (l) => l.assigneeIds,
    assign: (t, d) => ({ ...t, assigneeIds: d.assigneeIds, assigneeNames: d.assigneeNames }),
  },
  {
    label: 'Notes',
    field: (s) => (s === 'contact' ? CONTACT.notes : LEAD.notes),
    read: (l) => l.notes.trim(),
    assign: (t, d) => ({ ...t, notes: d.notes }),
  },
];

const isEmpty = (v: string | string[]): boolean =>
  Array.isArray(v) ? v.length === 0 : v === '';

/** Date lisible, pour dire d'où vient une valeur reprise. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';
}

/**
 * Prépare la fusion d'un groupe de demandes.
 *
 * Le groupe est supposé porter la même adresse email ; la fonction le vérifie
 * et renvoie `null` s'il est hétérogène ou trop court, plutôt que de fusionner
 * deux personnes différentes. C'est le seul garde-fou qui compte ici : tout le
 * reste est réversible, une fusion entre deux inconnus ne l'est pas
 * vraiment — on ne saurait plus quelle valeur venait de qui.
 */
export function planMerge(group: Lead[]): MergePlan | null {
  if (group.length < 2) return null;

  const emails = new Set(group.map((l) => normaliseEmail(l.email)));
  if (emails.size !== 1 || emails.has('')) return null;
  if (new Set(group.map((l) => l.source)).size !== 1) return null;

  // Plus récente d'abord : c'est la cible, et l'ordre sert ensuite à choisir
  // la valeur la moins ancienne parmi celles qui existent.
  const ordered = [...group].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const [target, ...sources] = ordered;

  const filled: FilledField[] = [];
  // Construit en même temps que le plan : l'état d'après-écriture ne peut donc
  // pas décrire autre chose que ce que l'écriture va faire.
  let merged = target;

  for (const field of MERGEABLE) {
    const fieldId = field.field(target.source);
    if (!fieldId) continue; // champ absent de cette table
    if (!isEmpty(field.read(target))) continue; // déjà renseigné : on n'écrase pas

    const donor = sources.find((s) => !isEmpty(field.read(s)));
    if (!donor) continue;

    const value = field.read(donor);
    filled.push({
      label: field.label,
      fieldId,
      value,
      display: Array.isArray(value)
        ? donor.assigneeNames.join(', ') || `${value.length} lien(s)`
        : value,
      from: shortDate(donor.date),
    });
    merged = field.assign(merged, donor);
  }

  return { target, sources, filled, merged, archiveOnly: filled.length === 0 };
}

/** Champs à écrire sur la demande conservée. Vide si elle n'a rien à recevoir. */
export function mergeFields(plan: MergePlan): Record<string, unknown> {
  return Object.fromEntries(plan.filled.map((f) => [f.fieldId, f.value]));
}
