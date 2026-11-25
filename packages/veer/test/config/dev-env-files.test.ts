import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { STOP_MESSAGE } = vi.hoisted(() => ({ STOP_MESSAGE: 'stop after loading config' }))

vi.mock('../../lib/veer-setup', () => ({
  createVeerProjectSetup: async () => {
    throw new Error(STOP_MESSAGE)
  },
}))

const TRACKED_KEYS = [
  'NODE_ENV',
  'VEER_DEV',
  'VEER_API_PREFIX',
  'VEER_API_SECRET',
  'VEER_ONLY_DEV',
]

describe('runDev env files', () => {
  let tempDir: string
  let snapshotPath: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'veer-dev-env-'))
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
    writeFileSync(join(tempDir, '.env.production'), 'VEER_API_SECRET=from-prod\n')
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

    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tempDir, { recursive: true, force: true })
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('keeps loading .env.development when NODE_ENV is not set', async () => {
    const { runDev } = await import('../../lib/dev.js')

    await expect(runDev(tempDir)).rejects.toThrow(STOP_MESSAGE)

    expect(JSON.parse(readFileSync(snapshotPath, 'utf8'))).toMatchObject({
      nodeEnv: 'development',
      apiSecret: 'from-dev',
      onlyDev: 'leak',
    })
  })
})