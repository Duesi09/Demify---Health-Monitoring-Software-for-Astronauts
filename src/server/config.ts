import 'server-only'
import path from 'node:path'

/*
 * Every environment variable the server reads. They are read at run time,
 * never at build time, so one build serves any deployment.
 *
 * | Variable         | Values           | Default  | Meaning                                                        |
 * | ---------------- | ---------------- | -------- | -------------------------------------------------------------- |
 * | DEMIFY_DATA_DIR  | a directory path | ./.data  | Where the readings are kept. Relative paths start at the       |
 * |                  |                  |          | working directory. Created when missing. /data in the image.   |
 * | DEMIFY_STORE     | sqlite, json     | sqlite   | Storage driver. sqlite is the database with migrations and a   |
 * |                  |                  |          | transactional audit trail; json is the zero-setup file store.  |
 * | DEMIFY_API_TOKEN | 16 to 512        | not set  | Shared secret for the HTTP API. Printable characters without   |
 * |                  | characters       |          | spaces. Not set means no token is configured.                  |
 *
 * A variable set to an empty string counts as not set. Details: docs/data.md.
 */

export type StoreDriver = 'sqlite' | 'json'

export const STORE_DRIVERS: readonly StoreDriver[] = ['sqlite', 'json']

export interface Config {
  /** Absolute path of the data directory. */
  dataDir: string
  store: StoreDriver
  /** Null when no token is configured. Not enumerable, so logging the config cannot print it. */
  apiToken: string | null
}

/** A bad setting. The message is written for the person starting the server. */
export class ConfigError extends Error {
  override name = 'ConfigError'
}

type Env = Record<string, string | undefined>

/** Printable ASCII without spaces: safe to send in an HTTP header. */
const TOKEN = /^[\x21-\x7e]{16,512}$/

function setting(env: Env, name: string): string | undefined {
  const value = env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/** Reads and checks the settings. Reports every problem at once, and never repeats a secret. */
export function readConfig(env: Env = process.env, cwd: string = process.cwd()): Config {
  const problems: string[] = []

  const dir = setting(env, 'DEMIFY_DATA_DIR') ?? '.data'
  if (dir.includes('\0')) problems.push('DEMIFY_DATA_DIR must be a directory path.')

  const store = setting(env, 'DEMIFY_STORE') ?? 'sqlite'
  if (!STORE_DRIVERS.includes(store as StoreDriver)) {
    problems.push(`DEMIFY_STORE must be one of: ${STORE_DRIVERS.join(', ')}. It is set to "${store}".`)
  }

  const apiToken = setting(env, 'DEMIFY_API_TOKEN') ?? null
  if (apiToken !== null && !TOKEN.test(apiToken)) {
    problems.push('DEMIFY_API_TOKEN must be 16 to 512 printable characters without spaces.')
  }

  if (problems.length > 0) {
    throw new ConfigError(`Demify cannot start, the configuration is not valid. ${problems.join(' ')}`)
  }

  // The marker tells the build this path is only known at run time. Without it,
  // the build copies this whole source folder into the standalone server.
  const dataDir = path.resolve(/* turbopackIgnore: true */ cwd, dir)
  const config = { dataDir, store: store as StoreDriver } as Config
  Object.defineProperty(config, 'apiToken', { value: apiToken, enumerable: false })
  return Object.freeze(config)
}

let cached: Config | undefined

/** The settings of this server process, read once on first use. */
export function getConfig(): Config {
  cached ??= readConfig()
  return cached
}
