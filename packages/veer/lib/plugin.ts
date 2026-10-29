import type { Plugin, ViteDevServer } from 'vite'
import { isAbsolute, join, sep } from 'node:path'
import { generateClientMiddlewaresModule, generateServerMiddlewaresModule } from './middleware/codegen'
import type { ScannedMiddleware } from './middleware/scanner'
import { generateClientPluginsModule, generateServerPluginsModule } from './plugins/codegen'
import type { ScannedPlugin } from './plugins/scanner'
import { generateRoutesModule } from './pages/codegen'
import { createPagesContext, type PagesContext } from './pages/context'

const CLIENT_MIDDLEWARE_CHAIN_LOGIC = `
function __veer_runMiddlewareChain(to, from) {
  return __veer_runMiddlewareChainInner(__veerApp, to, from, new Set())
}

async function __veer_runMiddlewareChainInner(app, to, from, seen) {
  for (const mw of globalMiddlewares) {
    if (seen.has(mw)) continue
    seen.add(mw)
    const result = await runWithVeerApp(app, () => mw(to, from))
    if (result === false) return false
    if (result && result !== true) return result
  }
  const meta = to && to.meta
  const named = meta && meta.middleware
  if (named) {
    const names = Array.isArray(named) ? named : [named]
    for (const name of names) {
      const mw = middlewares[name]
      if (!mw) continue
      if (seen.has(mw)) continue
      seen.add(mw)
      const result = await runWithVeerApp(app, () => mw(to, from))
      if (result === false) return false
      if (result && result !== true) return result
    }
  }
  return true
}
`

const SERVER_MIDDLEWARE_CHAIN_LOGIC = `
const NAVIGATE_TO_MARKER = Symbol.for('@devlusoft/veer/navigate-to')
const ABORT_NAVIGATION_MARKER = Symbol.for('@devlusoft/veer/abort-navigation')

function __veer_setNavigateResponse(ssrContext, navigate) {
  const location = navigate.external
    ? navigate.to
    : (typeof navigate.to === 'string' ? navigate.to : (navigate.to.path || '/'))
  ssrContext._renderResponse = new Response(null, {
    status: navigate.redirectCode || 302,
    headers: { Location: location },
  })
}

function __veer_setAbortResponse(ssrContext, abort) {
  ssrContext._renderResponse = new Response(abort.statusMessage || 'Navigation aborted', {
    status: abort.statusCode || 403,
  })
}

async function __veer_handleMiddlewareResult(ssrContext, result) {
  const navigate = result && typeof result === 'object' && NAVIGATE_TO_MARKER in result ? result : null
  const abort = result && typeof result === 'object' && ABORT_NAVIGATION_MARKER in result ? result : null
  if (navigate) {
    __veer_setNavigateResponse(ssrContext, navigate)
    return false
  }
  if (abort) {
    __veer_setAbortResponse(ssrContext, abort)
    return false
  }
  if (result === false) {
    ssrContext._renderResponse = new Response('Forbidden', { status: 403 })
    return false
  }
  if (result && result !== true) return result
  return true
}

async function __veer_runGlobalMiddlewares(app, to, from, ssrContext) {
  for (const mw of globalMiddlewares) {
    const result = await runWithVeerApp(app, () => mw(to, from))
    const handled = await __veer_handleMiddlewareResult(ssrContext, result)
    if (handled !== true) return handled
  }
  return true
}

async function __veer_runNamedMiddlewares(app, to, from, ssrContext) {
  const meta = to && to.meta
  const named = meta && meta.middleware
  if (!named) return true
  const names = Array.isArray(named) ? named : [named]
  const seen = new Set()
  for (const name of names) {
    const mw = middlewares[name]
    if (!mw) continue
    if (seen.has(mw)) continue
    seen.add(mw)
    const result = await runWithVeerApp(app, () => mw(to, from))
    const handled = await __veer_handleMiddlewareResult(ssrContext, result)
    if (handled !== true) return handled
  }
  return true
}
`

const ENTRY_CLIENT_SOURCE = `import { createSSRApp, ref } from 'vue'
import { RouterView, createRouter, createWebHistory } from 'vue-router'
import { createHead } from '@devlusoft/veer/runtime'
import { VeerRoot } from '@devlusoft/veer/components/veer-root'
import App from '/app/app.vue'
import { ErrorComponent } from 'virtual:veer/error'
import routes, { handleHotUpdate } from 'virtual:veer/routes'
import { middlewares, globalMiddlewares } from 'virtual:veer/middlewares-client'
import { plugins } from 'virtual:veer/plugins-client'
import { setHydratedPayload, createError, provideError, deserializeError, provideRuntimeConfig, readHydrationPayload, EMPTY, type RuntimeConfig, createVeerApp, runPlugins, runWithVeerApp, createVeerState } from '@devlusoft/veer/runtime'
import ClientOnly from '@devlusoft/veer/components/client-only'
import { VeerPage, createPageScrollBehavior } from '@devlusoft/veer'
import { VeerLoadingIndicator } from '@devlusoft/veer'
let __veerApp
${CLIENT_MIDDLEWARE_CHAIN_LOGIC}

async function main() {
  const head = createHead()
  const app = createSSRApp(VeerRoot, { app: App, errorComponent: ErrorComponent })
  app.component('ClientOnly', ClientOnly)
  app.component('VeerPage', VeerPage)
  app.component('VeerLoadingIndicator', VeerLoadingIndicator)
  app.use(head)
  const error = ref(null)
  provideError(app, error)
  app.config.errorHandler = (err) => {
    error.value = createError(err)
  }
  let runtimeConfig: RuntimeConfig = (window.__VEER__?.runtimeConfig as RuntimeConfig | undefined) ?? EMPTY
  const hydrated = readHydrationPayload()
  const initialState = hydrated?.state ?? {}
  setHydratedPayload(hydrated?.data ?? null)
  if (hydrated?.error) {
    error.value = deserializeError(hydrated.error)
  }
  delete window.__VEER__
  provideRuntimeConfig(app, runtimeConfig)
  
  const routerPublicCfg = (runtimeConfig?.public?.router ?? {}) as { scrollBehaviorType?: 'auto' | 'smooth' | 'instant' }
  const hashScrollBehavior = routerPublicCfg?.scrollBehaviorType ?? 'auto'
  
  const originalWarn = console.warn
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('No match found')) return
    originalWarn(...args)
  }
  
  const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: createPageScrollBehavior(() => __veerApp, hashScrollBehavior),
  })
  
  if (import.meta.client && 'scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'auto'
  }
  
  handleHotUpdate(router)
  const veerApp = createVeerApp({ vueApp: app, router, config: runtimeConfig, state: createVeerState(initialState) })
  __veerApp = veerApp
  await runPlugins(plugins, veerApp)
  await veerApp.callHook('app:created')
  router.beforeEach(() => veerApp.callHook('page:start'))
  router.beforeEach(() => veerApp.callHook('page:loading:start'))
  let isFirstNavigation = true
  router.beforeEach((to, from) => {
    if (isFirstNavigation) {
      isFirstNavigation = false
      if (error.value) return
      return __veer_runMiddlewareChain(to, from)
    }
    if (error.value) {
      error.value = null
      return
    }
    return __veer_runMiddlewareChain(to, from)
  })
  router.afterEach(() => veerApp.callHook('page:finish'))
  app.use(router)
  await router.isReady()
  console.warn = originalWarn
  app.mount('#app')
  await veerApp.callHook('app:mounted')
}

void main()
`

const ENTRY_SERVER_SOURCE = `import '@devlusoft/veer/runtime/server-polyfill'
import { createSSRApp, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createStreamableHead } from '@devlusoft/veer/runtime/server-head'
import { VeerRoot } from '@devlusoft/veer/components/veer-root'
import { ErrorComponent } from 'virtual:veer/error'
import { createError, provideError, provideRuntimeConfig, provideBaseURL, createVeerApp, runPlugins, runWithVeerApp, createVeerState } from '@devlusoft/veer/runtime'
import App from '/app/app.vue'
import routes from 'virtual:veer/routes'
import { middlewares, globalMiddlewares } from 'virtual:veer/middlewares-server'
import { plugins } from 'virtual:veer/plugins-server'
import ClientOnly from '@devlusoft/veer/components/client-only'
import { VeerPage, VeerLoadingIndicator } from '@devlusoft/veer'
${SERVER_MIDDLEWARE_CHAIN_LOGIC}

async function createApp(ssrContext) {
  ;(globalThis as { __VEER_SSR_CONTEXT__?: typeof ssrContext }).__VEER_SSR_CONTEXT__ = ssrContext
  const runtimeConfig = ssrContext.runtimeConfig
  const app = createSSRApp(VeerRoot, { app: App, errorComponent: ErrorComponent })
  app.component('ClientOnly', ClientOnly)
  app.component('VeerPage', VeerPage)
  app.component('VeerLoadingIndicator', VeerLoadingIndicator)
  provideRuntimeConfig(app, runtimeConfig)
  provideBaseURL(app, (runtimeConfig as { baseUrl?: string }).baseUrl)
  const error = ref(ssrContext.error || null)
  provideError(app, error)
  const { head } = createStreamableHead()
  app.use(head)
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
    warnHandler: (msg) => {
      if (typeof msg === 'string' && msg.includes('No match found')) return
      console.warn(msg)
    },
  })
  const state = createVeerState()
  const veerApp = createVeerApp({ vueApp: app, router, config: runtimeConfig, ssrContext, state })
  ssrContext.veerApp = veerApp
  await runPlugins(plugins, veerApp)
  await veerApp.callHook('app:created')
  app.use(router)

  const url = new URL(ssrContext.url, 'http://localhost')
  const href = url.pathname + url.search

  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('No match found')) return
    originalWarn(...args)
  }

  let resolved
  try {
    resolved = router.resolve(href)
  } finally {
    console.warn = originalWarn
  }

  const routeRules = resolved.meta?.routeRules

  if (routeRules?.redirect) {
    ssrContext._renderResponse = new Response(null, {
      status: 302,
      headers: { Location: routeRules.redirect },
    })
    ssrContext.modules = ssrContext.modules || new Set()
    ssrContext.head = head
    return app
  }

  if (routeRules?.ssr === false) {
    ssrContext.routeRules = { ssr: false }
    ssrContext.modules = ssrContext.modules || new Set()
    ssrContext.head = head
    ssrContext._spa = true
    return app
  }

  await __veer_runGlobalMiddlewares(veerApp, resolved, router.currentRoute.value, ssrContext)
  if (ssrContext._renderResponse) {
    ssrContext.modules = ssrContext.modules || new Set()
    ssrContext.head = head
    return app
  }

  if (resolved.matched.length === 0) {
    ssrContext.error = createError({ statusCode: 404, statusMessage: 'Page not found' })
    error.value = ssrContext.error
    ssrContext.modules = ssrContext.modules || new Set()
    ssrContext.head = head
    return app
  }

  router.beforeEach((to, from) => __veer_runNamedMiddlewares(veerApp, to, from, ssrContext))

  await veerApp.callHook('page:start')
  await veerApp.callHook('page:loading:start')
  try {
    await router.push(href)
  } catch (err) {
    if (err && typeof err == 'object' && 'type' in err) {
      // navigation was aborted or redirected; _renderResponse is already set if needed
    } else {
      ssrContext.error = createError(err)
      error.value = ssrContext.error
    }
  }

  if (ssrContext._renderResponse) {
    ssrContext.modules = ssrContext.modules || new Set()
    ssrContext.head = head
    return app
  }

  await router.isReady()
  await veerApp.callHook('page:finish')

  ssrContext.modules = ssrContext.modules || new Set()
  ssrContext.head = head

  return app
}

export default createApp
`

export const VEER_ENTRY_SERVER: string = ENTRY_SERVER_SOURCE
export const VEER_ENTRY_CLIENT: string = ENTRY_CLIENT_SOURCE

export interface VeerOptions {
  layouts: string[]
  cwd: string
  pagesDir?: string
  middlewares?: ScannedMiddleware[]
  plugins?: ScannedPlugin[]
  errorComponent?: boolean
}



function buildErrorModule(hasErrorComponent: boolean): string {
  if (hasErrorComponent) {
    return `import ErrorComponent from '/app/error.vue'\nexport { ErrorComponent }\n`
  }
  return `import { defineComponent, h } from 'vue'\n
export const ErrorComponent = defineComponent({
  name: 'VeerFallbackError',
  props: {
    error: { type: Object, required: true },
  },
  setup(props) {
    return () => h('div', { style: 'font-family:sans-serif;padding:2rem' }, [
      h('h1', null, props.error.statusCode || 'Error'),
      h('p', null, props.error.statusMessage || props.error.message || 'An error occurred'),
    ])
  },
})\n`
}

export default function veer(options: VeerOptions): Plugin {
  const clientMiddlewaresModule = generateClientMiddlewaresModule(options.middlewares ?? [])
  const serverMiddlewaresModule = generateServerMiddlewaresModule(options.middlewares ?? [])
  const clientPluginsModule = generateClientPluginsModule(options.plugins ?? [])
  const serverPluginsModule = generateServerPluginsModule(options.plugins ?? [])
  const errorModule = buildErrorModule(options.errorComponent ?? false)

  let routesModule = ''
  let pagesCtx: PagesContext | undefined

  function rebuildRoutes(): void {
    if (!pagesCtx) return
    routesModule = generateRoutesModule(pagesCtx.emit(), pagesCtx.pagesRoot)
  }

  function isUnderPagesDir(absolutePath: string): boolean {
    if (!options.cwd) return false
    const root = join(options.cwd, options.pagesDir ?? 'app/pages')
    return absolutePath === root || absolutePath.startsWith(root + sep)
  }

  function invalidateRoutesModule(server: ViteDevServer): void {
    const mod = server.moduleGraph.getModuleById('\0virtual:veer/routes')
    if (mod) {
      server.moduleGraph.invalidateModule(mod)
      server.ws.send({type: 'full-reload', path: '*'})
    }
  }

  return {
    name: 'veer:framework',

    configResolved() {
      pagesCtx = createPagesContext({
        cwd: options.cwd,
        pagesDir: options.pagesDir,
      })
      rebuildRoutes()
    },

    configureServer(server) {
      if (!pagesCtx || !options.cwd) return

      const handle = (filePath: string, kind: 'add' | 'change' | 'unlink') => {
        const absolute = isAbsolute(filePath) ? filePath : join(options.cwd, filePath)
        if (!isUnderPagesDir(absolute)) return
        if (!absolute.endsWith('.vue')) return

        if (kind === 'add' || kind === 'change') {
          pagesCtx!.addFile(absolute)
        } else {
          pagesCtx!.removeFile(absolute)
        }
        rebuildRoutes()
        invalidateRoutesModule(server)
      }

      server.watcher.on('add', (p) => handle(p, 'add'))
      server.watcher.on('change', (p) => handle(p, 'change'))
      server.watcher.on('unlink', (p) => handle(p, 'unlink'))
    },

    resolveId(id) {
      if (id === 'virtual:veer/middlewares-client' || id === '\0virtual:veer/middlewares-client') {
        return '\0virtual:veer/middlewares-client'
      }
      if (id === 'virtual:veer/middlewares-server' || id === '\0virtual:veer/middlewares-server') {
        return '\0virtual:veer/middlewares-server'
      }
      if (id === 'virtual:veer/routes' || id === '\0virtual:veer/routes') {
        return '\0virtual:veer/routes'
      }
      if (id === 'virtual:veer/error' || id === '\0virtual:veer/error') {
        return '\0virtual:veer/error'
      }
      if (id === 'virtual:veer/plugins-client' || id === '\0virtual:veer/plugins-client') {
        return '\0virtual:veer/plugins-client'
      }
      if (id === 'virtual:veer/plugins-server' || id === '\0virtual:veer/plugins-server') {
        return '\0virtual:veer/plugins-server'
      }
    },

    load(id) {
      if (id === '\0virtual:veer/middlewares-client') return clientMiddlewaresModule
      if (id === '\0virtual:veer/middlewares-server') return serverMiddlewaresModule
      if (id === '\0virtual:veer/routes') return routesModule
      if (id === '\0virtual:veer/error') return errorModule
      if (id === '\0virtual:veer/plugins-client') return clientPluginsModule
      if (id === '\0virtual:veer/plugins-server') return serverPluginsModule
    },
  }
}
