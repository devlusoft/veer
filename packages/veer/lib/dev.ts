import { listen } from 'listhen'
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
  const config = await loadVeerConfig({ cwd })
  process.env.VEER_API_PREFIX = config.server.apiPrefix
  const port = config.server.port
  const setup = await createVeerProjectSetup(cwd, config)

  const vite = await createViteServer({
    ...setup.baseConfig,
    server: {
      middlewareMode: true,
    }
  })

  process.env.VEER_DEV = 'true'
  logInfo('starting dev server...')
  const listener = await listen((req, res) => {
    vite.middlewares(req, res)
  }, {
    port,
    showURL: false,
  })

  process.env.VEER_BASE_URL = listener.url

  printDevBanner(port, Date.now() - startedAt)
}