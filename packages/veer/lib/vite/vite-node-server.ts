import type { Environment, Plugin, ViteDevServer } from 'vite'
import { once } from 'node:events'
import { createServer as createNetServer, type Socket } from 'node:net'
import { ViteNodeServer as ViteNodeServerImpl } from 'vite-node/server'
import { chmodSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  type ViteNodeMessage,
  type ViteNodeRequest,
  type ViteNodeRequestType,
  type ViteNodeServerOptions,
  cleanupSocketPath,
  pickSocketPath
} from './vite-node-shared'
import { getDevManifest } from './client-manifest'

const INITIAL_BUFFER_SIZE = 64 * 1024
const MAX_BUFFER_SIZE = 1024 * 1024 * 1024

interface SocketState {
  buffer: Buffer
  writeOffset: number
  readOffset: number
}

function newSocketState(): SocketState {
  return {
    buffer: Buffer.alloc(INITIAL_BUFFER_SIZE),
    writeOffset: 0,
    readOffset: 0,
  }
}

interface ViteNodePluginOptions {
  root: string
  entryPath: string
}

interface ViteNodeServerInstance {
  options: ViteNodeServerOptions
  close: () => Promise<void>
}

async function createViteNodeServer(server: ViteDevServer, options: ViteNodePluginOptions): Promise<ViteNodeServerInstance> {
  const viteNodeServer = new ViteNodeServerImpl(server)
  const connections = new Set<Socket>()

  const netServer = createNetServer((socket: Socket) => {
    connections.add(socket)
    const state = newSocketState()

    function destroySocket(error: unknown): void {
      socket.destroy(error instanceof Error ? error : new Error(String(error)))
    }

    socket.on('data', (chunk) => {
      try {
        writeChunk(state, chunk)
        void processMessages(state, socket, viteNodeServer, server).catch(destroySocket)
      } catch (error: unknown) {
        destroySocket(error)
      }
    })

    socket.on('error', () => resetState(state))
    socket.on('close', () => {
      connections.delete(socket)
      resetState(state)
    })
  })

  const {socketPath, parentDir} = pickSocketPath()
  const serverOptions: ViteNodeServerOptions = {
    socketPath,
    root: options.root,
    entryPath: options.entryPath
  }

  let closePromise: Promise<void> | undefined

  function close(): Promise<void> {
    closePromise ??= closeSocketServer()
    return closePromise
  }

  async function closeSocketServer(): Promise<void> {
    const closing = netServer.listening ? new Promise<void>((resolve, reject) => {
      netServer.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    }) : Promise.resolve()

    for (const socket of connections) socket.destroy()

    await closing
    cleanupSocketPath(parentDir)
  }

  try {
    const listening = once(netServer, 'listening')

    if (parentDir) {
      const previousUmask = process.umask(0o077)
      try {
        netServer.listen(socketPath)
      } finally {
        process.umask(previousUmask)
      }
    } else {
      netServer.listen(socketPath)
    }

    await listening

    if (parentDir) chmodSync(socketPath, 0o600)

    netServer.on('error', (error: Error) => {
      server.config.logger.error(error.message, {error})

      void close().catch((closeError: unknown) => {
        server.config.logger.error(String(closeError))
      })
    })

    return {options: serverOptions, close}
  } catch (error: unknown) {
    try {
      await close()
    } catch (closeError: unknown) {
      throw new AggregateError([error, closeError], 'Failed to start and clean up the vite-node server')
    }

    throw error
  }
}

export function VeerViteNodePlugin(options: ViteNodePluginOptions): Plugin {
  const closeByEnvironment = new WeakMap<Environment, () => Promise<void>>()

  return {
    name: 'veer:vite-node-server',
    enforce: 'post',
    apply: 'serve',
    async configureServer(server: ViteDevServer) {
      const instance = await createViteNodeServer(server, options)

      try {
        const stateFile = `${server.config.root}/.veer/vite-node-socket-path`
        const serializedOptions = JSON.stringify(instance.options)

        mkdirSync(dirname(stateFile), {recursive: true})
        writeFileSync(stateFile, serializedOptions, 'utf-8')
        process.env.VEER_VITE_NODE_OPTIONS = serializedOptions
      } catch (error: unknown) {
        try {
          await instance.close()
        } catch (closeError: unknown) {
          throw new AggregateError([error, closeError], 'Failed to publish and clean up the vite-node server')
        }

        throw error
      }

      closeByEnvironment.set(server.environments.ssr, instance.close)
    },
    async closeBundle() {
      const close = closeByEnvironment.get(this.environment)
      if (!close) return

      try {
        await close()
      } catch (error: unknown) {
        this.environment.logger.error(String(error))
        throw error
      } finally {
        closeByEnvironment.delete(this.environment)
      }
    }
  }
}

function writeChunk(state: SocketState, chunk: Buffer) {
  ensureCapacity(state, chunk.length)
  chunk.copy(state.buffer, state.writeOffset)
  state.writeOffset += chunk.length
}

function ensureCapacity(state: SocketState, additionalBytes: number): void {
  const required = state.writeOffset + additionalBytes
  if (required > MAX_BUFFER_SIZE) {
    throw new Error(`Socket buffer exceeded ${MAX_BUFFER_SIZE} bytes`)
  }
  if (required <= state.buffer.length) return
  compact(state)
  if (required <= state.buffer.length) return
  const newSize = Math.min(Math.max(state.buffer.length * 2, required), MAX_BUFFER_SIZE)
  const next = Buffer.alloc(newSize)
  state.buffer.copy(next, 0, 0, state.writeOffset)
  state.buffer = next
}

function compact(state: SocketState) {
  if (state.readOffset === 0) return
  const remaining = state.writeOffset - state.readOffset
  if (remaining > 0) {
    state.buffer.copy(state.buffer, 0, state.readOffset, state.writeOffset)
  }
  state.writeOffset = remaining
  state.readOffset = 0
}

function resetState(state: SocketState) {
  state.writeOffset = 0
  state.readOffset = 0
}

async function processMessages(state: SocketState, socket: Socket, node: ViteNodeServerImpl, server: ViteDevServer): Promise<void> {
  while (state.writeOffset - state.readOffset >= 4) {
    const messageLength = state.buffer.readUInt32BE(state.readOffset)
    const total = 4 + messageLength
    if (state.writeOffset - state.readOffset < total) return
    const json = state.buffer.subarray(state.readOffset + 4, state.readOffset + total).toString('utf-8')
    state.readOffset += total

    let request: ViteNodeRequest
    try {
      request = JSON.parse(json)
    } catch {
      socket.destroy(new Error('Invalid JSON in IPC message'))
      return
    }

    try {
      const response = await handleRequest(node, server, request)
      sendMessage(socket, response)
    } catch (error) {
      sendMessage(socket, errorResponse(request.id, error))
    }

    if (state.readOffset > state.buffer.length / 2) compact(state)
  }
}

async function handleRequest(node: ViteNodeServerImpl, server: ViteDevServer, request: ViteNodeRequest): Promise<ViteNodeMessage> {
  switch (request.type as ViteNodeRequestType) {
    case 'module': {
      const {moduleId} = request.payload as { moduleId: string }
      const result = await node.fetchModule(moduleId)
      return {id: request.id, type: 'response', data: result}
    }
    case 'resolve': {
      const {id, importer} = request.payload as { id: string, importer?: string }
      const resolved = await node.resolveId(id, importer)
      return {id: request.id, type: 'response', data: resolved}
    }
    case 'manifest': {
      return {id: request.id, type: 'response', data: getDevManifest()}
    }
    case 'invalidates':
      return {id: request.id, type: 'response', data: null}
    default:
      throw new Error(`Unknown request type: ${(request as { type: string }).type}`)
  }
}

function sendMessage(socket: Socket, message: ViteNodeMessage): void {
  const json = JSON.stringify(message)
  const body = Buffer.from(json, 'utf-8')
  const length = body.length
  const framed = Buffer.alloc(4 + length)
  framed.writeUInt32BE(length, 0)
  body.copy(framed, 4)
  socket.write(framed, (err) => {
    if (err) socket.destroy()
  })
}

function errorResponse(id: number, error: unknown): ViteNodeMessage {
  const e = error as { message?: string, stack?: string, status?: number, data?: unknown }
  return {
    id,
    type: 'error',
    error: {
      message: e?.message ?? 'Unknown error',
      stack: e?.stack,
      status: e?.status,
      data: e?.data,
    },
  }
}