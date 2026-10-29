import { hasInjectionContext, inject, type InjectionKey } from 'vue'
import type { VeerApp } from '../plugins/runtime'
import type { VeerSSRContext } from '../types/ssr-context'

export const VEER_APP_INJECTION_KEY: InjectionKey<VeerApp> =
  Symbol.for('@devlusoft/veer-app') as unknown as InjectionKey<VeerApp>

export function tryUseVeerApp(): VeerApp | null {
  if (hasInjectionContext()) {
    const fromInject = inject(VEER_APP_INJECTION_KEY, undefined)
    if (fromInject) return fromInject
  }
  if (typeof window === 'undefined') {
    const fromSSR = (globalThis as { __VEER_SSR_CONTEXT__?: VeerSSRContext })
      .__VEER_SSR_CONTEXT__
    if (fromSSR?.veerApp) return fromSSR.veerApp
  }
  return null
}