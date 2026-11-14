import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { curlExample } from './curl'
import { OPERATIONS } from './definitions'
import { API_BASE, AUDIT_PAGE, CLIENT_HEADER, MAX_BATCH_READINGS, MAX_BODY_BYTES, WRITE_LIMIT } from './limits'
import { PROBLEMS } from './problem'

// The en dash and the em dash, by code so that this file holds neither.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/* The guide is written by hand. These tests keep it from falling behind the API. */

const guide = readFileSync(fileURLToPath(new URL('../../../docs/api.md', import.meta.url)), 'utf8')

describe('docs/api.md', () => {
  it.each(OPERATIONS.map((operation) => [operation.method, operation.path, operation] as const))(
    'has a section and a curl example for %s %s',
    (method, path, operation) => {
      expect(guide).toContain(`### ${method} ${API_BASE}${path}\n`)
      expect(guide).toContain(`| ${method} | \`${API_BASE}${path}\` | ${operation.access === 'token' ? 'yes' : 'no'} | ${operation.summary} |`)

      // The first line of the generated command: method, address, required parameters.
      const [first, ...rest] = curlExample(operation).split(' \\\n  ')
      const address = first.slice(0, first.includes('?') ? first.indexOf('?') : -1)
      const commands = guide.split('```bash\n').slice(1).map((block) => block.split('```')[0])
      const examples = commands.filter((command) => command.startsWith(address))
      expect(examples.length, address).toBeGreaterThan(0)
      // Every header of the generated command is in the guide's example, the token among them.
      for (const header of rest.filter((line) => line.startsWith('-H'))) expect(examples[0]).toContain(header)
      expect(examples[0].includes('Authorization')).toBe(operation.access === 'token')
    },
  )

  it('has no section for an endpoint that does not exist', () => {
    const sections = [...guide.matchAll(/^### (GET|POST|PUT|PATCH|DELETE) (\S+)$/gm)].map((found) => `${found[1]} ${found[2]}`)
    expect(sections.sort()).toEqual(OPERATIONS.map((operation) => `${operation.method} ${API_BASE}${operation.path}`).sort())
  })

  it('names every kind of problem with its status', () => {
    for (const problem of Object.values(PROBLEMS)) expect(guide).toContain(`| ${problem.status} | \`${problem.slug}\` |`)
  })

  it('states the limits the server enforces', () => {
    expect(guide).toContain(`| Request body | ${MAX_BODY_BYTES / 1024} KiB at most`)
    expect(guide).toContain(`| Readings in one batch | 1 to ${MAX_BATCH_READINGS} `)
    expect(guide).toContain(`| Write requests | ${WRITE_LIMIT.requests} per ${WRITE_LIMIT.windowSeconds} seconds for each \`${CLIENT_HEADER}\` name`)
    expect(guide).toContain(`| Audit entries in one page | ${AUDIT_PAGE.default} by default, ${AUDIT_PAGE.max} at most |`)
    expect(guide).toContain('in memory, per server process')
  })

  it('uses plain hyphens only, and holds nothing that looks like a real token', () => {
    expect(guide).not.toMatch(DASHES)
    expect(guide).not.toMatch(/Bearer (?!\$DEMIFY_API_TOKEN|<token>)\S/)
  })
})
