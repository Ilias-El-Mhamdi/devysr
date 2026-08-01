import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    plugins: { react, import: importPlugin },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: { project: './tsconfig.app.json' },
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/jsx-no-useless-fragment': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],

      // ── Frontières d'architecture (cf. CLAUDE.md) ──────────────────────
      // Importe le code partagé via l'alias `shared/...`, jamais en relatif.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**/shared/*', '../**/shared/**'],
              message: 'Importe le code partagé via l’alias `shared/...`, pas en chemin relatif.',
            },
          ],
        },
      ],
      // Zones de couches : résolues sur le fichier réel (robuste aux relatifs).
      'import/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            // Data layer ne remonte jamais vers l'UI.
            { target: './src/api', from: './src/pages', message: 'api/ ne dépend pas des pages (flux UI → api, jamais l’inverse).' },
            { target: './src/api', from: './src/components', message: 'api/ ne dépend pas des components (flux UI → api, jamais l’inverse).' },
            // Une page n'importe pas d'une autre page (duplique, ou remonte le partagé dans components/).
            // Ajouter une paire de zones ici par nouvelle page (dashboard/zone/distributeur/lead), cf. CLAUDE.md § Frontend Architecture.
          ],
        },
      ],
    },
  },
]);
