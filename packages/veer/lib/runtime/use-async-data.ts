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
import { type HydratedAsyncData, readHydratedAsyncData, serializeAsyncDataError } from './async-data-payload'
import { createAsyncDataRegistry } from './async-data-registry'

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

async function runWithRetries<T>(
  handler: AsyncDataHandler<T>,
  veerApp: VeerApp,
  signal: AbortSignal,
  retries: number,
  delay: number,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await handler(veerApp, {signal})
    } catch (err) {
      lastError = err
      if (attempt < retries && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
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

export function useAsyncData<T>(key: AsyncDataKey, handler: AsyncDataHandler<T>, options: UseAsyncDataOptions<T> = {}): AsyncData<T> {
  if (!key) throw new Error('[veer] useAsyncData: `key` is required')

  const isClient = typeof window !== 'undefined'
  const ssrContext = getSSRContext()
  const ssrDisabled = ssrContext?.routeRules?.ssr === false
  const runOnServer = !isClient && ssrContext !== undefined && options.server !== false && !ssrDisabled

  const keyRef = computed(() => toValue(key))
  const resolvedKey = String(keyRef.value)

  const registry = createAsyncDataRegistry(tryUseVeerApp())
  const acquired = registry.acquire<T>(resolvedKey, () => ({
    key: resolvedKey,
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
  }))
  const entry = acquired.entry
  if (acquired.status === 'shared') {
    warnIfIncompatible(entry as AsyncDataEntry<unknown>, options, handler as AsyncDataHandler<unknown>, resolvedKey)
  }

  const runEntry = async (useKey: string): Promise<void> => {
    if (entry._inflight) {
      await entry._inflight
      return
    }
    const execVeerApp = !isClient ? tryUseVeerApp() : null
    const ctx = ssrContext

    const promise = (async () => {
      const abortController = new AbortController()
      const exec = (): Promise<T> => {
        const callHandler = () => runWithRetries<T>(handler, execVeerApp as VeerApp, abortController.signal, entry._retries, entry._retryDelay)
        return execVeerApp && !isClient ? execVeerApp.vueApp.runWithContext(callHandler) : callHandler()
      }
      entry.error.value = null
      try {
        const result = await exec()
        entry.data.value = result
        entry.status.value = 'success'
        if (ctx) ctx.payload[useKey] = result
      } catch (err) {
        entry.error.value = err instanceof Error ? err : new Error(String(err))
        entry.status.value = 'error'
        if (ctx) ctx.payload[useKey] = serializeAsyncDataError(entry.error.value)
      } finally {
        entry.pending.value = false
        if (ctx) ctx.pending.delete(useKey)
      }
    })()

    entry._inflight = promise.finally(() => {
      entry._inflight = null
    })
    await entry._inflight
  }

  if (isClient) {
    if (acquired.status === 'shared') {
      if (entry._deps === 1) {
        onMounted(() => {
          if (entry.status.value === 'idle') {
            entry.pending.value = true
            entry.status.value = 'pending'
            void runEntry(resolvedKey)
          }
        })
      }
    } else if (entry._lazy) {
      onMounted(() => {
        const hydrated = readHydratedAsyncData<T>(resolvedKey)
        if (hydrated.status === 'missing') {
          entry.status.value = 'pending'
          void runEntry(resolvedKey)
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
      const handlerPromise = runEntry(resolvedKey)
      if (ssrContext) ssrContext.pending.set(resolvedKey, handlerPromise)
    } else {
      entry.pending.value = true
      entry.status.value = 'pending'
      const handlerPromise = runEntry(resolvedKey)
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
      ssrContext.pending.set(resolvedKey, runEntry(resolvedKey))
    } else {
      void runEntry(resolvedKey)
    }
  }

  if (isClient) {
    let keyChanging = false
    const hasScope = !!getCurrentScope()
    let stopKeyWatch: (() => void) | undefined
    let stopDepsWatch: (() => void) | undefined

    if (isRef(key) || typeof key === 'function') {
      stopKeyWatch = watch(keyRef, async (newKey) => {
        if (newKey === resolvedKey) return
        keyChanging = true
        try {
          entry.data.value = null
          entry.error.value = null
          entry.pending.value = true
          entry.status.value = 'pending'
          await runEntry(newKey)
        } finally {
          await nextTick()
          keyChanging = false
        }
      }, {flush: 'sync'})
    }

    if (options.watch !== undefined) {
      stopDepsWatch = watch(options.watch, () => {
        if (keyChanging) return
        entry.pending.value = true
        entry.status.value = 'pending'
        if (ssrContext) {
          ssrContext.pending.set(resolvedKey, runEntry(resolvedKey))
        } else {
          void runEntry(resolvedKey)
        }
      })
    }

    if (hasScope) {
      onScopeDispose(() => {
        stopKeyWatch?.()
        stopDepsWatch?.()
        registry.release(resolvedKey, entry)
      })
    }
  }

  const refresh = async (): Promise<void> => {
    await runEntry(resolvedKey)
  }

  return createAsyncData({
    data: entry.data,
    pending: entry.pending,
    error: entry.error,
    status: entry.status,
    refresh,
  }, entry._inflight)
}
