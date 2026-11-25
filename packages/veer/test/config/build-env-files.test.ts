import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vite')>()),
  createBuilder: async () => ({buildApp: async () => undefined}),
}))

vi.mock('../../lib/veer-setup', () => ({
  createVeerProjectSetup: async () => ({layoutFiles: [], frameworkPlugins: [], baseConfig: {}}),
}))

const TRACKED_KEYS = ['NODE_ENV', 'VEER_API_SECRET', 'VEER_ONLY_DEV']

describe('runBuild env files', () => {
  let tempDir: string
  let snapshotPath: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'veer-build-env-'))
    snapshotPath = join(tempDir, 'snapshot.json')
    savedEnv = {}
    for (const key of TRACKED_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }

    writeFileSync(
      join(tempDir, '.env.development'),
      'VEER_API_SECRET=from-dev\nVEER_ONLY_DEV=leak\n',
    )
    writeVeerConfig()

    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tempDir, {recursive: true, force: true})
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  function writeVeerConfig(): void {
    writeFileSync(
      join(tempDir, 'veer.config.ts'),
      `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(snapshotPath)}, JSON.stringify({
  nodeEnv: process.env.NODE_ENV,
  apiSecret: process.env.VEER_API_SECRET,
  onlyDev: process.env.VEER_ONLY_DEV,
}))
export default {}
`,
    )
  }

  async function buildAndReadSnapshot(): Promise<unknown> {
    const {runBuild} = await import('../../lib/build.js')
    await runBuild(tempDir)
    return JSON.parse(readFileSync(snapshotPath, 'utf8'))
  }

  it('reads .env.production and ignores .env.development when NODE_ENV is not set', async () => {
    writeFileSync(join(tempDir, '.env.production'), 'VEER_API_SECRET=from-prod\n')

    const snapshot = await buildAndReadSnapshot()

    expect(snapshot).toMatchObject({nodeEnv: 'production', apiSecret: 'from-prod'})
    expect(snapshot).not.toHaveProperty('onlyDev')
  })

  it('does not fall back to .env.development when .env.production does not exist', async () => {
    const snapshot = await buildAndReadSnapshot()

    expect(snapshot).not.toHaveProperty('apiSecret')
    expect(snapshot).not.toHaveProperty('onlyDev')
  })
})
