let hydratedPayload: Record<string, unknown> | null = null

export type HydratedAsyncData<T> =
  | { status: 'missing' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

interface SerializedAsyncDataError {
  __error: string
}

export function setHydratedPayload(payload: Record<string, unknown | null>): void {
  hydratedPayload = payload
}

export function readHydratedKey<T = unknown>(key: string): T | undefined {
  if (!hydratedPayload || !(key in hydratedPayload)) return undefined
  return hydratedPayload[key] as T
}

export function serializeAsyncDataError(error: Error): SerializedAsyncDataError {
  return {
    __error: error.message
  }
}

export function readHydratedAsyncData<T>(key: string): HydratedAsyncData<T> {
  const value = readHydratedKey<unknown>(key)
  if (value === undefined) return {
    status: 'missing'
  }

  if (isSerializedAsyncDataError(value)) return {
    status: 'error',
    error: new Error(String(value.__error))
  }

  return {
    status: 'success',
    data: value as T
  }
}

function isSerializedAsyncDataError(value: unknown): value is { __error: unknown } {
  return value !== null && typeof value === 'object' && '__error' in value
}
