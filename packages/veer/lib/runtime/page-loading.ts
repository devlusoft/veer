import type { VeerApp } from '../plugins/runtime'

const NAVIGATION_RESOLVED = Symbol.for('@devlusoft/veer/navigation-resolved')

type NavigationFlag = VeerApp & { [NAVIGATION_RESOLVED]?: boolean }

export function markCurrentNavigationResolved(veerApp: VeerApp): void {
  ;(veerApp as NavigationFlag)[NAVIGATION_RESOLVED] = true
}

export function resetCurrentNavigationResolved(veerApp: VeerApp): void {
  ;(veerApp as NavigationFlag)[NAVIGATION_RESOLVED] = false
}

export function isCurrentNavigationResolved(veerApp: VeerApp): boolean {
  return (veerApp as NavigationFlag)[NAVIGATION_RESOLVED] === true
}
