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

  async function execute(key: string): Promise<void> {
    const execVeerApp = !isClient ? tryUseVeerApp() : null
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
      if (ssrContext) ssrContext.payload[key] = result
    } catch (err) {
      entry.error.value = err instanceof Error ? err : new Error(String(err))
      entry.status.value = 'error'
      if (ssrContext) ssrContext.payload[key] = serializeAsyncDataError(entry.error.value)
    } finally {
      entry.pending.value = false
      if (ssrContext) ssrContext.pending.delete(key)
    }
  }

  return {
    async run(key: string): Promise<void> {
      if (entry._inflight) {
        await entry._inflight
        return
      }
      entry._inflight = execute(key).finally(() => {
        entry._inflight = null
      })
      await entry._inflight
    },
  }
}
