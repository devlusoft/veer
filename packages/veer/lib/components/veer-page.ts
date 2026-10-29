import { defineComponent, h, onUnmounted, Suspense } from 'vue'
import { type RouteLocationNormalizedLoaded, RouterView } from 'vue-router'
import { useVeerApp } from '../plugins/runtime'
import { markCurrentNavigationResolved, resetCurrentNavigationResolved } from '../runtime/page-loading'

export default defineComponent({
  name: 'VeerPage',
  inheritAttrs: false,
  setup(_, { attrs }) {
    const veerApp = useVeerApp()
    let navigationId = 0

    const onPageStart = () => {
      navigationId += 1
      resetCurrentNavigationResolved(veerApp)
    }
    veerApp.hook('page:start', onPageStart)
    onUnmounted(() => {
      veerApp.removeHook('page:start', onPageStart)
    })

    return () => h(RouterView, attrs, {
      default: (routeProps: { Component: any; route: RouteLocationNormalizedLoaded }) => {
        const id = navigationId
        return h(Suspense, {
          suspensible: true,
          onPending: () => {
            void veerApp.callHook('page:loading:start')
          },
          onResolve: () => {
            if (id !== navigationId) return
            markCurrentNavigationResolved(veerApp)
            void veerApp.callHook('page:loading:end')
          }
        }, {
          default: () => h(routeProps.Component)
        })
      }
    })
  }
})