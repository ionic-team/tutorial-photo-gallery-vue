import js from '@eslint/js';
import ionic from '@ionic/eslint-config/recommended.js';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  ...defineConfigWithVueTs(
    {
      ignores: ['dist/**', 'android/**', 'ios/**'],
    },
    js.configs.recommended,
    pluginVue.configs['flat/essential'],
    vueTsConfigs.recommended,
  ),
  // Kept outside defineConfigWithVueTs: it treats `consistent-type-imports` as
  // type-aware and would turn on project-based parsing for every .ts file.
  ...ionic,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'vue/no-deprecated-slot-attribute': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Ionic's base level; `recommended` makes it an error, which is meant for libraries.
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      // The tutorial intentionally asserts non-null on Capacitor `Photo` fields
      // (`photo.path!`, `photo.webPath!`) that are guaranteed present for the
      // configured `resultType`/platform. Keep the taught code as-is.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['tests/unit/**/*.spec.{js,ts}'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.mocha,
        cy: 'readonly',
        Cypress: 'readonly',
      },
    },
  },
];
