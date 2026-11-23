/**
 * Build du bloc Softr « Suivi des demandes » (CRM 3).
 *
 *   npm run softr:build   →  softr/dist/Block.tsx (le fichier livré à Softr)
 *
 * 1. Compile la feuille Tailwind de l'app (mêmes tokens, même config) en la
 *    limitant au bloc : utilitaires préfixés par `.sdc-root` (ils passent
 *    devant ceux que Softr génère pour son propre thème), variables posées sur
 *    `.sdc-root` au lieu de `:root`. Le bloc vit dans un Shadow DOM : le reset
 *    de Tailwind (`html, :host`) n'en sort pas.
 * 2. Regroupe `softr/Block.tsx` et tout `src/` en un seul fichier, JSX gardé
 *    tel quel (Softr le compile), en remplaçant trois modules :
 *    `lib/airtable` → `softr/pont`, `hooks/useAdminAuth` et `hooks/useViewer`
 *    → `softr/droits`. Restent importés de Softr : react, lucide-react,
 *    @tanstack/react-virtual, @/lib/datasource, @/lib/user.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import autoprefixer from 'autoprefixer';
import esbuild from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import ts from 'typescript';
import baseConfig from '../tailwind.config.js';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, '..');
const sortie = join(ici, 'dist');
mkdirSync(sortie, { recursive: true });

/* ------------------------------------------------------------------- CSS */

/**
 * Neutralise ce que la feuille de base de Softr (Tailwind 4, `@layer base`)
 * impose dans le bloc et que la page Vercel n'avait pas — relevé dans
 * l'aperçu le 23/11/2026 : `p { white-space: pre-line }` (les textes écrits
 * sur plusieurs lignes dans le code y passaient à la ligne), titres dans la
 * police « heading » du thème, graisse 500 héritée de la page. Sélecteurs en
 * (0,1,1) : les utilitaires (`.sdc-root .x`, 0,2,0) gardent la main.
 */
const RESET_SOFTR = `
.sdc-root { font-weight: 400; }
.sdc-root p { white-space: normal; }
.sdc-root h1, .sdc-root h2, .sdc-root h3, .sdc-root h4 { font-family: inherit; }
`;

const source = readFileSync(join(racine, 'src/index.css'), 'utf8')
  // Les variables de la charte vivent sur la racine du bloc.
  .replace(/:root\s*\{/g, '.sdc-root {')
  // `body` devient la racine du bloc.
  .replace(/\nbody\s*\{\s*margin:\s*0;/, '\n.sdc-root {')
  .replace('@tailwind components;', `${RESET_SOFTR}\n@tailwind components;`);

/**
 * Les règles propres à l'app (`.lead-message`, `.modal-panel`, `:focus-visible`…)
 * passent sous `.sdc-root` : les utilitaires y étant aussi (`important`), elles
 * gardent sur eux la priorité qu'elles avaient sur Vercel, où elles venaient
 * après eux à spécificité égale. `html` n'existe pas dans le bloc.
 */
const portee = {
  postcssPlugin: 'portee-sdc',
  Rule(rule) {
    if (rule.parent?.type === 'atrule' && /keyframes|layer/.test(rule.parent.name)) return;
    if (rule.selector.trim() === 'html') {
      rule.remove();
      return;
    }
    if (rule.selector.includes('.sdc-root')) return;
    rule.selectors = rule.selectors.map((s) => `.sdc-root ${s}`);
  },
};

const configBloc = {
  ...baseConfig,
  content: [join(racine, 'src/**/*.{ts,tsx}'), join(ici, '*.{ts,tsx}')],
  important: '.sdc-root',
};

const sourcePortee = (await postcss([portee]).process(source, { from: undefined })).css;

const { css: cssBrut } = await postcss([tailwindcss(configBloc), autoprefixer]).process(sourcePortee, {
  from: join(racine, 'src/index.css'),
});
const { code: css } = await esbuild.transform(cssBrut, { loader: 'css', minify: true });

/* ---------------------------------------------------------------- bundle */

const REMPLACEMENTS = [
  [/[\\/]src[\\/]lib[\\/]airtable(\.ts)?$/, join(ici, 'pont.ts')],
  [/[\\/]src[\\/]hooks[\\/]useAdminAuth(\.ts)?$/, join(ici, 'droits.ts')],
  [/[\\/]src[\\/]hooks[\\/]useViewer(\.ts)?$/, join(ici, 'droits.ts')],
];

const remplacer = {
  name: 'remplacer-modules',
  setup(build) {
    // La feuille compilée, en module à part : elle forme sa propre section du
    // fichier livré, donc son propre lot.
    build.onResolve({ filter: /^virtual:css-app$/ }, () => ({ path: 'css-app', namespace: 'css' }));
    build.onLoad({ filter: /.*/, namespace: 'css' }, () => ({
      contents: `export const CSS_APP = ${JSON.stringify(css)};`,
      loader: 'js',
    }));
    build.onResolve({ filter: /^\./ }, (args) => {
      const cible = resolve(args.resolveDir, args.path);
      for (const [motif, vers] of REMPLACEMENTS) {
        if (motif.test(cible) && !args.importer.startsWith(ici)) return { path: vers };
      }
      return undefined;
    });
  },
};

const resultat = await esbuild.build({
  entryPoints: [join(ici, 'Block.tsx')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'preserve',
  charset: 'utf8',
  legalComments: 'none',
  minifyWhitespace: process.argv.includes('--compact'),
  external: ['react', 'react-dom', 'lucide-react', '@tanstack/react-virtual', '@/lib/datasource', '@/lib/user'],
  plugins: [remplacer],
  outfile: join(sortie, 'Block.jsx'),
});

const banniere = `/* Suivi des demandes — bloc Softr du CRM 3. FICHIER GÉNÉRÉ, ne pas modifier dans le Studio :
   source et build dans le dépôt SunLibIT/formulairedecontact (dossier softr/, npm run softr:build). */
`;
// Softr rend le code en LF sans saut de ligne final : on livre la même forme.
// Les commentaires JSX (`{/* … */}`) sont retirés : ils restent dans `src/`,
// et chaque octet livré passe par l'outil de mise en ligne.
// Commentaires retirés par le compilateur TypeScript (JSX gardé tel quel) :
// esbuild en conserve dans les objets et le JSX, et ils doubleraient le poids.
// Les marqueurs de section (`// src/…`), utiles aux lots, sont remis ensuite.
const marques = resultat.outputFiles[0].text.replace(/^\/\/ ((?:src\/|softr\/|css:)[^\n]+)$/gm, 'void "§section §$1";');
const sansCommentaires = ts.transpileModule(marques, {
  fileName: 'Block.jsx',
  compilerOptions: {
    jsx: ts.JsxEmit.Preserve,
    removeComments: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
  },
}).outputText;
// TypeScript indente par 4 : on revient à 2 (le contrôle plus bas vérifie que
// le programme est inchangé, au cas où une chaîne multiligne serait touchée).
const reindente = sansCommentaires.replace(/^(?: {4})+/gm, (m) => ' '.repeat(m.length / 2));
const minifie = async (s) => (await esbuild.transform(s, { loader: 'jsx', jsx: 'transform', minify: true })).code;
if ((await minifie(reindente)) !== (await minifie(sansCommentaires))) {
  throw new Error('La réindentation modifie le programme : à revoir.');
}
const code = (banniere + reindente)
  .replace(/^void "§section §([^"]+)";$/gm, '// $1')
  // Ni caractère invisible ou combinant, ni échappement `\uXXXX` : la mise en
  // ligne décode les `\u` (relevé le 23/11/2026) et un caractère invisible se
  // perd en recopie. Les deux seuls cas du code sont réécrits sans eux.
  .replaceAll('/[̀-ͯ]/g', 'new RegExp("[" + String.fromCharCode(768) + "-" + String.fromCharCode(879) + "]", "g")')
  .replaceAll('"\\uFEFF"', 'String.fromCharCode(65279)')
  .replace(/\r\n/g, '\n')
  .replace(/\n+$/, '');
const restants = [...code.matchAll(/.{0,40}(?:\\u[0-9a-fA-F]{4}|[̀-ͯ ​-‏ ﻿]).{0,40}/g)];
if (restants.length) {
  throw new Error(`Échappement \\u ou caractère invisible restant, à réécrire dans build.mjs :\n${restants.map((m) => m[0]).join('\n')}`);
}
writeFileSync(join(sortie, 'Block.tsx'), code, 'utf8');

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
console.log(`softr/dist/Block.tsx — ${Buffer.byteLength(code, 'utf8')} octets, css ${css.length}, sha256 ${sha(code)}`);

/* ------------------------------------------------------------------ lots */

/**
 * Livraison en lots (`softr/dist/lots/`). Un appel MCP ne porte pas 230 Ko :
 * le premier lot part avec `vibe_coding_block_update_code`, suivi d'un export
 * provisoire (`ATTENTE`) ; chaque lot suivant remplace `ATTENTE` par lui-même
 * + `ATTENTE` (`vibe_coding_block_update_code_search_replace`), le dernier par
 * lui seul. Les coupures tombent entre deux modules : chaque état
 * intermédiaire compile.
 */
export const ATTENTE = '\nexport default function BlocEnAttente() { return null; }';
// Moins de 30 000 caractères par lot : c'est ce qu'un outil peut relire d'un coup.
const TAILLE_LOT = Number(process.env.TAILLE_LOT ?? 20000);
const debuts = [...code.matchAll(/\n\/\/ (?:src\/|softr\/|css:)[^\n]+\n/g)].map((m) => m.index);
const lots = [];
let debut = 0;
for (const i of debuts) {
  if (i - debut >= TAILLE_LOT || (i > debut && code.slice(i, i + 12).startsWith('\n// css:'))) {
    lots.push(code.slice(debut, i));
    debut = i;
  }
}
lots.push(code.slice(debut));
const dossierLots = join(sortie, 'lots');
mkdirSync(dossierLots, { recursive: true });
lots.forEach((l, n) => writeFileSync(join(dossierLots, `${String(n + 1).padStart(2, '0')}.txt`), l, 'utf8'));
writeFileSync(join(dossierLots, 'ATTENTE.txt'), ATTENTE, 'utf8');
if (lots.join('') !== code) throw new Error('Lots incohérents');
console.log(`${lots.length} lots : ${lots.map((l) => l.length).join(', ')}`);
