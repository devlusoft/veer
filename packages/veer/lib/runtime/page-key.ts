import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

export function getPageKey(router: Router, route: RouteLocationNormalizedLoaded): string {
  if (route.name == null) return route.path
  return router.resolve({ name: route.name, params: route.params }).path
}
