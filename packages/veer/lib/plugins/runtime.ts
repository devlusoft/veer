import {type App, type InjectionKey} from 'vue'
import type {Router} from 'vue-router'
import {
    type VeerState,
    type RuntimeConfig,
} from '../runtime'
import {
    VEER_APP_INJECTION_KEY,
    tryUseVeerApp,
} from '../runtime/app-context'

export {tryUseVeerApp} from '../runtime/app-context'

export interface VeerApp {
    vueApp: App
    router: Router
    ssrContext?: Record<string, unknown>
    config: RuntimeConfig
    state: VeerState
    payload: { state: VeerState }
    _asyncData?: Map<string, unknown>
    hook: <N extends keyof VeerAppHooks>(name: N, fn: VeerAppHooks[N]) => void
    removeHook: <N extends keyof VeerAppHooks>(name: N, fn: VeerAppHooks[N]) => void
    hookOnce: <N extends keyof VeerAppHooks>(name: N, fn: VeerAppHooks[N]) => void
    callHook: <N extends keyof VeerAppHooks>(
        name: N,
        ...args: Parameters<VeerAppHooks[N]>
    ) => Promise<void>
}

const VEER_APP_KEY: InjectionKey<VeerApp> = VEER_APP_INJECTION_KEY

export interface VeerAppHooks {
    'app:created': () => void | Promise<void>
    'app:mounted': () => void | Promise<void>
    'page:start': () => void | Promise<void>
    'page:finish': () => void | Promise<void>
    'page:loading:start': () => void | Promise<void>
    'page:loading:end': () => void | Promise<void>
}

export interface VeerPluginObject {
    setup: (veerApp: VeerApp) => void | Promise<void>
    parallel?: boolean
}

export type VeerPlugin =
    | VeerPluginObject
    | ((veerApp: VeerApp) => void | Promise<void>)

export function defineVeerPlugin(plugin: VeerPlugin): VeerPlugin {
    return plugin
}

class Hookable {
    private hooks: { [K in keyof VeerAppHooks]?: Array<VeerAppHooks[K]> } = {}

    add<N extends keyof VeerAppHooks>(name: N, fn: VeerAppHooks[N]): void {
        if (!this.hooks[name]) {
            this.hooks[name] = []
        }
        this.hooks[name]!.push(fn)
    }

    remove<N extends keyof VeerAppHooks>(name: N, fn: VeerAppHooks[N]): void {
        const arr = this.hooks[name]
        if (!arr) return
        const idx = arr.indexOf(fn)
        if (idx >= 0) arr.splice(idx, 1)
    }

    count<N extends keyof VeerAppHooks>(name: N): number {
        return this.hooks[name]?.length ?? 0
    }

    once<N extends keyof VeerAppHooks>(name: N, fn: VeerAppHooks[N]): void {
        const wrapped = ((...args: unknown[]) => {
            this.remove(name, wrapped as VeerAppHooks[N])
            return (fn as (...a: unknown[]) => unknown)(...args)
        }) as VeerAppHooks[N]
        this.add(name, wrapped)
    }

    async call<N extends keyof VeerAppHooks>(
        name: N,
        ...args: Parameters<VeerAppHooks[N]>
    ): Promise<void> {
        const fns = this.hooks[name] ?? []
        for (const fn of fns) {
            await (fn as (...a: unknown[]) => void | Promise<void>)(...args)
        }
    }
}

const VEER_STATE_KEY: InjectionKey<VeerState> = Symbol('@devlusoft/veer-state')

interface CreateVeerAppOptions {
    vueApp: App
    router: Router
    ssrContext?: Record<string, unknown>
    config: RuntimeConfig
    state: VeerState
}


const hookables = new WeakMap<VeerApp, Hookable>()

export function getHookListenerCount<N extends keyof VeerAppHooks>(
    veerApp: VeerApp,
    name: N,
): number {
    return hookables.get(veerApp)?.count(name) ?? 0
}

export function createVeerApp(options: CreateVeerAppOptions): VeerApp {
    const hooks = new Hookable()
    const state = options.state
    const veerApp: VeerApp = {
        vueApp: options.vueApp,
        router: options.router,
        ssrContext: options.ssrContext,
        config: options.config,
        state,
        payload: {state},
        hook: (name, fn) => hooks.add(name, fn),
        removeHook: (name, fn) => hooks.remove(name, fn),
        hookOnce: (name, fn) => hooks.once(name, fn),
        callHook: (name, ...args) => hooks.call(name, ...args),
    }
    hookables.set(veerApp, hooks)
    options.vueApp.provide(VEER_APP_KEY, veerApp)
    ;(options.vueApp as App & { $veer?: VeerApp }).$veer = veerApp
    options.vueApp.provide(VEER_STATE_KEY, state)
    return veerApp
}

export function runWithVeerApp<T>(veerApp: VeerApp, fn: () => T): Promise<T> {
    return veerApp.vueApp.runWithContext(fn) as Promise<T>
}

export function useVeerApp(): VeerApp {
    const veerApp = tryUseVeerApp()
    if (!veerApp) {
        throw new Error(
            '[veer] useVeerApp() must be called inside a Veer plugin or setup function.',
        )
    }
    return veerApp
}

export async function runPlugins(
    plugins: VeerPlugin[],
    veerApp: VeerApp,
): Promise<void> {
    for (const plugin of plugins) {
        const setup = typeof plugin === 'function' ? plugin : plugin.setup
        await setup(veerApp)
    }
}

export type VeerAppHolder = { veerApp?: VeerApp }
