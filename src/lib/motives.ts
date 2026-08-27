/**
 * Libellés courts des motifs de contact.
 *
 * Les intitulés du formulaire Typeform sont rédigés pour être lus par le
 * visiteur, pas pour tenir sur une carte : « Être contacté(e) par SunLib pour
 * d'autres motifs » fait 48 caractères et se retrouve tronqué, donc illisible.
 * Ce module ne touche pas la donnée — Airtable conserve l'intitulé complet,
 * qui reste affiché dans la fiche de détail.
 *
 * Les clés sont normalisées (minuscules, sans accents, espaces resserrés) pour
 * qu'une retouche de ponctuation ou de casse dans Typeform ne casse pas la
 * correspondance.
 */

/**
 * Minuscules sans accents, espaces resserrés — pour comparer des intitulés.
 *
 * Exporté parce que l'extraction marketing compare les mêmes intitulés pour en
 * déduire un segment : deux normalisations distinctes finiraient par diverger
 * sur un accent ou une apostrophe, et le segment ne correspondrait plus au
 * libellé court affiché pour la même demande.
 */
export function normaliseLabel(label: string): string {
  return (label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Intitulé Typeform normalisé → libellé court. */
const SHORT_LABELS: Record<string, string> = {
  'devenir partenaire installateur sunlib': 'Partenariat installateur',
  "avoir plus d'informations sur l'abonnement sunlib": 'Abonnement',
  "obtenir un devis d'abonnement solaire": 'Devis',
  'etre contacte(e) par sunlib pour d\'autres motifs': 'Autre motif',
  // Intitulés d'anciennes versions du formulaire, conservés pour que les
  // demandes historiques s'affichent aussi court.
  "demande de devis d'abonnement": 'Devis',
  "demande d'information": 'Information',
  'demande de contact': 'Prise de contact',
};

/**
 * Libellé court d'un motif.
 *
 * Repli sur l'intitulé brut si le motif est inconnu : un motif ajouté dans
 * Typeform doit rester lisible sans attendre une mise à jour du code. La carte
 * le tronquera, ce qui est visible — et donc corrigible — contrairement à un
 * champ vide.
 */
export function shortMotive(label: string): string {
  const raw = (label ?? '').trim();
  if (!raw) return '';
  return SHORT_LABELS[normaliseLabel(raw)] ?? raw;
}

/** Vrai si le motif a une abréviation connue — utile pour les tests et l'audit. */
export function hasShortMotive(label: string): boolean {
  return normaliseLabel(label) in SHORT_LABELS;
}

/** Tous les intitulés couverts, pour vérifier la couverture des données. */
export function knownMotives(): string[] {
  return Object.keys(SHORT_LABELS);
}
