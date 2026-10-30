import { getCurrentInstance, inject, provide, ref, type App, type InjectionKey, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { HTTPError, type ErrorInput } from 'nitro/h3'

export interface VeerErrorPayload {
  statusCode?: number
  statusMessage?: string
  message?: string
  description?: string
  data?: unknown
}

const VEER_ERROR_KEY: InjectionKey<Ref<VeerError | null>> = Symbol('@devlusoft/veer/error')

export class VeerError extends HTTPError {
  readonly description?: string

  constructor(payload: VeerErrorPayload = {}) {
    super(payload.message ?? payload.statusMessage ?? 'An error occurred', {
      status: payload.statusCode,
      statusText: payload.statusMessage,
      data: payload.data,
    } satisfies ErrorInput)
    this.description = payload.description
  }
}

export function isVeerError(err: unknown): err is VeerError {
  return err instanceof VeerError
}

export function serializeError(err: unknown): VeerErrorPayload | null {
  if (!isVeerError(err)) return null
  return {
    statusCode: err.status,
    statusMessage: err.statusText,
    message: err.message,
    description: err.description,
    data: err.data,
  }
}

export function deserializeError(payload: VeerErrorPayload): VeerError {
  return new VeerError(payload)
}

export function createError(payload: VeerErrorPayload | string | Error): VeerError {
  if (payload instanceof VeerError) return payload
  if (typeof payload === 'string') return new VeerError({ statusMessage: payload })
  if (HTTPError.isError(payload)) {
    return new VeerError({
      statusCode: payload.status,
      statusMessage: payload.statusText,
      message: payload.message,
      data: payload.data,
    })
  }
  if (payload instanceof Error) {
    return new VeerError({
      message: payload.message,
      statusMessage: 'Internal Server Error',
      statusCode: 500,
    })
  }
  return new VeerError(payload)
}

export function showError(err: VeerErrorPayload | string | Error): never {
  const veerError = createError(err)
  const instance = getCurrentInstance()
  if (instance) {
    const errorRef = instance.appContext.app.runWithContext(() => inject(VEER_ERROR_KEY, null))
    if (errorRef) {
      errorRef.value = veerError
    }
  }
  throw veerError
}

export function useError(): Ref<VeerError | null> {
  return inject(VEER_ERROR_KEY, ref(null))
}

export function provideError(app: App, error: Ref<VeerError | null>): void {
  app.provide(VEER_ERROR_KEY, error)
}

export function clearError(options: { redirect?: string } = {}): void {
  const error = useError()
  error.value = null
  if (options.redirect) {
    const router = useRouter()
    void router.push(options.redirect)
  }
}
