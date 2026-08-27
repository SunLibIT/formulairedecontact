import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environnement Node par défaut : les tests de logique pure (formatage,
    // tri, motifs) n'ont pas besoin de DOM et restent instantanés. Les
    // fichiers qui en ont besoin le déclarent eux-mêmes, par une annotation
    // `@vitest-environment jsdom` en tête de fichier — plus stable que la
    // configuration globale, qui a changé de forme entre versions.
    environment: 'node',

    // Fuseau épinglé. Plusieurs calculs de dates ne sont justes qu'en tenant
    // compte du décalage local — c'est un mélange local/UTC qui décalait la
    // comparaison de période d'un jour. Sans ce réglage, ces tests passent sur
    // une machine en UTC et le bug repart en production, où le lecteur est à
    // Paris. Le poser ici plutôt qu'en tête de fichier : les `import` ESM sont
    // hissés au-dessus d'un `process.env.TZ = …`, qui arriverait trop tard.
    env: { TZ: 'Europe/Paris' },

    // Nécessaire au nettoyage automatique de testing-library : la
    // bibliothèque enregistre son `afterEach` sur les hooks globaux. Sans
    // cela, les rendus s'accumulent d'un test au suivant et les requêtes
    // trouvent plusieurs éléments au lieu d'un.
    globals: true,
  },
});
