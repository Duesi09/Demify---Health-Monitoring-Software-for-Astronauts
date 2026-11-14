import { afterEach, describe, expect, it, vi } from 'vitest'

async function start() {
  vi.resetModules()
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const { checkStartup } = await import('./startup')
  checkStartup()
  return { exit, logged }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('start-up check', () => {
  it('lets a server with valid settings start', async () => {
    vi.stubEnv('DEMIFY_STORE', 'json')
    vi.stubEnv('DEMIFY_API_TOKEN', '')
    const { exit, logged } = await start()
    expect(exit).not.toHaveBeenCalled()
    expect(logged).not.toHaveBeenCalled()
  })

  it('stops the server on a bad setting and says which one', async () => {
    vi.stubEnv('DEMIFY_STORE', 'floppy')
    const { exit, logged } = await start()
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      'Demify cannot start, the configuration is not valid. DEMIFY_STORE must be one of: sqlite, json. It is set to "floppy".',
    )
  })
})
