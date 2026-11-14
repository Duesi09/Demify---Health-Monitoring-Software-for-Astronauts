import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // Same `@/` shortcut as tsconfig.json, so tests can load server code.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Local worktrees hold copies of the project; their tests are not ours to run.
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
})
