import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environnement Node par défaut : les tests de logique pure (formatage,
    // tri, motifs) n'ont pas besoin de DOM et restent instantanés. Les
    // fichiers qui en ont besoin le déclarent eux-mêmes, par une annotation
    // `@vitest-environment jsdom` en tête de fichier — plus stable que la
    // configuration globale, qui a changé de forme entre versions.
    environment: 'node',

    // Nécessaire au nettoyage automatique de testing-library : la
    // bibliothèque enregistre son `afterEach` sur les hooks globaux. Sans
    // cela, les rendus s'accumulent d'un test au suivant et les requêtes
    // trouvent plusieurs éléments au lieu d'un.
    globals: true,
  },
});
