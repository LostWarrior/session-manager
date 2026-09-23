import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

// ESLint requires a default export for its flat configuration.
export default tseslint.config(
  {ignores: ['node_modules/**', 'dist/**', '.build/**', 'artifacts/**']},
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {globals: {console: 'readonly', process: 'readonly', URL: 'readonly', structuredClone: 'readonly'}},
  },
  {files: ['scripts/browser-smoke.mjs'], languageOptions: {globals: {document: 'readonly', chrome: 'readonly'}}},
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname},
    },
    plugins: {'@stylistic': stylistic},
    rules: {
      '@stylistic/indent': ['error', 2, {SwitchCase: 1}],
      '@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'error',
      '@typescript-eslint/unified-signatures': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', {allowNumber: true}],
      'no-restricted-syntax': [
        'error',
        {selector: 'ExportDefaultDeclaration', message: 'Use named exports (Google TypeScript guide).'},
        {selector: 'ExportNamedDeclaration > VariableDeclaration[kind!="const"]', message: 'Do not export mutable bindings.'},
        {selector: 'TSEnumDeclaration', message: 'Use a union of literals instead of an enum.'},
      ],
      'no-eval': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
    },
  },
);
