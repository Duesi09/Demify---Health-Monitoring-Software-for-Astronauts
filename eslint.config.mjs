import { registerHooks } from 'node:module'
import { defineConfig, globalIgnores } from 'eslint/config'

// The project compiles with TypeScript 7, which no longer ships the compiler API
// that typescript-eslint parses with. The TypeScript team publishes the 6.0 API as
// `@typescript/typescript6` for exactly this case, so the linter (and only the
// linter) is pointed at it. Remove this hook and that dev dependency once
// typescript-eslint supports TypeScript 7 (typescript-eslint issue 10940).
// `registerHooks` needs Node.js 22.15 or later.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromLinter = /[\\/](typescript-eslint|@typescript-eslint|ts-api-utils)[\\/]/.test(context.parentURL ?? '')
    return nextResolve(specifier === 'typescript' && fromLinter ? '@typescript/typescript6' : specifier, context)
  },
})

// Loaded after the hook is in place; a static import would run before it.
const { default: nextVitals } = await import('eslint-config-next/core-web-vitals')
const { default: nextTs } = await import('eslint-config-next/typescript')

// eslint-config-next registers the accessibility plugin but switches on only six
// of its rules. A health monitor is used under stress, so the full recommended set applies.
const a11y = nextVitals.find((config) => config.plugins?.['jsx-a11y']).plugins['jsx-a11y']

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: 'demify/accessibility',
    files: ['**/*.{jsx,tsx}'],
    rules: {
      ...a11y.flatConfigs.recommended.rules,
      // Option cards wrap their text two elements deep; the default search stops one level short.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
      // A scrolling region must take focus, or the keyboard cannot scroll it (WCAG 2.1.1).
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'] }],
    },
  },
  {
    name: 'demify/config-files',
    files: ['*.config.{js,mjs,ts}'],
    rules: {
      // Tools read their configuration from a bare default export.
      'import/no-anonymous-default-export': 'off',
    },
  },
  {
    name: 'demify/e2e',
    files: ['e2e/**', 'playwright.config.ts'],
    rules: {
      // Playwright fixtures take a callback named `use`; it is not the React hook.
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Test output, and local worktrees that hold copies of the project.
    'playwright-report/**',
    'test-results/**',
    '.claude/**',
  ]),
])
