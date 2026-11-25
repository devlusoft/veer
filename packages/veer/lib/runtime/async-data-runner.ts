import { tryUseVeerApp } from './app-context'
import { serializeAsyncDataError } from './async-data-payload'
import type { VeerApp } from '../plugins/runtime'
import type { VeerSSRContext } from '../types/ssr-context'
import type { AsyncDataEntry, AsyncDataHandler } from './use-async-data'

export interface AsyncDataRunner {
  run(key: string): Promise<void>
}

async function runWithRetries<T>(
  handler: AsyncDataHandler<T>,
  veerApp: VeerApp,
  signal: AbortSignal,
  retries: number,
  delay: number
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await handler(veerApp, {signal})
    } catch (err) {
      lastError = err
      if (signal.aborted) throw err
      if (attempt < retries && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

export function createAsyncDataRunner<T>(
  entry: AsyncDataEntry<T>,
  handler: AsyncDataHandler<T>,
  ssrContext: VeerSSRContext | undefined
): AsyncDataRunner {
  const isClient = typeof window !== 'undefined'

  async function execute(key: string, signal: AbortSignal): Promise<void> {
    const execVeerApp = !isClient ? tryUseVeerApp() : null
    const exec = (): Promise<T> => {
      const callHandler = () => runWithRetries<T>(handler, execVeerApp as VeerApp, signal, entry._retries, entry._retryDelay)
      return execVeerApp && !isClient ? execVeerApp.vueApp.runWithContext(callHandler) : callHandler()
    }
    entry.error.value = null
    try {
      const result = await exec()
      if (signal.aborted) return
      entry.data.value = result
      entry.status.value = 'success'
      if (ssrContext) ssrContext.payload[key] = result
    } catch (err) {
      if (signal.aborted) return
      entry.error.value = err instanceof Error ? err : new Error(String(err))
      entry.status.value = 'error'
      if (ssrContext) ssrContext.payload[key] = serializeAsyncDataError(entry.error.value)
    } finally {
      if (!signal.aborted) entry.pending.value = false
      if (ssrContext) ssrContext.pending.delete(key)
    }
  }

  return {
    async run(key: string): Promise<void> {
      entry._abortController?.abort()
      const controller = new AbortController()
      entry._abortController = controller
      const execution = execute(key, controller.signal)
      entry._inflight = execution
      await execution
      if (entry._inflight === execution) {
        entry._inflight = null
        entry._abortController = null
      }
      while (entry._inflight) await entry._inflight
    },
  }
}
