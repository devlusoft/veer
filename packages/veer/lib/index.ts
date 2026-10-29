/// <reference path="./virtual-modules.d.ts" />

export { defineConfig, type VeerConfig, type VeerConfigInput } from './config/define-config'
export { useHead } from '@unhead/vue'
export * from './head'
export {
  defineVeerRouteMiddleware,
  navigateTo,
  abortNavigation,
  type RouteMiddleware,
  type NavigateToOptions,
  type AbortNavigationOptions
} from './middleware/runtime'
export { definePage, type PageMeta } from './pages/runtime'
export {
  useAsyncData,
  setHydratedPayload,
  type UseAsyncDataOptions,
  type UseAsyncDataReturn,
  type AsyncData,
} from './runtime'
export {
  createError,
  isVeerError,
  serializeError,
  deserializeError,
  showError,
  useError,
  clearError,
  type VeerError,
  type VeerErrorPayload,
} from './runtime/error'
export {
  $fetch,
  createFetch,
  FetchError,
  type $Fetch,
  type CreateFetchOptions,
  type FetchOptions,
  type FetchContext,
  type FetchResponse,
  type FetchRequest,
} from './runtime/fetch'
export { useFetch, type UseFetchOptions, type UseFetchReturn, type UseFetchError } from './runtime/use-fetch'
export { provideBaseURL, useBaseURL, resetBaseURLCache } from './runtime/base-url'
export {
  useRuntimeConfig,
  provideRuntimeConfig,
  type RuntimeConfig,
} from './runtime/config'
export {
  defineVeerPlugin,
  createVeerApp,
  runPlugins,
  runWithVeerApp,
  useVeerApp,
  tryUseVeerApp,
  type VeerApp,
  type VeerPlugin,
  type VeerAppHooks,
} from './plugins/runtime'
export { useLoadingIndicator, type LoadingIndicator } from './runtime/use-loading-indicator'
export { default as VeerLoadingIndicator } from './components/veer-loading-indicator'
export { useState, createVeerState, clearVeerState, type VeerState } from './runtime/state'
export { useCookie, parseCookieValue, serializeCookie, type CookieOptions } from './runtime/cookie'
export { useRequestEvent, useRequestHeaders, useRequestURL } from './runtime/request'
export { default as VeerPage } from './components/veer-page'
export { createPageScrollBehavior } from './runtime/page-scroll'
