import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TRACKED_KEYS = [
  'NODE_ENV',
  'PORT',
  'VEER_DEV',
  'VEER_API_PREFIX',
  'VEER_BASE_URL',
  'VEER_API_SECRET',
  'VEER_ONLY_DEV',
  'VEER_ONLY_STAGING',
  'VEER_ENV_WINS',
]

describe('runStart env files', () => {
  let tempDir: string
  let snapshotPath: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'veer-start-env-'))
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
    writeServerBundle()

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.spyOn(process, 'on').mockReturnValue(process)
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    rmSync(tempDir, { recursive: true, force: true })
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  function writeServerBundle(): void {
    mkdirSync(join(tempDir, '.output/server'), { recursive: true })
    writeFileSync(
      join(tempDir, '.output/server/index.mjs'),
      `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(snapshotPath)}, JSON.stringify({
  nodeEnv: process.env.NODE_ENV,
  apiSecret: process.env.VEER_API_SECRET,
  onlyDev: process.env.VEER_ONLY_DEV,
  onlyStaging: process.env.VEER_ONLY_STAGING,
  envWins: process.env.VEER_ENV_WINS,
}))
`,
    )
  }

  async function startAndReadSnapshot(): Promise<unknown> {
    const { runStart } = await import('../../lib/start.js')
    await runStart(tempDir)
    return JSON.parse(readFileSync(snapshotPath, 'utf8'))
  }

  it('applies .env.production and ignores .env.development when NODE_ENV is not set', async () => {
    writeFileSync(join(tempDir, '.env.production'), 'VEER_API_SECRET=from-prod\n')

    const snapshot = await startAndReadSnapshot()

    expect(snapshot).toMatchObject({ nodeEnv: 'production', apiSecret: 'from-prod' })
    expect(snapshot).not.toHaveProperty('onlyDev')
  })

  it('does not fall back to .env.development when .env.production does not exist', async () => {
    const snapshot = await startAndReadSnapshot()

    expect(snapshot).not.toHaveProperty('apiSecret')
    expect(snapshot).not.toHaveProperty('onlyDev')
  })

  it('loads .env.staging and keeps NODE_ENV=staging when it is set in the environment', async () => {
    writeFileSync(join(tempDir, '.env.production'), 'VEER_API_SECRET=from-prod\n')
    writeFileSync(
      join(tempDir, '.env.staging'),
      'VEER_API_SECRET=from-staging\nVEER_ONLY_STAGING=yes\n',
    )
    process.env.NODE_ENV = 'staging'

    const snapshot = await startAndReadSnapshot()

    expect(snapshot).toMatchObject({
      nodeEnv: 'staging',
      apiSecret: 'from-staging',
      onlyStaging: 'yes',
    })
    expect(snapshot).not.toHaveProperty('onlyDev')
  })

  it('prefers a variable from the environment over .env.production', async () => {
    writeFileSync(join(tempDir, '.env.production'), 'VEER_ENV_WINS=from-prod\n')
    process.env.VEER_ENV_WINS = 'from-env'

    const snapshot = await startAndReadSnapshot()

    expect(snapshot).toMatchObject({ envWins: 'from-env' })
  })
})
