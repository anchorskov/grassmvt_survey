import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['public/js/surveyjs-bundle.js', 'public/vendor/**'],
  },
  js.configs.recommended,
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
];