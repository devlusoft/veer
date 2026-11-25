import {
  computed,
  getCurrentInstance,
  getCurrentScope,
  isRef,
  nextTick,
  onMounted,
  onScopeDispose,
  onServerPrefetch,
  ref,
  type Ref,
  shallowRef,
  toValue,
  watch,
  type WatchSource,
} from 'vue'
import { getSSRContext, tryUseVeerApp } from './app-context'
import type { VeerApp } from '../plugins/runtime'
import { type HydratedAsyncData, readHydratedAsyncData } from './async-data-payload'
import { createAsyncDataRegistry, type NewAsyncDataEntry } from './async-data-registry'
import { createAsyncDataRunner, type AsyncDataRunner } from './async-data-runner'

export type AsyncDataKey = string | Ref<string> | (() => string)

export interface AsyncDataHandlerOptions {
  signal: AbortSignal
}

export type AsyncDataHandler<T> = (
  veerApp: VeerApp,
  options: AsyncDataHandlerOptions,
) => Promise<T>

export interface UseAsyncDataOptions<T> {
  default?: () => T | Ref<T>
  server?: boolean
  lazy?: boolean
  retryCount?: number
  retryDelayMs?: number
  watch?: WatchSource | WatchSource[]
}

export interface UseAsyncDataReturn<T> {
  data: Ref<T | null>
  pending: Ref<boolean>
  error: Ref<Error | null>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
  refresh: () => Promise<void>
}

export type AsyncData<T> = UseAsyncDataReturn<T> & Promise<UseAsyncDataReturn<T>>

function createAsyncData<T>(value: UseAsyncDataReturn<T>, pending: Promise<void> | null): AsyncData<T> {
  return Object.assign(Promise.resolve(pending ?? undefined).then(() => value), value)
}

type Status = UseAsyncDataReturn<unknown>['status']['value']

export interface AsyncDataEntry<T = unknown> {
  key: string
  data: Ref<T | null>
  pending: Ref<boolean>
  error: Ref<Error | null>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
  _handlerSource: string
  _defaultSource: string
  _optionsHash: string
  _server: boolean
  _lazy: boolean
  _retries: number
  _retryDelay: number
  _deps: number
  _inflight: Promise<void> | null
  _abortController: AbortController | null
}

function hashOptions(opts: UseAsyncDataOptions<unknown>): string {
  return JSON.stringify({
    server: opts.server !== false,
    lazy: !!opts.lazy,
    retryCount: Math.max(0, opts.retryCount ?? 0),
    retryDelayMs: Math.max(0, opts.retryDelayMs ?? 0),
  })
}

function warnIfIncompatible(entry: AsyncDataEntry, options: UseAsyncDataOptions<unknown>, handler: AsyncDataHandler<unknown>, key: string): void {
  if (import.meta.env?.DEV || import.meta.env?.MODE !== 'production') {
    const handlerSource = handler.toString()
    const defaultSource = options.default ? options.default.toString() : ''
    const warnings: string[] = []
    if (handlerSource !== entry._handlerSource) warnings.push('different `handler`')
    if (defaultSource !== entry._defaultSource) warnings.push('different `default` value')
    if (hashOptions(options) !== entry._optionsHash) warnings.push('different options (server/lazy/retry*)')
    if (warnings.length) {
      console.warn(`[veer] useAsyncData("${key}") was called with ${warnings.join(', ')} than the first consumer. Reusing existing entry — if this is intentional, ignore; otherwise prefer a unique key or align the call sites.`)
    }
  }
}

function applyHydratedAsyncData<T>(entry: AsyncDataEntry<T>, hydrated: HydratedAsyncData<T>): void {
  switch (hydrated.status) {
    case 'missing':
      return
    case 'success':
      entry.data.value = hydrated.data
      entry.status.value = 'success'
      return
    case 'error':
      entry.error.value = hydrated.error
      entry.status.value = 'error'
      return
    default: {
      return hydrated
    }
  }
}

interface AsyncDataBinding<T> {
  key: string
  entry: AsyncDataEntry<T>
  runner: AsyncDataRunner
}

function followRef<V>(source: () => Ref<V>): Ref<V> {
  return computed({
    get: () => source().value,
    set: (value) => {
      source().value = value
    },
  })
}

export function useAsyncData<T>(key: AsyncDataKey, handler: AsyncDataHandler<T>, options: UseAsyncDataOptions<T> = {}): AsyncData<T> {
  if (!key) throw new Error('[veer] useAsyncData: `key` is required')

  const isClient = typeof window !== 'undefined'
  const ssrContext = getSSRContext()
  const ssrDisabled = ssrContext?.routeRules?.ssr === false
  const runOnServer = !isClient && ssrContext !== undefined && options.server !== false && !ssrDisabled

  const keyRef = computed(() => toValue(key))
  const resolvedKey = String(keyRef.value)

  const registry = createAsyncDataRegistry(tryUseVeerApp())
  const createEntry = (entryKey: string): NewAsyncDataEntry<T> => ({
    key: entryKey,
    data: shallowRef<T | null>(null) as Ref<T | null>,
    pending: ref(!!options.lazy),
    error: shallowRef<Error | null>(null),
    status: ref<Status>('idle'),
    _handlerSource: handler.toString(),
    _defaultSource: options.default ? options.default.toString() : '',
    _optionsHash: hashOptions(options),
    _server: options.server !== false,
    _lazy: !!options.lazy,
    _retries: Math.max(0, options.retryCount ?? 0),
    _retryDelay: Math.max(0, options.retryDelayMs ?? 0),
    _inflight: null,
    _abortController: null,
  })
  const acquired = registry.acquire<T>(resolvedKey, () => createEntry(resolvedKey))
  const entry = acquired.entry
  if (acquired.status === 'shared') {
    warnIfIncompatible(entry as AsyncDataEntry<unknown>, options, handler as AsyncDataHandler<unknown>, resolvedKey)
  }

  const runner = createAsyncDataRunner(entry, handler, ssrContext)
  const current = shallowRef<AsyncDataBinding<T>>({key: resolvedKey, entry, runner})

  if (isClient && acquired.status === 'created') {
    if (entry._lazy) {
      onMounted(() => {
        const hydrated = readHydratedAsyncData<T>(resolvedKey)
        if (hydrated.status === 'missing') {
          entry.status.value = 'pending'
          void runner.run(resolvedKey)
          return
        }
        applyHydratedAsyncData(entry, hydrated)
        entry.pending.value = false
      })
    } else {
      applyHydratedAsyncData(entry, readHydratedAsyncData<T>(resolvedKey))
    }
  }

  if (entry.data.value === null && options.default && acquired.status === 'created') {
    const d = options.default()
    entry.data.value = (isRef(d) ? d.value : d) as T
  }

  if (entry.status.value === 'idle' && runOnServer && acquired.status === 'created') {
    if (entry._lazy) {
      const handlerPromise = runner.run(resolvedKey)
      if (ssrContext) ssrContext.pending.set(resolvedKey, handlerPromise)
    } else {
      entry.pending.value = true
      entry.status.value = 'pending'
      const handlerPromise = runner.run(resolvedKey)
      if (ssrContext) ssrContext.pending.set(resolvedKey, handlerPromise)
      if (getCurrentInstance()) {
        onServerPrefetch(() => handlerPromise)
      }
    }
  }

  if (entry.status.value === 'idle' && isClient && !entry._lazy && acquired.status === 'created') {
    entry.pending.value = true
    entry.status.value = 'pending'
    if (ssrContext) {
      ssrContext.pending.set(resolvedKey, runner.run(resolvedKey))
    } else {
      void runner.run(resolvedKey)
    }
  }

  if (isClient) {
    let keyChanging = false
    const hasScope = !!getCurrentScope()
    let stopKeyWatch: (() => void) | undefined
    let stopDepsWatch: (() => void) | undefined

    if (isRef(key) || typeof key === 'function') {
      stopKeyWatch = watch(keyRef, async (newKey) => {
        const previous = current.value
        if (newKey === previous.key) return
        keyChanging = true
        try {
          const released = registry.release(previous.key, previous.entry)
          if (released.status === 'dropped') previous.entry._abortController?.abort()

          const next = registry.acquire<T>(newKey, () => createEntry(newKey))
          const nextRunner = createAsyncDataRunner(next.entry, handler, ssrContext)
          current.value = {key: newKey, entry: next.entry, runner: nextRunner}
          if (next.status === 'shared') return

          next.entry.pending.value = true
          next.entry.status.value = 'pending'
          await nextRunner.run(newKey)
        } finally {
          await nextTick()
          keyChanging = false
        }
      }, {flush: 'sync'})
    }

    if (options.watch !== undefined) {
      stopDepsWatch = watch(options.watch, () => {
        if (keyChanging) return
        const {key: currentKey, entry: currentEntry, runner: currentRunner} = current.value
        currentEntry.pending.value = true
        currentEntry.status.value = 'pending'
        if (ssrContext) {
          ssrContext.pending.set(currentKey, currentRunner.run(currentKey))
        } else {
          void currentRunner.run(currentKey)
        }
      })
    }

    if (hasScope) {
      onScopeDispose(() => {
        stopKeyWatch?.()
        stopDepsWatch?.()
        const {key: currentKey, entry: currentEntry} = current.value
        const released = registry.release(currentKey, currentEntry)
        if (released.status === 'dropped') currentEntry._abortController?.abort()
      })
    }
  }

  const refresh = async (): Promise<void> => {
    await current.value.runner.run(current.value.key)
  }

  return createAsyncData({
    data: followRef(() => current.value.entry.data),
    pending: followRef(() => current.value.entry.pending),
    error: followRef(() => current.value.entry.error),
    status: followRef(() => current.value.entry.status),
    refresh,
  }, entry._inflight)
}
