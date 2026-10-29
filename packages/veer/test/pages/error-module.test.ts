import { describe, expect, it } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { default: veerPlugin } = await import('../../lib/plugin') as any

describe('veer error virtual module', () => {
  it('generates fallback when error component is disabled', () => {
    const plugin = veerPlugin({ layouts: [], errorComponent: false })
    const module = plugin.load('\0virtual:veer/error')
    expect(module).toContain('VeerFallbackError')
    expect(module).not.toContain("import ErrorComponent from '/app/error.vue'")
  })

  it('imports app/error.vue when error component is enabled', () => {
    const plugin = veerPlugin({ layouts: [], errorComponent: true })
    const module = plugin.load('\0virtual:veer/error')
    expect(module).toContain("import ErrorComponent from '/app/error.vue'")
    expect(module).not.toContain('VeerFallbackError')
  })
})
