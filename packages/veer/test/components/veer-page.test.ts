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

describe('VeerPage page key', () => {
  it('remounts the page when only a route param changes', async () => {
    let setups = 0
    const ParamPage = defineComponent({
      name: 'ParamPage',
      setup() {
        setups += 1
        return () => h('div', 'param page')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/productos/:id', name: 'productos-id', component: ParamPage }],
    })
    const app = createApp({
      name: 'VeerPageHarness',
      setup() {
        return () => h(VeerPage)
      },
    })
    createVeerApp({
      vueApp: app,
      router,
      config: { public: {} },
      state: createVeerState(),
    })
    app.use(router)
    await router.push('/productos/1')
    const el = document.createElement('div')
    document.body.appendChild(el)
    app.mount(el)
    await nextTick()
    expect(setups).toBe(1)

    await router.push('/productos/2')
    await nextTick()
    expect(setups).toBe(2)

    app.unmount()
    el.remove()
  })

  it('does not remount the page when only the query changes', async () => {
    let setups = 0
    const ParamPage = defineComponent({
      name: 'ParamPage',
      setup() {
        setups += 1
        return () => h('div', 'param page')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/productos/:id', name: 'productos-id', component: ParamPage }],
    })
    const app = createApp({
      name: 'VeerPageHarness',
      setup() {
        return () => h(VeerPage)
      },
    })
    createVeerApp({
      vueApp: app,
      router,
      config: { public: {} },
      state: createVeerState(),
    })
    app.use(router)
    await router.push('/productos/1?orden=precio')
    const el = document.createElement('div')
    document.body.appendChild(el)
    app.mount(el)
    await nextTick()
    expect(setups).toBe(1)

    await router.push('/productos/1?orden=nombre')
    await nextTick()
    expect(setups).toBe(1)

    app.unmount()
    el.remove()
  })

  it('mounts the new page when navigating between different routes', async () => {
    let productSetups = 0
    let aboutSetups = 0
    const ProductPage = defineComponent({
      name: 'ProductPage',
      setup() {
        productSetups += 1
        return () => h('div', 'product page')
      },
    })
    const AboutPage = defineComponent({
      name: 'AboutPage',
      setup() {
        aboutSetups += 1
        return () => h('div', 'about page')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/productos/:id', name: 'productos-id', component: ProductPage },
        { path: '/about', name: 'about', component: AboutPage },
      ],
    })
    const app = createApp({
      name: 'VeerPageHarness',
      setup() {
        return () => h(VeerPage)
      },
    })
    createVeerApp({
      vueApp: app,
      router,
      config: { public: {} },
      state: createVeerState(),
    })
    app.use(router)
    await router.push('/productos/1')
    const el = document.createElement('div')
    document.body.appendChild(el)
    app.mount(el)
    await nextTick()
    expect(productSetups).toBe(1)
    expect(aboutSetups).toBe(0)

    await router.push('/about')
    await nextTick()
    expect(productSetups).toBe(1)
    expect(aboutSetups).toBe(1)
    expect(el.textContent).toContain('about page')

    app.unmount()
    el.remove()
  })

  it('emits the same loading events for a param change as for a change between different routes', async () => {
    const Page = defineComponent({
      name: 'LoadingPage',
      setup() {
        return () => h('div', 'page')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/productos/:id', name: 'productos-id', component: Page },
        { path: '/about', name: 'about', component: Page },
      ],
    })
    const app = createApp({
      name: 'VeerPageHarness',
      setup() {
        return () => h(VeerPage)
      },
    })
    const veerApp = createVeerApp({
      vueApp: app,
      router,
      config: { public: {} },
      state: createVeerState(),
    })
    let starts = 0
    let ends = 0
    veerApp.hook('page:loading:start', () => {
      starts += 1
    })
    veerApp.hook('page:loading:end', () => {
      ends += 1
    })
    const navigate = async (to: string) => {
      starts = 0
      ends = 0
      await router.push(to)
      await nextTick()
      return { starts, ends }
    }

    app.use(router)
    await router.push('/productos/1')
    const el = document.createElement('div')
    document.body.appendChild(el)
    app.mount(el)
    await nextTick()

    const paramChange = await navigate('/productos/2')
    const routeChange = await navigate('/about')
    expect(paramChange.starts).toBeGreaterThan(0)
    expect(paramChange).toEqual(routeChange)

    app.unmount()
    el.remove()
  })
})
