import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createSSRApp, defineComponent } from 'vue'
import {
  clearVeerState,
  createVeerApp,
  createVeerState,
  tryUseVeerApp,
  useAsyncData,
  useVeerApp,
  useState,
} from '../../lib'
import type { VeerSSRContext } from '../../lib/types/ssr-context'

function makeApp(initial?: Record<string, unknown>) {
  const app = createSSRApp(defineComponent({render: () => null}))
  const ssrContext: VeerSSRContext = {
    url: '/',
    request: new Request('http://localhost/'),
    modules: new Set<string>(),
    payload: {},
    pending: new Map(),
    async awaitAll() {
      if (this.pending.size === 0) return
      await Promise.allSettled(this.pending.values())
    }
  }
  const state = createVeerState(initial ?? {})
  const veerApp = createVeerApp({
    vueApp: app,
    router: {} as any,
    config: {public: {}},
    ssrContext,
    state,
  })
  ;(globalThis as { __VEER_SSR_CONTEXT__?: VeerSSRContext }).__VEER_SSR_CONTEXT__ = ssrContext
  return { app, state, veerApp, ssrContext }
}

afterEach(() => {
  delete (globalThis as { __VEER_SSR_CONTEXT__?: VeerSSRContext }).__VEER_SSR_CONTEXT__
})

describe('createVeerState', () => {
  it('creates refs from initial values', () => {
    const state = createVeerState({counter: 1})
    expect(state.counter.value).toBe(1)
  })
})

describe('useState (Vue context)', () => {
  it('returns a shared ref for the same key', () => {
    const {app} = makeApp()

    let a: ReturnType<typeof useState> | null = null
    let b: ReturnType<typeof useState> | null = null
    app.runWithContext(() => {
      a = useState('counter', () => 0)
      b = useState('counter', () => 100)
    })

    expect(a).toBe(b)
    expect(a!.value).toBe(0)
  })

  it('hydrates from initial state', () => {
    const {app} = makeApp({user: 'luis'})

    let user: ReturnType<typeof useState<string>> | null = null
    app.runWithContext(() => {
      user = useState('user', () => 'default')
    })

    expect(user!.value).toBe('luis')
  })
})

describe('useState (async context)', () => {
  beforeEach(() => {
    clearVeerState()
  })

  it('reads state created in setup() from inside a useAsyncData handler', async () => {
    const { app, veerApp } = makeApp()

    const result = await app.runWithContext(async () => {
      const resolved = useVeerApp()
      expect(resolved).toBe(veerApp)

      return await useAsyncData('session-via-handler', async () => {
        const sessionRef = useState<string | undefined>('session', () => 'seeded')
        return {session: sessionRef.value}
      })
    })

    expect(result.data.value).toEqual({session: 'seeded'})
  })

  it('throws a clear error when called outside any context', () => {
    delete (globalThis as { __VEER_SSR_CONTEXT__?: VeerSSRContext }).__VEER_SSR_CONTEXT__
    expect(tryUseVeerApp()).toBeNull()
    clearVeerState()

    expect(() => useState('orphan', () => 0)).toThrow(
      /\[veer\] useState/,
    )
  })

  it('clearing the state bag wipes entries', () => {
    const {app} = makeApp({counter: 7, name: 'luis'})
    app.runWithContext(() => {
      useState('extra', () => 'added')
      expect(useState('counter').value).toBe(7)
      clearVeerState()
      expect(useState('counter').value).toBeUndefined()
      expect(useState('counter').value).toBeUndefined()
    })
  })

  it('clearing a subset only removes matching keys', () => {
    const {app} = makeApp({keep: 1, drop: 2})
    app.runWithContext(() => {
      expect(useState('keep').value).toBe(1)
      expect(useState('drop').value).toBe(2)
      clearVeerState('drop')
      expect(useState('keep').value).toBe(1)
      expect(useState('drop').value).toBeUndefined()
    })
  })
})
