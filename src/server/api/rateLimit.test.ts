import { describe, expect, it } from 'vitest'
import { sameSecret } from './access'
import { RateLimiter, writeLimiter } from './rateLimit'

describe('the rate limiter', () => {
  it('lets the limit through in one window, then says how long to wait', () => {
    let now = 0
    const limiter = new RateLimiter(3, 60_000, () => now)
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([null, null, null])
    expect(limiter.take('a')).toBe(60)
    now = 12_300
    expect(limiter.take('a')).toBe(48)
    now = 59_999
    expect(limiter.take('a')).toBe(1)
  })

  it('starts counting again when the window has passed', () => {
    let now = 0
    const limiter = new RateLimiter(1, 60_000, () => now)
    expect(limiter.take('a')).toBeNull()
    expect(limiter.take('a')).toBe(60)
    now = 60_000
    expect(limiter.take('a')).toBeNull()
    expect(limiter.take('a')).toBe(60)
  })

  it('counts every key on its own', () => {
    const limiter = new RateLimiter(1, 60_000, () => 0)
    expect(limiter.take('a')).toBeNull()
    expect(limiter.take('b')).toBeNull()
    expect(limiter.take('a')).not.toBeNull()
  })

  it('remembers a bounded number of keys, and forgets the ones whose window has passed', () => {
    let now = 0
    const limiter = new RateLimiter(5, 60_000, () => now, 2)
    expect(limiter.take('a')).toBeNull()
    expect(limiter.take('b')).toBeNull()
    // Full: a name it has not seen waits, the known ones carry on.
    expect(limiter.take('c')).toBe(60)
    expect(limiter.take('a')).toBeNull()
    now = 60_000
    expect(limiter.take('c')).toBeNull()
  })

  it('is one instance for the whole server process', () => {
    expect(writeLimiter()).toBe(writeLimiter())
  })
})

describe('comparing secrets', () => {
  it('accepts the same secret and nothing else, whatever the lengths', () => {
    expect(sameSecret('correct-horse-battery', 'correct-horse-battery')).toBe(true)
    expect(sameSecret('correct-horse-batterx', 'correct-horse-battery')).toBe(false)
    expect(sameSecret('correct-horse', 'correct-horse-battery')).toBe(false)
    expect(sameSecret('', 'correct-horse-battery')).toBe(false)
    expect(sameSecret('correct-horse-battery-staple', 'correct-horse-battery')).toBe(false)
  })
})
