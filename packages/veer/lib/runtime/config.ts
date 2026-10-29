import { hasInjectionContext, inject, type App, type InjectionKey } from 'vue'
import type { RuntimeConfig } from '../config/runtime-config'

export type { RuntimeConfig }

const VEER_RUNTIME_CONFIG_KEY: InjectionKey<RuntimeConfig> =
  Symbol('@devlusoft/veer/runtime-config')

export const EMPTY: RuntimeConfig = { public: {} }

export function useRuntimeConfig(): RuntimeConfig {
  if (hasInjectionContext()) {
    return inject(VEER_RUNTIME_CONFIG_KEY, EMPTY)
  }
  return EMPTY
}

export function provideRuntimeConfig(app: App, config: RuntimeConfig): void {
  app.provide(VEER_RUNTIME_CONFIG_KEY, config)
}
