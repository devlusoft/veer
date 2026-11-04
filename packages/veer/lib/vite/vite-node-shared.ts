import { rmSync, mkdtempSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

export interface ViteNodeServerOptions {
  socketPath: string
  root: string
  entryPath: string
  maxRetryAttempts?: number
  baseRetryDelay?: number
  maxRetryDelay?: number
  requestTimeout?: number
}

export type ViteNodeRequestType = 'module' | 'resolve' | 'manifest' | 'invalidates'

export interface ViteNodeRequest<T = unknown> {
  id: number
  type: ViteNodeRequestType
  payload?: T
}

export interface ViteNodeResponse<T = unknown> {
  id: number
  type: 'response'
  data: T
}

export interface ViteNodeErrorResponse {
  id: number
  type: 'error'
  error: {
    message: string
    stack?: string
    status?: number
    data?: unknown
  }
}

export type ViteNodeMessage = ViteNodeResponse | ViteNodeErrorResponse

export interface ModuleRequestPayload {
  moduleId: string
}

export interface ResolveRequestPayload {
  id: string
  importer?: string
}

export function pickSocketPath(): { socketPath: string, parentDir?: string } {
  if (process.platform === 'win32') {
    return {
      socketPath: `\\\\.\\pipe\\veer-vite-${randomUUID().slice(0, 8)}`,
    }
  }

  const socketFileName = 'veer.sock'
  const maxSocketPathBytes = 103
  let parentDir = mkdtempSync(join(tmpdir(), 'veer-vite-'))

  try {
    if (Buffer.byteLength(join(parentDir, socketFileName)) > maxSocketPathBytes) {
      rmSync(parentDir, {recursive: true, force: true})
      parentDir = mkdtempSync(join('/tmp', 'veer-vite-'))
    }

    chmodSync(parentDir, 0o700)

    return {
      socketPath: join(parentDir, socketFileName),
      parentDir,
    }
  } catch (err: unknown) {
    rmSync(parentDir, {recursive: true, force: true})
    throw err
  }
}

export function cleanupSocketPath(parentDir: string | undefined): void {
  if (!parentDir) return
  rmSync(parentDir, {recursive: true, force: true})
}