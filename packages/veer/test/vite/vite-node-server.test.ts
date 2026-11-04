import type { Socket } from 'node:net'
import type { Plugin, ViteDevServer } from 'vite'
import type { ViteNodeServerOptions } from '../../lib/vite/vite-node-shared'
import { once } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createConnection, Server } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { object, parse, string } from 'valibot'
import { createServer as createViteServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VeerViteNodePlugin } from '../../lib/vite/vite-node-server'
import { pickSocketPath } from '../../lib/vite/vite-node-shared'

vi.mock(import('../../lib/vite/vite-node-shared'), async (importOriginal) => {
  const shared = await importOriginal()

  return {
    ...shared,
    pickSocketPath: vi.fn(shared.pickSocketPath),
  }
})

const servers = new Set<ViteDevServer>()
const sockets = new Set<Socket>()

let root: string
let plugin: Plugin

function socketAllocations(): ReturnType<typeof pickSocketPath>[] {
  return vi.mocked(pickSocketPath).mock.results.flatMap((result) =>
    result.type === 'return' ? [result.value] : [],
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VEER_VITE_NODE_OPTIONS', undefined)

  root = mkdtempSync(join(tmpdir(), 'veer-plugin-test-'))
  plugin = VeerViteNodePlugin({
    root,
    entryPath: join(root, 'entry-server.ts'),
  })
})

afterEach(async () => {
  const allocations = socketAllocations()

  vi.restoreAllMocks()

  for (const socket of sockets) socket.destroy()

  try {
    await Promise.all([...servers].map((server) => server.close()))
  } finally {
    servers.clear()
    sockets.clear()
    vi.unstubAllEnvs()

    for (const {parentDir} of allocations) {
      if (parentDir) {
        rmSync(parentDir, {recursive: true, force: true})
      }
    }

    rmSync(root, {recursive: true, force: true})
  }
})

function stateFile(): string {
  return join(root, '.veer', 'vite-node-socket-path')
}

function readOptions(): ViteNodeServerOptions {
  const value: unknown = JSON.parse(readFileSync(stateFile(), 'utf-8'))

  return parse(
    object({
      socketPath: string(),
      root: string(),
      entryPath: string(),
    }),
    value,
  )
}

async function startServer(): Promise<ViteDevServer> {
  return createViteServer({
    root,
    configFile: false,
    publicDir: false,
    appType: 'custom',
    mode: 'development',
    logLevel: 'silent',
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
    server: {
      middlewareMode: true,
      hmr: false,
      ws: false,
      watch: null,
      forwardConsole: false,
    },
    plugins: [
      {
        name: 'test:track-vite-server',
        configureServer(server) {
          servers.add(server)
        },
      },
      plugin,
    ],
  })
}

async function connectSocket(socketPath: string): Promise<Socket> {
  const socket = createConnection(socketPath)
  sockets.add(socket)

  await once(socket, 'connect')
  return socket
}

async function expectSocketToRespond(socket: Socket): Promise<void> {
  const body = Buffer.from(JSON.stringify({id: 1, type: 'invalidates'}))
  const frame = Buffer.alloc(4 + body.length)

  frame.writeUInt32BE(body.length, 0)
  body.copy(frame, 4)
  socket.write(frame)

  let buffered: Buffer = Buffer.alloc(0)
  const chunks: AsyncIterable<unknown> = socket.iterator({
    destroyOnReturn: false,
  })

  for await (const chunk of chunks) {
    if (!Buffer.isBuffer(chunk)) {
      throw new Error('Expected a binary IPC response')
    }

    buffered = Buffer.concat([buffered, chunk])

    if (buffered.length < 4) continue

    const length = buffered.readUInt32BE(0)
    if (buffered.length < 4 + length) continue

    const response: unknown = JSON.parse(
      buffered.subarray(4, 4 + length).toString('utf-8'),
    )

    expect(response).toEqual({
      id: 1,
      type: 'response',
      data: null,
    })
    return
  }

  throw new Error('The IPC socket closed before sending a complete response')
}

async function expectSocketRemoved(socketPath: string): Promise<void> {
  await expect(connectSocket(socketPath)).rejects.toThrow()

  if (process.platform !== 'win32') {
    expect(existsSync(dirname(socketPath))).toBe(false)
  }
}

async function expectAllSocketsRemoved(): Promise<void> {
  const allocations = socketAllocations()
  expect(allocations.length).toBeGreaterThan(0)

  for (const {socketPath} of allocations) {
    await expectSocketRemoved(socketPath)
  }
}

function failNextListen(error: Error): void {
  vi.spyOn(Server.prototype, 'listen').mockImplementationOnce(
    function (this: Server) {
      queueMicrotask(() => this.emit('error', error))
      return this
    },
  )
}

describe('VeerViteNodePlugin', () => {
  it('publishes matching options for a responsive IPC server', async () => {
    await startServer()
    const options = readOptions()

    expect(options).toEqual({
      socketPath: expect.any(String),
      root,
      entryPath: join(root, 'entry-server.ts'),
    })
    expect(process.env.VEER_VITE_NODE_OPTIONS).toBe(
      readFileSync(stateFile(), 'utf-8'),
    )

    const socket = await connectSocket(options.socketPath)
    await expectSocketToRespond(socket)
  })

  it('closing an older server leaves the replacement socket alive', async () => {
    const older = await startServer()
    const olderOptions = readOptions()

    const replacement = await startServer()
    const replacementOptions = readOptions()

    expect(replacementOptions.socketPath).not.toBe(olderOptions.socketPath)

    const socket = await connectSocket(replacementOptions.socketPath)
    await expectSocketToRespond(socket)

    await older.close()
    await expectSocketRemoved(olderOptions.socketPath)
    await expectSocketToRespond(socket)

    await older.close()
    await expectSocketToRespond(socket)

    await replacement.close()
    await expectAllSocketsRemoved()
  })

  it('closes active connections and allows repeated shutdown requests', async () => {
    const server = await startServer()
    const {socketPath} = readOptions()
    const socket = await connectSocket(socketPath)

    await expectSocketToRespond(socket)
    expect(socket.destroyed).toBe(false)

    const disconnected = once(socket, 'close')

    await Promise.all([
      server.close(),
      server.close(),
      disconnected,
    ])
    await server.close()

    expect(socket.destroyed).toBe(true)
    await expectAllSocketsRemoved()
  })

  it('replaces and cleans up the socket across three consecutive restarts', async () => {
    const server = await startServer()
    let previousOptions = readOptions()

    for (let restart = 0; restart < 3; restart++) {
      await server.restart()
      const options = readOptions()

      expect(options.socketPath).not.toBe(previousOptions.socketPath)
      await expectSocketRemoved(previousOptions.socketPath)

      const socket = await connectSocket(options.socketPath)
      await expectSocketToRespond(socket)

      previousOptions = options
    }

    await server.close()
    await expectAllSocketsRemoved()
  })

  it('cleans up and rejects startup when listening fails', async () => {
    const failure = new Error('Cannot listen on the IPC socket')
    const originalUmask = process.umask()

    failNextListen(failure)

    await expect(startServer()).rejects.toBe(failure)

    expect(process.umask()).toBe(originalUmask)
    expect(process.env.VEER_VITE_NODE_OPTIONS).toBeUndefined()
    expect(existsSync(stateFile())).toBe(false)
    expect(pickSocketPath).toHaveBeenCalledTimes(1)

    await expectAllSocketsRemoved()
  })

  it.each([
    {
      name: 'creating the state directory',
      prepare: (directory: string) => {
        writeFileSync(join(directory, '.veer'), 'not a directory')
      },
    },
    {
      name: 'writing the state file',
      prepare: (directory: string) => {
        mkdirSync(join(directory, '.veer', 'vite-node-socket-path'), {
          recursive: true,
        })
      },
    },
  ])('cleans up when $name fails', async ({prepare}) => {
    prepare(root)

    await expect(startServer()).rejects.toThrow()

    expect(process.env.VEER_VITE_NODE_OPTIONS).toBeUndefined()
    expect(pickSocketPath).toHaveBeenCalledTimes(1)

    await expectAllSocketsRemoved()
  })

  it('keeps the current socket alive when a replacement fails to start', async () => {
    const server = await startServer()
    const options = readOptions()
    const environment = server.environments.ssr
    const socket = await connectSocket(options.socketPath)

    await expectSocketToRespond(socket)

    failNextListen(new Error('Cannot start the replacement IPC socket'))

    await expect(server.restart()).resolves.toBeUndefined()

    expect(server.environments.ssr).toBe(environment)
    expect(readOptions()).toEqual(options)
    await expectSocketToRespond(socket)

    const allocations = socketAllocations()
    expect(allocations).toHaveLength(2)

    for (const allocation of allocations) {
      if (allocation.socketPath !== options.socketPath) {
        await expectSocketRemoved(allocation.socketPath)
      }
    }

    await server.close()
    await expectAllSocketsRemoved()
  })
})
