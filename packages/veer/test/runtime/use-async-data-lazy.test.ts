// @vitest-environment happy-dom
import {createApp, defineComponent, h, nextTick, shallowRef, type Component} from 'vue'
import {describe, expect, it, vi} from 'vitest'
import {createVeerApp, createVeerState, useAsyncData} from '../../lib'
import type {AsyncData} from '../../lib/runtime'
import {createAsyncDataRegistry} from '../../lib/runtime/async-data-registry'

function setupApp() {
  const pages = shallowRef<Component[]>([])
  const app = createApp({render: () => h('div', pages.value.map((page) => h(page)))})
  const veerApp = createVeerApp({
    vueApp: app,
    router: {} as any,
    config: {public: {}},
    state: createVeerState(),
  })
  const el = document.createElement('div')
  app.mount(el)
  const registry = createAsyncDataRegistry(veerApp)

  return {
    app,
    el,
    navigate: registry.advanceNavigation,
    show(page: Component) {
      pages.value = [...pages.value, page]
      return nextTick()
    },
  }
}

describe('useAsyncData (lazy navigation)', () => {
  it('requests on mount, not in setup, when a lazy page mounts on a key the previous page holds', async () => {
    const {app, el, navigate, show} = setupApp()
    const previousHandler = vi.fn().mockResolvedValue('before')
    let previous!: AsyncData<string>
    await show(defineComponent({
      setup() {
        previous = useAsyncData<string>('detail', previousHandler)
        return () => null
      },
    }))
    await vi.waitFor(() => expect(previous.data.value).toBe('before'))

    navigate()
    const lazyHandler = vi.fn().mockResolvedValue('after')
    let callsInSetup = -1
    let pendingInSetup = false
    let lazy!: AsyncData<string>
    await show(defineComponent({
      setup() {
        lazy = useAsyncData<string>('detail', lazyHandler, {lazy: true})
        callsInSetup = lazyHandler.mock.calls.length
        pendingInSetup = lazy.pending.value
        return () => null
      },
    }))

    await vi.waitFor(() => expect(lazy.data.value).toBe('after'))
    expect(callsInSetup).toBe(0)
    expect(pendingInSetup).toBe(true)
    expect(lazyHandler).toHaveBeenCalledTimes(1)
    expect(previousHandler).toHaveBeenCalledTimes(1)

    app.unmount()
    el.remove()
  })
})
