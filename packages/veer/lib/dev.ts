import { once } from 'node:events'
import { createServer as createHttpServer } from 'node:http'
import { getPort } from 'get-port-please'
import { createServer as createViteServer } from 'vite'
import { loadVeerConfig } from './config'
import { createVeerProjectSetup } from './veer-setup'
import { prepareVeerLayoutComponent } from './prepare-veer-layout-component'
import { printDevBanner } from './utils/banner'
import { logInfo } from './utils/logger'

export async function runDev(cwd: string): Promise<void> {
  process.env.VEER_DEV = 'true'
  process.env.NODE_ENV = process.env.NODE_ENV || 'development'

  const startedAt = Date.now()
  prepareVeerLayoutComponent(cwd)
  const config = await loadVeerConfig({cwd})
  process.env.VEER_API_PREFIX = config.server.apiPrefix
  const setup = await createVeerProjectSetup(cwd, config)

  const hostname = process.env.HOST || 'localhost'
  const port = await getPort({
    port: config.server.port,
    host: hostname,
    alternativePortRange: [3000, 3100]
  })

  const httpServer = createHttpServer()
  const vite = await createViteServer({
    ...setup.baseConfig,
    server: {
      middlewareMode: {
        server: httpServer,
      },
    }
  })

  process.env.VEER_DEV = 'true'
  logInfo('starting dev server...')

  httpServer.on('request', (req, res) => vite.middlewares(req, res))

  const listening = once(httpServer, 'listening')
  try {
    httpServer.listen(port, hostname)
    await listening
  } catch (error: unknown) {
    await vite.close()
    throw error
  }

  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine the dev server port')
  }

  const actualPort = address.port
  const urlHost = hostname === '0.0.0.0' || hostname === '::' ? 'localhost' : hostname
  process.env.VEER_BASE_URL = `http://${urlHost}:${actualPort}/`
  printDevBanner(actualPort, Date.now() - startedAt)

  let shutdownPromise: Promise<void> | undefined

  const shutdown = (): Promise<void> => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        await Promise.all([
          vite.close(),
          new Promise<void>((resolve, reject) => {
            httpServer.close((error) => {
              if (error) reject(error)
              else resolve()
            })
          }),
        ])
      })()
    }
    return shutdownPromise
  }

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(signal, () => {
      void shutdown().catch((error: unknown) => {
        console.error('[veer] Failed to close the dev server', error)
        process.exitCode = 1
      })
    })
  }
}