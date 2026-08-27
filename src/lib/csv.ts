/**
 * Sérialisation CSV et téléchargement.
 *
 * Extrait de `marketingExport.ts` parce que l'export KPI a exactement les mêmes
 * contraintes de tableur — séparateur, encodage, neutralisation des formules —
 * et qu'en dupliquer une seule ferait diverger les deux fichiers.
 *
 * Ce module ne sait rien du métier : il reçoit un tableau de chaînes et rend du
 * texte. Ce sont les modules d'export qui décident des colonnes.
 */

/** Séparateur point-virgule : c'est celui qu'attend Excel en locale française. */
const DELIMITER = ';';

/** Marque d'ordre des octets, écrite en tête de fichier. Voir `toCsv`. */
const BOM = '﻿';

export interface Table {
  headers: string[];
  rows: string[][];
}

/**
 * Neutralise une cellule que le tableur pourrait exécuter.
 *
 * Les données viennent d'un formulaire public : un visiteur peut saisir
 * `=HYPERLINK(...)` dans un champ nom, et Excel l'évaluerait à l'ouverture.
 * Le préfixe apostrophe force l'interprétation en texte.
 *
 * On ne neutralise **pas** les valeurs purement numériques, alors qu'elles
 * commencent parfois par `+` ou `-` : un `+33612345678` n'est pas exécutable,
 * et le préfixer produirait exactement l'apostrophe parasite que `formatPhone`
 * doit aujourd'hui nettoyer à l'import. La règle est donc : caractère de tête
 * dangereux **et** contenu non numérique.
 */
function sanitiseCell(value: string): string {
  if (!value) return '';
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  if (/^[+-]?[\d\s().+-]+$/.test(value)) return value;
  return `'${value}`;
}

/** Entoure de guillemets uniquement quand c'est nécessaire, et double les guillemets. */
function quote(value: string): string {
  if (!/[";\r\n]/.test(value) && value === value.trim()) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Sérialise un tableau en CSV.
 *
 * Fins de ligne CRLF conformes à la RFC 4180, et **BOM UTF-8** en tête : sans
 * lui, Excel sous Windows lit le fichier en ANSI et rend « Sébastien » en
 * « SÃ©bastien ». Le BOM est le seul moyen fiable de l'éviter sans passer par
 * l'assistant d'importation.
 */
export function toCsv({ headers, rows }: Table): string {
  const line = (cells: string[]) =>
    cells.map((c) => quote(sanitiseCell(c))).join(DELIMITER);

  return `${BOM}${[headers, ...rows].map(line).join('\r\n')}\r\n`;
}

/**
 * Nombre au format français, pour qu'Excel le lise comme un nombre.
 *
 * La virgule décimale n'est pas cosmétique : en locale française, `42.5`
 * arrive dans la cellule comme du **texte**, donc ni sommable ni triable.
 * Les entiers ressortent sans décimale inutile.
 */
export function frNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(decimals).replace('.', ',');
}

/** Part en pourcentage, ou chaîne vide si elle n'a pas de sens. */
export function frPercent(part: number | null | undefined): string {
  return part == null || !Number.isFinite(part) ? '' : frNumber(part * 100);
}

/**
 * Déclenche le téléchargement du fichier.
 *
 * Seule fonction du module à toucher le DOM, et le seul endroit à adapter si
 * l'export devait un jour passer par le serveur.
 *
 * L'application tourne dans un iframe tiers Softr : le téléchargement suppose
 * que l'iframe autorise `allow-downloads`. Si ce n'est pas le cas le navigateur
 * bloque silencieusement, sans exception à intercepter — l'appelant ne peut
 * donc pas distinguer ce cas d'un succès, et c'est pourquoi l'interface annonce
 * le nombre de lignes exportées : voir le compte confirme au moins que le
 * fichier a été produit.
 */
export function downloadCsv(filename: string, csv: string): boolean {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    // Révocation différée : Safari annule un téléchargement encore en vol si
    // l'URL disparaît dans la même tâche que le clic.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** Horodatage `2026-08-27` pour nommer un fichier. */
export function stamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
