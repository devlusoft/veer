import type { VeerApp } from '../plugins/runtime'
import type { AsyncDataEntry } from './use-async-data'

export type NewAsyncDataEntry<T> = Omit<AsyncDataEntry<T>, '_deps'>

export type AcquireAsyncDataEntry<T> =
  | { status: 'created'; entry: AsyncDataEntry<T> }
  | { status: 'shared'; entry: AsyncDataEntry<T> }

export interface AsyncDataRegistry {
  acquire<T>(key: string, create: () => NewAsyncDataEntry<T>): AcquireAsyncDataEntry<T>
  release<T>(key: string, entry: AsyncDataEntry<T>): void
}

function entriesOf(app: VeerApp | null): Map<string, AsyncDataEntry> {
  if (!app) return new Map()
  if (!app._asyncData) app._asyncData = new Map()
  return app._asyncData as Map<string, AsyncDataEntry>
}

export function createAsyncDataRegistry(app: VeerApp | null): AsyncDataRegistry {
  const entries = entriesOf(app)
  return {
    acquire<T>(key: string, create: () => NewAsyncDataEntry<T>): AcquireAsyncDataEntry<T> {
      const existing = entries.get(key) as AsyncDataEntry<T> | undefined
      if (existing) {
        existing._deps += 1
        return {
          status: 'shared',
          entry: existing
        }
      }
      const entry: AsyncDataEntry<T> = {...create(), _deps: 1}
      entries.set(key, entry as unknown as AsyncDataEntry)
      return {
        status: 'created',
        entry
      }
    },
    release<T>(key: string, entry: AsyncDataEntry<T>): void {
      if (entries.get(key) !== entry) return
      entry._deps -= 1
      if (entry._deps === 0) entries.delete(key)
    }
  }
}
