import 'server-only'
import { WRITE_LIMIT } from './limits'

/**
 * A fixed-window request counter kept in memory. Simple on purpose: it stops a
 * device stuck in a retry loop from filling the audit trail, and nothing more.
 * The count lives in one server process and is gone after a restart; a
 * deployment with several processes, or one that must hold off an attacker,
 * puts a rate limit in the reverse proxy in front.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    /** Most keys remembered at once, so made-up names cannot grow the map without bound. */
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts one request for `key`. Returns null when it may go ahead, else the whole seconds to wait. */
  take(key: string): number | null {
    const now = this.now()
    let window = this.windows.get(key)
    if (!window || now - window.start >= this.windowMs) {
      this.forgetExpired(now)
      // Full of live windows: a new name waits one window, the known ones carry on.
      if (!window && this.windows.size >= this.maxKeys) return Math.ceil(this.windowMs / 1000)
      window = { start: now, count: 0 }
      this.windows.set(key, window)
    }
    if (window.count >= this.limit) return Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000))
    window.count++
    return null
  }

  private forgetExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key)
    }
  }

  reset(): void {
    this.windows.clear()
  }
}

/** Kept on `globalThis` like the repository: Next may load this module more than once, and the count must be one. */
const KEY = Symbol.for('demify.api.writeLimiter')

type Holder = { [KEY]?: RateLimiter }

/** The limiter for write requests of this server process. */
export function writeLimiter(): RateLimiter {
  const holder = globalThis as Holder
  holder[KEY] ??= new RateLimiter(WRITE_LIMIT.requests, WRITE_LIMIT.windowSeconds * 1000)
  return holder[KEY]
}
