import type { VeerApp } from '../plugins/runtime'
import type { AsyncDataEntry } from './use-async-data'

export type NewAsyncDataEntry<T> = Omit<AsyncDataEntry<T>, '_deps' | '_navigation'>

export type AcquireAsyncDataEntry<T> =
  | { status: 'created'; entry: AsyncDataEntry<T> }
  | { status: 'shared'; entry: AsyncDataEntry<T> }
  | { status: 'stale'; entry: AsyncDataEntry<T> }

export type ReleaseAsyncDataEntry =
  | { status: 'retained' }
  | { status: 'dropped' }

export interface AsyncDataRegistry {
  acquire<T>(key: string, create: () => NewAsyncDataEntry<T>): AcquireAsyncDataEntry<T>
  release<T>(key: string, entry: AsyncDataEntry<T>): ReleaseAsyncDataEntry
  advanceNavigation(): void
}

function entriesOf(app: VeerApp | null): Map<string, AsyncDataEntry> {
  if (!app) return new Map()
  if (!app._asyncData) app._asyncData = new Map()
  return app._asyncData as Map<string, AsyncDataEntry>
}

function navigationOf(app: VeerApp | null): number {
  return app?._asyncDataNavigation ?? 0
}

export function createAsyncDataRegistry(app: VeerApp | null): AsyncDataRegistry {
  const entries = entriesOf(app)
  return {
    acquire<T>(key: string, create: () => NewAsyncDataEntry<T>): AcquireAsyncDataEntry<T> {
      const existing = entries.get(key) as AsyncDataEntry<T> | undefined
      if (existing) {
        existing._deps += 1
        if (existing._navigation === navigationOf(app)) {
          return {status: 'shared', entry: existing}
        }
        existing._navigation = navigationOf(app)
        return {status: 'stale', entry: existing}
      }
      const entry: AsyncDataEntry<T> = {...create(), _deps: 1, _navigation: navigationOf(app)}
      entries.set(key, entry as unknown as AsyncDataEntry)
      return {
        status: 'created',
        entry
      }
    },
    release<T>(key: string, entry: AsyncDataEntry<T>): ReleaseAsyncDataEntry {
      if (entries.get(key) !== entry) return {status: 'retained'}
      entry._deps -= 1
      if (entry._deps > 0) return {status: 'retained'}
      entries.delete(key)
      return {status: 'dropped'}
    },
    advanceNavigation(): void {
      if (!app) return
      app._asyncDataNavigation = navigationOf(app) + 1
    },
  }
}

export function advanceAsyncDataNavigation(app: VeerApp): void {
  createAsyncDataRegistry(app).advanceNavigation()
}
