import 'server-only'
import { CREW } from '@/domain/crew'
import { getConfig } from './config'
import type { ReadingRepository } from './repository'

/**
 * The one repository of this server process. Kept on `globalThis`, not in a
 * module variable: Next reloads modules in development and may load a module
 * more than once in production, and each copy must find the same instance.
 */
const KEY = Symbol.for('demify.repository')

type Holder = { [KEY]?: Promise<ReadingRepository> }

async function create(): Promise<ReadingRepository> {
  const config = getConfig()
  const options = { dataDir: config.dataDir, crew: CREW }
  // Each driver is loaded only when chosen, so the JSON driver runs where node:sqlite does not exist.
  if (config.store === 'json') {
    const { createJsonRepository } = await import('./jsonRepository')
    return createJsonRepository(options)
  }
  try {
    const { createSqliteRepository } = await import('./sqliteRepository')
    return createSqliteRepository(options)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
      throw new Error('DEMIFY_STORE=sqlite needs Node.js 22.13 or newer. Upgrade Node.js, or set DEMIFY_STORE=json.', {
        cause: error,
      })
    }
    throw error
  }
}

/** The repository, created on first use. */
export function getRepository(): Promise<ReadingRepository> {
  const holder = globalThis as Holder
  if (!holder[KEY]) {
    const created = create()
    holder[KEY] = created
    // A failed start is not kept: the next request tries again, for example once the disk is back.
    created.catch(() => {
      if (holder[KEY] === created) delete holder[KEY]
    })
  }
  return holder[KEY]
}

/** Closes the repository, if there is one. The next call to getRepository opens a new one. */
export async function closeRepository(): Promise<void> {
  const holder = globalThis as Holder
  const created = holder[KEY]
  delete holder[KEY]
  await (await created?.catch(() => undefined))?.close()
}
