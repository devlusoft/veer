import type { Plugin } from 'vite'

interface VeerDevStyleSSRPluginOptions {
  root: string
}

export function VeerDevStyleSSRPlugin(opts: VeerDevStyleSSRPluginOptions): Plugin {
  return {
    name: 'veer:dev-style-ssr',
    apply: 'serve',
    enforce: 'post',
    applyToEnvironment(env) {
      return env.name === 'client'
    },
    transform(code, id) {
      if (!id.endsWith('.css')) return null
      if (!code.includes('import.meta.hot')) return null

      let moduleId = id
      if (moduleId.startsWith(opts.root)) {
        moduleId = moduleId.slice(opts.root.length)
      }
      moduleId = moduleId.replace(/\\/g, '/')

      const selectors = [`/@fs${moduleId}`, moduleId].map(s => `link[rel="stylesheet"][href$="${s}"]`).join(',')
      const script = `\n;if(typeof document!=='undefined'){document.querySelectorAll('${selectors}').forEach(i=>i.remove())}`
      return { code: code + script, map: null }
    },
  }
}