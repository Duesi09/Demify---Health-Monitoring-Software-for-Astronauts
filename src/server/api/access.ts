import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { getConfig } from '../config'
import { ApiError } from './problem'

/** The name clients see in the WWW-Authenticate challenge. */
const REALM = 'demify'

/** `Bearer <token>`; the scheme name is case-insensitive (RFC 9110). */
const BEARER = /^Bearer +([\x21-\x7e]+)$/i

/**
 * Compares two secrets without telling, through the time it takes, how much of
 * a guess was right. Hashing first gives both sides the same length, which
 * timingSafeEqual needs and which also hides the length of the real token.
 */
export function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(given), digest(expected))
}

/** True when a token is configured, so crew data can be served at all. */
export function dataApiEnabled(): boolean {
  return getConfig().apiToken !== null
}

/**
 * Lets a request to crew data through, or throws the reason it may not pass.
 * Health data is never served without a configured token, and the token a
 * client sent is never logged or repeated in a response.
 */
export function requireToken(request: Request): void {
  const expected = getConfig().apiToken
  if (expected === null) {
    throw new ApiError(
      'notConfigured',
      'The data API is not configured on this server, so crew data is not served. The operator sets DEMIFY_API_TOKEN (16 to 512 characters) and restarts the server.',
    )
  }
  const match = BEARER.exec(request.headers.get('authorization')?.trim() ?? '')
  if (!match) {
    throw new ApiError('unauthorized', 'This endpoint needs the API token: send the header "Authorization: Bearer <token>".', {
      headers: { 'WWW-Authenticate': `Bearer realm="${REALM}"` },
    })
  }
  if (!sameSecret(match[1], expected)) {
    throw new ApiError('unauthorized', 'The API token is not valid.', {
      headers: { 'WWW-Authenticate': `Bearer realm="${REALM}", error="invalid_token"` },
    })
  }
}
