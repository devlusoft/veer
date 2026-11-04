import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupSocketPath,
  pickSocketPath,
} from '../../lib/vite/vite-node-shared'

vi.mock('node:fs', async (importOriginal) => {
  const filesystem = await importOriginal<typeof import('node:fs')>()

  return {
    ...filesystem,
    chmodSync: vi.fn(filesystem.chmodSync),
    mkdtempSync: vi.fn(filesystem.mkdtempSync),
    rmSync: vi.fn(filesystem.rmSync),
  }
})

vi.mock('node:os', async (importOriginal) => {
  const operatingSystem = await importOriginal<typeof import('node:os')>()

  return {
    ...operatingSystem,
    tmpdir: vi.fn(operatingSystem.tmpdir),
  }
})

const filesystem = await vi.importActual<typeof import('node:fs')>('node:fs')
const operatingSystem = await vi.importActual<typeof import('node:os')>('node:os')

let fixtureDir: string | undefined

beforeEach(() => {
  vi.resetAllMocks()

  const baseDir = process.platform === 'win32'
    ? operatingSystem.tmpdir()
    : '/tmp'

  fixtureDir = filesystem.mkdtempSync(join(baseDir, 'veer-path-test-'))
  vi.mocked(tmpdir).mockReturnValue(fixtureDir)
})

afterEach(() => {
  for (const result of vi.mocked(mkdtempSync).mock.results) {
    if (result.type === 'return' && typeof result.value === 'string') {
      filesystem.rmSync(result.value, {recursive: true, force: true})
    }
  }

  if (fixtureDir) {
    filesystem.rmSync(fixtureDir, {recursive: true, force: true})
  }

  fixtureDir = undefined
  vi.resetAllMocks()
})

describe('pickSocketPath', () => {
  it.runIf(process.platform === 'win32')(
    'returns a named pipe without creating a directory',
    () => {
      const {socketPath, parentDir} = pickSocketPath()
      const prefix = '\\\\.\\pipe\\veer-vite-'

      expect(parentDir).toBeUndefined()
      expect(socketPath.startsWith(prefix)).toBe(true)
      expect(socketPath.slice(prefix.length)).toMatch(/^[0-9a-f]{8}$/)
      expect(mkdtempSync).not.toHaveBeenCalled()
      expect(chmodSync).not.toHaveBeenCalled()
    },
  )

  describe.skipIf(process.platform === 'win32')('Unix sockets', () => {
    it('creates unique socket paths in private directories', () => {
      const first = pickSocketPath()
      const second = pickSocketPath()
      const parentDir = dirname(first.socketPath)

      expect(first.parentDir).toBe(parentDir)
      expect(dirname(parentDir)).toBe(tmpdir())
      expect(first.socketPath).toBe(join(parentDir, 'veer.sock'))
      expect(second.socketPath).not.toBe(first.socketPath)
      expect(second.parentDir).not.toBe(first.parentDir)
      expect(filesystem.statSync(parentDir).isDirectory()).toBe(true)
      expect(filesystem.statSync(parentDir).mode & 0o777).toBe(0o700)
      expect(Buffer.byteLength(first.socketPath)).toBeLessThanOrEqual(103)
    })

    it.each([
      {name: 'long ASCII path', directoryName: 'x'.repeat(110)},
      {name: 'multibyte path', directoryName: 'é'.repeat(30)},
    ])(
      'falls back without leaking the first directory for a $name',
      ({directoryName}) => {
        const longTempDir = join(tmpdir(), directoryName)
        filesystem.mkdirSync(longTempDir)
        vi.mocked(tmpdir).mockReturnValue(longTempDir)

        const {socketPath, parentDir} = pickSocketPath()

        expect(parentDir).toBe(dirname(socketPath))
        expect(dirname(dirname(socketPath))).toBe('/tmp')
        expect(Buffer.byteLength(socketPath)).toBeLessThanOrEqual(103)
        expect(filesystem.readdirSync(longTempDir)).toEqual([])
      },
    )

    it('propagates directory creation failures', () => {
      const failure = new Error('Cannot create the socket directory')
      vi.mocked(mkdtempSync).mockImplementationOnce(() => {
        throw failure
      })

      expect(() => pickSocketPath()).toThrow(failure)
      expect(filesystem.readdirSync(tmpdir())).toEqual([])
    })

    it('removes the directory when setting permissions fails', () => {
      const failure = new Error('Cannot restrict directory permissions')
      vi.mocked(chmodSync).mockImplementationOnce(() => {
        throw failure
      })

      expect(() => pickSocketPath()).toThrow(failure)
      expect(filesystem.readdirSync(tmpdir())).toEqual([])
    })

    it('leaves no original directory when fallback creation fails', () => {
      const longTempDir = join(tmpdir(), 'x'.repeat(110))
      filesystem.mkdirSync(longTempDir)
      vi.mocked(tmpdir).mockReturnValue(longTempDir)

      const failure = new Error('Cannot create the fallback directory')
      vi.mocked(mkdtempSync)
        .mockImplementationOnce(filesystem.mkdtempSync)
        .mockImplementationOnce(() => {
          throw failure
        })

      expect(() => pickSocketPath()).toThrow(failure)
      expect(filesystem.readdirSync(longTempDir)).toEqual([])
    })
  })
})

describe('cleanupSocketPath', () => {
  it('does nothing when there is no parent directory', () => {
    expect(() => cleanupSocketPath(undefined)).not.toThrow()
    expect(rmSync).not.toHaveBeenCalled()
  })

  it('removes the directory and its contents and allows repeated cleanup', () => {
    const parentDir = filesystem.mkdtempSync(join(tmpdir(), 'cleanup-'))
    filesystem.writeFileSync(join(parentDir, 'marker'), 'owned resource')

    cleanupSocketPath(parentDir)

    expect(filesystem.existsSync(parentDir)).toBe(false)
    expect(() => cleanupSocketPath(parentDir)).not.toThrow()
  })

  it('propagates removal failures', () => {
    const failure = new Error('Cannot remove the socket directory')
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw failure
    })

    expect(() => cleanupSocketPath(tmpdir())).toThrow(failure)
  })
})