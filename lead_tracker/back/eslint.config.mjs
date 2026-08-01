// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'dist', 'node_modules'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    plugins: { import: importPlugin },
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'prettier/prettier': ['error', { endOfLine: 'auto', singleQuote: true, semi: true, trailingComma: 'all' }],

      // ── Frontières d'architecture (cf. CLAUDE.md) ──────────────────────
      // Le domaine ne dépend jamais de l'infra : infra → core, jamais l'inverse.
      'import/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: './src/core',
              from: './src/infra',
              message: 'core/ (domaine) ne dépend pas de infra/. Le flux va infra → core, jamais l’inverse.',
            },
          ],
        },
      ],
      // Code partagé via l'alias `shared/...`, jamais en relatif.
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
    },
  },
);
