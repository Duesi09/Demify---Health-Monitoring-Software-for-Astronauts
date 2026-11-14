import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // Same `@/` shortcut as tsconfig.json, so tests can load server code.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next resolves this marker of server-only modules itself; outside Next it is an empty module.
      'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)),
    },
  },
  // Local worktrees hold copies of the project; their tests are not ours to run.
  // The end-to-end tests under e2e/ belong to Playwright (`npm run e2e`).
  test: { exclude: [...configDefaults.exclude, '.claude/**', 'e2e/**'] },
})
