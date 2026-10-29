import type { VeerConfigInput } from './schema'

export const defineConfig = <T extends VeerConfigInput>(config: T): T => config

export { VeerConfigSchema } from './schema'
export type { VeerConfig, VeerConfigInput } from './schema'