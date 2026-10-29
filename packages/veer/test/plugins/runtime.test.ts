import { describe, expect, it, vi } from 'vitest'
import type { App } from 'vue'
import { createSSRApp, defineComponent } from 'vue'
import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVeerApp, createVeerState, defineVeerPlugin, runPlugins, useVeerApp } from '../../lib'
import type { VeerPlugin } from '../../lib'
import type { VeerSSRContext } from '../../lib/types/ssr-context'

function createTestApp(): { app: App; router: Router } {
  const app = createSSRApp(defineComponent({ render: () => null }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: defineComponent({ render: () => null }) }],
  })
  return { app, router }
}

describe('createVeerApp', () => {
  it('exposes vueApp, router and config', () => {
    const { app, router } = createTestApp()
    const veerApp = createVeerApp({ vueApp: app, router, config: { public: {} }, state: createVeerState() })
    expect(veerApp.vueApp).toBe(app)
    expect(veerApp.router).toBe(router)
    expect(veerApp.config).toEqual({ public: {} })
  })

  it('calls registered hooks', async () => {
    const { app, router } = createTestApp()
    const veerApp = createVeerApp({ vueApp: app, router, config: { public: {} }, state: createVeerState() })
    const fn = vi.fn()
    veerApp.hook('app:created', fn)
    await veerApp.callHook('app:created')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('provides veerApp for useVeerApp', () => {
    const { app, router } = createTestApp()
    const veerApp = createVeerApp({ vueApp: app, router, config: { public: {} }, state: createVeerState() })
    let injected = null as typeof veerApp | null
    app.runWithContext(() => {
      injected = useVeerApp()
    })
    expect(injected).toBe(veerApp)
  })
})

describe('defineVeerPlugin', () => {
  it('returns the plugin unchanged', () => {
    const plugin = () => {}
    expect(defineVeerPlugin(plugin)).toBe(plugin)
  })

  it('defineVeerPlugin is an alias', () => {
    const plugin = () => {}
    expect(defineVeerPlugin(plugin)).toBe(plugin)
  })
})

describe('runPlugins', () => {
  it('runs function plugins with veerApp', async () => {
    const { app, router } = createTestApp()
    const veerApp = createVeerApp({ vueApp: app, router, config: { public: {} }, state: createVeerState() })
    const plugin = vi.fn()
    await runPlugins([plugin], veerApp)
    expect(plugin).toHaveBeenCalledWith(veerApp)
  })

  it('runs object plugins using setup', async () => {
    const { app, router } = createTestApp()
    const veerApp = createVeerApp({ vueApp: app, router, config: { public: {} }, state: createVeerState() })
    const setup = vi.fn()
    await runPlugins([{ setup }], veerApp)
    expect(setup).toHaveBeenCalledWith(veerApp)
  })

  it('awaits async plugins', async () => {
    const { app, router } = createTestApp()
    const veerApp = createVeerApp({ vueApp: app, router, config: { public: {} }, state: createVeerState() })
    let resolved = false
    const plugin: VeerPlugin = async () => {
      await Promise.resolve()
      resolved = true
    }
    await runPlugins([plugin], veerApp)
    expect(resolved).toBe(true)
  })
})

describe('useVeerApp in async contexts (Nuxt-style fallback)', () => {
  it('falls back to VeerSSRContext.veerApp when there is no Vue context', async () => {
    const { app, router } = createTestApp()
    const ssrContext: VeerSSRContext = {
      url: '/',
      modules: new Set<string>(),
      payload: {},
      pending: new Map(),
      async awaitAll() {
        if (this.pending.size === 0) return
        await Promise.allSettled(this.pending.values())
      },
    }
    const veerApp = createVeerApp({
      vueApp: app,
      router,
      config: { public: {} },
      ssrContext,
      state: createVeerState(),
    })
    ssrContext.veerApp = veerApp
    ;(globalThis as { __VEER_SSR_CONTEXT__?: VeerSSRContext }).__VEER_SSR_CONTEXT__ = ssrContext

    await Promise.resolve()
    const resolved = useVeerApp()

    expect(resolved).toBe(veerApp)
    delete (globalThis as { __VEER_SSR_CONTEXT__?: VeerSSRContext }).__VEER_SSR_CONTEXT__
  })
})
