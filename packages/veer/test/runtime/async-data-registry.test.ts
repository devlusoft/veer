import {describe, expect, it} from 'vitest'
import {createSSRApp, defineComponent} from 'vue'
import {createVeerApp, createVeerState} from '../../lib'
import type {VeerSSRContext} from '../../lib/types/ssr-context'
import {createAsyncDataRegistry, type NewAsyncDataEntry} from '../../lib/runtime/async-data-registry'

function setupRegistry() {
  const veerApp = createVeerApp({
    vueApp: createSSRApp(defineComponent({render: () => null})),
    router: {} as any,
    config: {public: {}},
    ssrContext: undefined as unknown as VeerSSRContext,
    state: createVeerState(),
  })
  return createAsyncDataRegistry(veerApp)
}

const newEntry = () => ({}) as NewAsyncDataEntry<unknown>

describe('createAsyncDataRegistry', () => {
  it('keeps the entry while a consumer still holds it', () => {
    const registry = setupRegistry()
    const first = registry.acquire('k', newEntry)
    registry.acquire('k', newEntry)
    expect(registry.release('k', first.entry)).toEqual({status: 'retained'})

    expect(registry.acquire('k', newEntry).status).toBe('shared')
  })

  it('drops the entry when the last consumer releases it', () => {
    const registry = setupRegistry()
    const first = registry.acquire('k', newEntry)
    const second = registry.acquire('k', newEntry)
    registry.release('k', first.entry)
    expect(registry.release('k', second.entry)).toEqual({status: 'dropped'})

    expect(registry.acquire('k', newEntry).status).toBe('created')
  })
})