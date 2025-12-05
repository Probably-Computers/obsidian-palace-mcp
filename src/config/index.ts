/**
 * Configuration loading and validation
 */

import { z } from 'zod';
import { resolve } from 'path';
import type { PalaceConfig } from '../types/index.js';

// Environment variable schema
const envSchema = z.object({
  PALACE_VAULT_PATH: z.string().min(1, 'PALACE_VAULT_PATH is required'),
  PALACE_LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  PALACE_WATCH_ENABLED: z
    .string()
    .transform((v) => v.toLowerCase() !== 'false')
    .default('true'),
  PALACE_INDEX_PATH: z.string().optional(),
});

// Load and validate configuration
export function loadConfig(): PalaceConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  const env = result.data;
  const vaultPath = resolve(env.PALACE_VAULT_PATH);

  return {
    vaultPath,
    logLevel: env.PALACE_LOG_LEVEL,
    watchEnabled: env.PALACE_WATCH_ENABLED,
    indexPath: env.PALACE_INDEX_PATH
      ? resolve(env.PALACE_INDEX_PATH)
      : resolve(vaultPath, '.palace', 'index.sqlite'),
  };
}

// Singleton config instance
let configInstance: PalaceConfig | null = null;

export function getConfig(): PalaceConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// For testing - reset config
export function resetConfig(): void {
  configInstance = null;
}
