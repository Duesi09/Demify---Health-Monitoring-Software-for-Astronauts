import { rmSync } from 'node:fs'

/** Runs once after all tests: removes the data directory made for this run. */
export default function removeDataDir() {
  const dir = process.env.DEMIFY_E2E_DATA_DIR
  if (dir) rmSync(dir, { recursive: true, force: true })
}
