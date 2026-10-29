import type { Ref } from 'vue'
import { isRef, ref } from 'vue'
import { tryUseVeerApp } from './app-context'

export type VeerState = Record<string, Ref<unknown>>

export function useState<T>(key: string, init?: T | (() => T)): Ref<T> {
  if (!key || typeof key !== 'string') {
    throw new TypeError(`[veer] [useState] key must be a non-empty string: ${String(key)}`)
  }

  const app = tryUseVeerApp()
  if (!app) {
    throw new Error(
      '[veer] useState() must be called inside a Veer plugin or setup function, '
      + 'or inside a Vue runWithContext where tryUseVeerApp() can find the active app.',
    )
  }

  const payload = app.payload as { state?: VeerState }
  if (!payload.state) {
    payload.state = {}
  }
  const state = payload.state

  if (!(key in state)) {
    const initialValue: T | undefined = typeof init === 'function' ? (init as () => T)() : init
    state[key] = ref(initialValue) as unknown as Ref
  }

  return state[key] as Ref<T>
}

export function createVeerState(initial: Record<string, unknown> = {}): VeerState {
  const state: VeerState = {}
  for (const [key, value] of Object.entries(initial)) {
    state[key] = isRef(value) ? value : (ref(value) as unknown as Ref)
  }
  return state
}

export function clearVeerState(
  keys?: string | string[] | ((key: string) => boolean),
): void {
  const app = tryUseVeerApp()
  if (!app) return
  const state = app.payload.state
  if (!state) return
  const allKeys = Object.keys(state)
  if (!keys) {
    for (const k of allKeys) delete state[k]
    return
  }
  const predicate =
    typeof keys === 'function'
      ? keys
      : Array.isArray(keys)
        ? (k: string) => keys.includes(k)
        : (k: string) => keys === k
  for (const k of allKeys) {
    if (predicate(k)) delete state[k]
  }
}
