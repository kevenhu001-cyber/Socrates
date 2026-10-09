// frontend/eslint.config.mjs
// Incremental ESLint rollout (audit action #1): `npm run lint:eslint`
// reports the backlog without blocking CI. `npm run lint` is still the
// merge gate (tsc --noEmit); rules here that are 'warn' flip to 'error'
// as their backlog is burned down.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';

/* Bare identifiers the legacy (pre-React) modules share through the
   global scope — declared in one script, read from the others by load
   order. Listing them keeps no-undef at error strength without
   hundreds of false positives. */
const READONLY_GLOBALS = [
  'state', 't', 'tutorSocratic', 'mermaid', 'hljs', '_currentLang',
  'resetState', '_activeChatCtl', '_activeChatAbort',
  'renderMathInElement', 'scrollToBottomIfPinned', 'syncAppModeUI',
  'setLang', 'openNav', 'openProjects', 'LAST_ACTIVE_ID_KEY',
  'setCurrentSessionId', 'Fuse',
];
/* Mutable cross-file state is no longer shared through the global scope:
   the Cmd-K index and exam autosave timers are module-private and are
   reset through the `resetCmdKSearchState()` / `resetExamSaveState()`
   exports. Declaring them as globals here would only mask the next
   module that reaches for a name it does not own. */
const LEGACY_SHARED_GLOBALS = {
  ...Object.fromEntries(READONLY_GLOBALS.map((name) => [name, 'readonly'])),
};

/* The legacy code already marks intentionally-unused identifiers with a
   leading underscore (callback placeholders, destructuring skips).
   Honor that convention so the backlog reflects real dead code. */
const UNUSED_VARS_OPTIONS = {
  args: 'after-used',
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'wasm/**',
      'playwright-report/**',
      'test-results/**',
      // Vendored third-party bundles (plotly/mermaid/echarts/katex/hljs).
      'src/vendor-files/**',
      // Local, gitignored scratch output: Playwright/esbuild transform
      // caches, repro sandboxes and captured reference sites. Linting them
      // reports hundreds of problems in code nobody owns.
      '.tmp-*/**',
      '.cg-ref/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{js,mjs,ts,tsx}'],
    plugins: { 'unused-imports': unusedImports },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...LEGACY_SHARED_GLOBALS,
      },
    },
    rules: {
      // Burned-down rules: enforced at error strength.
      // Auto-fixable (eslint --fix removes the unused specifiers).
      'unused-imports/no-unused-imports': 'error',
      'no-unused-vars': ['error', UNUSED_VARS_OPTIONS],
      // Backlog rules: report-only until the counts are driven to zero.
      'no-empty': 'warn',
      'no-prototype-builtins': 'warn',
      'no-cond-assign': 'warn',
      'no-async-promise-executor': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-condition': 'warn',
      'no-unreachable': 'warn',
      'no-redeclare': 'warn',
      'no-useless-assignment': 'warn',
      'no-control-regex': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-useless-catch': 'warn',
      'prefer-spread': 'warn',
      'prefer-const': 'warn',
      // Function-size backlog: keep complexity and long functions visible
      // while the legacy chat/session modules are split into smaller units.
      // Flip these to 'error' per-directory as the warning backlog is reduced.
      'complexity': ['warn', 15],
      'max-lines-per-function': ['warn', {
        max: 120,
        skipBlankLines: true,
        skipComments: true,
      }],
      // tseslint.configs.recommended enables the TS variant for ALL files
      // (no files scope) at error severity; JS files use the core rule and
      // the TS override below re-enables it for TS files only.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  {
    // TypeScript files: tsc --noEmit (npm run lint) is authoritative for
    // undefined identifiers and redeclarations; ESLint duplicates them.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', UNUSED_VARS_OPTIONS],
    },
  },
  {
    files: ['src/react/**/*.{ts,tsx,js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Tests and e2e specs run under Node (node:test, Playwright).
    files: ['test/**', 'e2e/**', '*.config.{js,mjs}', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', UNUSED_VARS_OPTIONS],
      // `try { … } catch (_) {}` is the harness idiom for best-effort
      // setup/cleanup (localStorage in a locked-down context, closing an
      // already-closed stream). Other empty blocks are still reported.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Node tooling: build helpers under scripts/, plus the ad-hoc
    // Playwright capture/probe scripts at the package root and under
    // debug/, analysis/, tmp-shots/. They run in Node but pass callbacks
    // to page.evaluate(), so both global sets are legitimately in scope.
    files: [
      'scripts/**/*.{js,mjs}',
      '*.{js,mjs}',
      'debug/**/*.{js,mjs}',
      'analysis/**/*.{js,mjs}',
      'tmp-shots/**/*.{js,mjs}',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', UNUSED_VARS_OPTIONS],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
