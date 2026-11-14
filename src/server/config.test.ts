import path from 'node:path'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ConfigError, readConfig } from './config'

const CWD = path.resolve('/srv/demify')
const TOKEN = 'correct-horse-battery-staple'

describe('configuration', () => {
  it('has a default for everything', () => {
    const config = readConfig({}, CWD)
    expect(config).toEqual({ dataDir: path.join(CWD, '.data'), store: 'sqlite' })
    expect(config.apiToken).toBeNull()
  })

  it('counts an empty value as not set', () => {
    const config = readConfig({ DEMIFY_DATA_DIR: '', DEMIFY_STORE: '  ', DEMIFY_API_TOKEN: '' }, CWD)
    expect(config).toEqual({ dataDir: path.join(CWD, '.data'), store: 'sqlite' })
    expect(config.apiToken).toBeNull()
  })

  it.each(['sqlite', 'json'] as const)('accepts DEMIFY_STORE=%s', (store) => {
    expect(readConfig({ DEMIFY_STORE: store }, CWD).store).toBe(store)
  })

  it('accepts an absolute data directory and resolves a relative one', () => {
    expect(readConfig({ DEMIFY_DATA_DIR: '/data' }, CWD).dataDir).toBe(path.resolve('/data'))
    expect(readConfig({ DEMIFY_DATA_DIR: 'var/readings' }, CWD).dataDir).toBe(path.join(CWD, 'var', 'readings'))
  })

  it('accepts an API token and keeps it out of anything that prints the configuration', () => {
    const config = readConfig({ DEMIFY_API_TOKEN: TOKEN }, CWD)
    expect(config.apiToken).toBe(TOKEN)
    expect(JSON.stringify(config)).not.toContain(TOKEN)
    expect(inspect(config)).not.toContain(TOKEN)
    expect(Object.keys(config)).toEqual(['dataDir', 'store'])
  })

  it.each(['postgres', 'SQLite', 'sqlite3', 'true'])('rejects DEMIFY_STORE=%s and names the valid values', (store) => {
    expect(() => readConfig({ DEMIFY_STORE: store }, CWD)).toThrow(ConfigError)
    expect(() => readConfig({ DEMIFY_STORE: store }, CWD)).toThrow(
      `DEMIFY_STORE must be one of: sqlite, json. It is set to "${store}".`,
    )
  })

  it.each([
    ['too short', 'only-15-chars!!'],
    ['with a space', 'sixteen characters or more'],
    ['with a line break', 'sixteen-characters\nor-more'],
    ['too long', 'x'.repeat(513)],
  ])('rejects an API token that is %s, without repeating it', (_why, token) => {
    let message = ''
    try {
      readConfig({ DEMIFY_API_TOKEN: token }, CWD)
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      message = (error as Error).message
    }
    expect(message).toContain('DEMIFY_API_TOKEN must be 16 to 512 printable characters without spaces.')
    expect(message).not.toContain(token.trim())
  })

  it('rejects a data directory that cannot be a path', () => {
    expect(() => readConfig({ DEMIFY_DATA_DIR: 'data\0dir' }, CWD)).toThrow('DEMIFY_DATA_DIR must be a directory path.')
  })

  it('reports every problem at once', () => {
    expect(() => readConfig({ DEMIFY_STORE: 'redis', DEMIFY_API_TOKEN: 'short' }, CWD)).toThrow(
      /^Demify cannot start, the configuration is not valid\. DEMIFY_STORE .* DEMIFY_API_TOKEN /,
    )
  })

  it('cannot be changed after it was read', () => {
    const config = readConfig({}, CWD)
    expect(() => Object.assign(config, { store: 'json' })).toThrow(TypeError)
  })
})
