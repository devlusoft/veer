import type { SSRContext } from 'vue/server-renderer'
import { VeerApp, VeerError } from '../runtime'
import { createStreamableHead } from '@unhead/vue/stream/server'
import { RouteRules } from '../pages/scanner'
import type { RuntimeConfig } from '../config/runtime-config'

export interface VeerSSRContext extends SSRContext {
  url: string
  modules: Set<string>
  request?: Request
  _renderResponse?: Response
  _spa?: boolean
  error?: VeerError | null
  head?: ReturnType<typeof createStreamableHead>['head']
  veerApp?: VeerApp
  payload: Record<string, unknown>
  pending: Map<string, Promise<unknown>>
  awaitAll: () => Promise<void>
  routeRules?: RouteRules
  runtimeConfig: RuntimeConfig
}