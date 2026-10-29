// @vitest-environment happy-dom
import { nextTick, defineComponent, h, createApp, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { VeerPage, createVeerApp, createVeerState } from '../../lib'
import { getHookListenerCount } from '../../lib/plugins/runtime'
import { isCurrentNavigationResolved, markCurrentNavigationResolved } from '../../lib/runtime/page-loading'

const Page = defineComponent({
  name: 'PlainPage',
  setup() {
    return () => h('div', 'page')
  },
})

describe('VeerPage page:start listener', () => {
  it('removes the listener on unmount and does not duplicate it after remount', async () => {
    const show = ref(true)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: Page }],
    })
    const app = createApp({
      name: 'VeerPageHarness',
      setup() {
        return () => (show.value ? h(VeerPage) : null)
      },
    })
    const veerApp = createVeerApp({
      vueApp: app,
      router,
      config: { public: {} },
      state: createVeerState(),
    })
    app.use(router)
    await router.push('/')
    const el = document.createElement('div')
    document.body.appendChild(el)
    app.mount(el)
    await nextTick()
    expect(getHookListenerCount(veerApp, 'page:start')).toBe(1)

    show.value = false
    await nextTick()
    expect(getHookListenerCount(veerApp, 'page:start')).toBe(0)
    markCurrentNavigationResolved(veerApp)
    await veerApp.callHook('page:start')
    expect(isCurrentNavigationResolved(veerApp)).toBe(true)

    show.value = true
    await nextTick()
    expect(getHookListenerCount(veerApp, 'page:start')).toBe(1)
    markCurrentNavigationResolved(veerApp)
    await veerApp.callHook('page:start')
    expect(isCurrentNavigationResolved(veerApp)).toBe(false)
    expect(getHookListenerCount(veerApp, 'page:start')).toBe(1)

    show.value = false
    await nextTick()
    expect(getHookListenerCount(veerApp, 'page:start')).toBe(0)

    app.unmount()
    el.remove()
  })
})
