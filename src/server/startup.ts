import 'server-only'
import { ConfigError, getConfig } from './config'

/**
 * Checks the configuration when the server starts (called from
 * src/instrumentation.ts). A bad setting stops the process with a clear
 * message. Left to itself, Next would log the error and go on answering every
 * request with an error page; a monitor that cannot work must not look alive.
 */
export function checkStartup(): void {
  try {
    getConfig()
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error(error.message)
    process.exit(1)
  }
}
