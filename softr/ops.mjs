/**
 * Opérations search/replace pour livrer une nouvelle version du bloc sans
 * renvoyer les 240 Ko : diff jeton par jeton entre l'ancien et le nouveau
 * `Block.tsx`, regroupé en blocs, chaque `search` rendu unique par du contexte.
 *
 *   node softr/ops.mjs <ancien Block.tsx> [nouveau Block.tsx]  →  softr/dist/ops.json
 *
 * Vérifie en rejouant les opérations sur l'ancien que le résultat est
 * exactement le nouveau. À passer à `vibe_coding_block_update_code_search_replace`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const ancien = readFileSync(process.argv[2], 'utf8');
const nouveau = readFileSync(process.argv[3] ?? join(ici, 'dist/Block.tsx'), 'utf8');

// Jetons : lignes, et pour les très longues lignes (feuille CSS), règles CSS.
const jetons = (s) => s.split(/(?<=\n)/).flatMap((l) => (l.length > 400 ? l.split(/(?<=\})/) : [l]));
const a = jetons(ancien);
const b = jetons(nouveau);

// Plus longue sous-suite commune, en ignorant préfixe et suffixe communs.
let debut = 0;
while (debut < a.length && debut < b.length && a[debut] === b[debut]) debut++;
let finA = a.length;
let finB = b.length;
while (finA > debut && finB > debut && a[finA - 1] === b[finB - 1]) {
  finA--;
  finB--;
}
const A = a.slice(debut, finA);
const B = b.slice(debut, finB);
const n = A.length;
const m = B.length;
if (n * m > 4e7) throw new Error(`Diff trop large (${n} x ${m}) : livrer par lots.`);
const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);

// Blocs de changements, en positions dans `a` / `b`.
const blocs = [];
let i = 0;
let j = 0;
let cur = null;
while (i < n || j < m) {
  if (i < n && j < m && A[i] === B[j]) {
    if (cur) {
      blocs.push(cur);
      cur = null;
    }
    i++;
    j++;
  } else {
    cur ??= { a0: debut + i, a1: debut + i, b0: debut + j, b1: debut + j };
    if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) {
      j++;
      cur.b1 = debut + j;
    } else {
      i++;
      cur.a1 = debut + i;
    }
  }
}
if (cur) blocs.push(cur);

const texte = (arr, x, y) => arr.slice(x, y).join('');
const ops = [];
for (const bl of blocs) {
  // Contexte autour jusqu'à ce que le `search` soit unique dans l'ancien.
  let avant = 1;
  let apres = 0;
  for (;;) {
    const s = texte(a, bl.a0 - avant, bl.a1 + apres);
    const premiere = ancien.indexOf(s);
    if (s && premiere !== -1 && ancien.indexOf(s, premiere + 1) === -1) break;
    if (avant <= apres) avant++;
    else apres++;
  }
  ops.push({
    search: texte(a, bl.a0 - avant, bl.a1 + apres),
    replace: texte(a, bl.a0 - avant, bl.a0) + texte(b, bl.b0, bl.b1) + texte(a, bl.a1, bl.a1 + apres),
  });
}

// Rejeu de contrôle.
let rejoue = ancien;
for (const op of ops) {
  const k = rejoue.indexOf(op.search);
  if (k === -1) throw new Error('Opération introuvable au rejeu');
  rejoue = rejoue.slice(0, k) + op.replace + rejoue.slice(k + op.search.length);
}
if (rejoue !== nouveau) throw new Error('Le rejeu ne redonne pas le nouveau fichier');
writeFileSync(join(ici, 'dist/ops.json'), JSON.stringify(ops, null, 1), 'utf8');
console.log(`${ops.length} opérations, ${ops.reduce((t, o) => t + o.search.length + o.replace.length, 0)} caractères`);
