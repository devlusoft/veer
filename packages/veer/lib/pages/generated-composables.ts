export function generateNavigateTo(): string {
  return `import { navigateTo as _navigateTo, type NavigateToOptions } from '@devlusoft/veer'
import type { VeerRouteLocationRaw } from '../typed-router'

export function navigateTo(to: VeerRouteLocationRaw, options?: NavigateToOptions) {
  return _navigateTo(to as any, options)
}
`
}

export function generateUseRoute(): string {
  return `import { useRoute as _useRoute } from 'vue-router'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { RouteNamedMap } from '../typed-router'

export type VeerRoute<Name extends keyof RouteNamedMap> = RouteLocationNormalizedLoaded & {
  name: Name
  params: RouteNamedMap[Name] extends { params: infer P } ? P : never
}

export function useVeerRoute<Name extends keyof RouteNamedMap = keyof RouteNamedMap>(
  name?: Name,
): VeerRoute<Name> {
  return _useRoute(name as never) as VeerRoute<Name>
}
`
}
