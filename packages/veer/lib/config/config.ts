import * as v from 'valibot'
import { VeerConfigSchema, type VeerConfig, type VeerConfigInput } from './schema'
import { resolveRuntimeConfig, type RuntimeConfig } from './runtime-config'
import { setupDotenv } from 'c12'

export interface LoadVeerConfigOptions {
  cwd: string
}

export type ResolvedVeerConfig = Omit<VeerConfig, 'server' | 'runtimeConfig'> & {
  server: {
    port: number
    apiPrefix: string
  }
  runtimeConfig: RuntimeConfig
  runtimeConfigInput: RuntimeConfig
}

async function loadEnvFiles(cwd: string): Promise<void> {
  await setupDotenv({
    cwd,
    fileName: ['.env', `.env.${process.env.NODE_ENV ?? 'development'}`, '.env.local'],
    env: process.env,
  })
}

let envLoadedFor: string | null = null
let envLoadPromise: Promise<void> | null = null

export function setupRuntimeEnv(cwd: string): Promise<void> {
  if (envLoadedFor === cwd && envLoadPromise) return envLoadPromise
  envLoadedFor = cwd
  envLoadPromise = loadEnvFiles(cwd).catch(() => undefined)
  return envLoadPromise
}

export async function loadVeerConfig(opts: LoadVeerConfigOptions): Promise<ResolvedVeerConfig> {
  await setupRuntimeEnv(opts.cwd)

  const { loadConfig } = await import('c12')

  const { config } = await loadConfig<VeerConfigInput>({
    cwd: opts.cwd,
    name: 'veer',
    configFile: 'veer.config',
    rcFile: false,
    globalRc: false,
    packageJson: false,
    dotenv: false,
  })

  const result = v.safeParse(VeerConfigSchema, config ?? {})
  if (!result.success) {
    const issues = result.issues
      .map((i) => `  - ${v.getDotPath(i) || `<root>`}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid veer config:\n${issues}`)
  }

  const envPort = process.env.PORT ? Number(process.env.PORT) : undefined
  const configPort = result.output.server.port
  const resolvedPort = envPort ?? configPort ?? 3000
  const runtimeConfigInput = result.output.runtimeConfig as RuntimeConfig
  const runtimeConfig = resolveRuntimeConfig(runtimeConfigInput)

  return {
    ...result.output,
    server: {
      port: resolvedPort,
      apiPrefix: result.output.server.apiPrefix,
    },
    runtimeConfig,
    runtimeConfigInput,
  }
}