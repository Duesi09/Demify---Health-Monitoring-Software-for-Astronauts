import 'server-only'

/*
 * Every limit of the HTTP API, in one place. The OpenAPI document, the docs
 * and the handlers all read these, so a change here shows everywhere.
 */

/** Version of the API contract, as in the address: /api/v1. */
export const API_VERSION = 'v1'
/** Where the versioned API lives. */
export const API_BASE = '/api/v1'
/** The human-readable page. */
export const DOCS_PATH = '/api/docs'

/** Largest request body accepted, in bytes. 500 readings need about 30 KiB. */
export const MAX_BODY_BYTES = 64 * 1024
/** Most readings in one batch. One device sending every indicator for a month fits. */
export const MAX_BATCH_READINGS = 500

/**
 * Write requests one client name may send per window. Counted in this server
 * process only: several processes each keep their own count.
 */
export const WRITE_LIMIT = { requests: 60, windowSeconds: 60 } as const

/** Entries of the audit trail in one page. */
export const AUDIT_PAGE = { default: 50, max: 200 } as const

/** The header that names the device or system sending a request. */
export const CLIENT_HEADER = 'X-Demify-Client'
