import 'server-only'
import packageJson from '../../../package.json'
import { getRepository } from '../store'
import { dataApiEnabled } from './access'
import { API_VERSION } from './limits'
import { ApiError } from './problem'

/** Version of the application, from package.json. Read at build time, so the standalone server knows it too. */
export const APP_VERSION: string = packageJson.version

/**
 * The readiness of this server: can it reach its storage and store a reading
 * right now. Throws the 503 a readiness probe looks for when it cannot. Says
 * nothing about the crew and repeats no setting that is a secret.
 */
export async function serverStatus() {
  const about = { version: APP_VERSION, apiVersion: API_VERSION, dataApiEnabled: dataApiEnabled() }

  let health
  try {
    health = await (await getRepository()).health()
  } catch (error) {
    console.error('Readiness check: storage could not be reached.', error)
    throw new ApiError('notReady', 'Storage could not be reached. The cause is in the server log.', {
      extensions: { ready: false, ...about },
    })
  }

  const storage = { driver: health.driver, schemaVersion: health.schemaVersion, writable: health.writable, audit: health.audit }
  if (!health.writable) {
    throw new ApiError('notReady', 'Storage cannot take a write right now, for example because the disk is read-only.', {
      extensions: { ready: false, ...about, storage },
    })
  }
  return { ready: true, ...about, storage }
}
