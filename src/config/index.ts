/**
 * Configuration loading and validation
 * Uses multi-vault configuration via global config or PALACE_VAULTS env var
 */

import { z } from 'zod';
import { resolve } from 'path';
import type { PalaceConfig } from '../types/index.js';
import { getGlobalConfig, getDefaultVaultEntry, resetGlobalConfig } from './global-config.js';

// Environment variable schema for settings overrides
const envSchema = z.object({
  PALACE_LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  PALACE_WATCH_ENABLED: z
    .string()
    .transform((v) => v.toLowerCase() !== 'false')
    .default('true'),
  PALACE_INDEX_PATH: z.string().optional(),
});

/**
 * Load configuration from global config
 * Returns a PalaceConfig with the default vault settings
 */
export function loadConfig(): PalaceConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  const env = result.data;

  // Load global config (multi-vault mode)
  const globalConfig = getGlobalConfig();
  const defaultVault = getDefaultVaultEntry(globalConfig);

  return {
    vaultPath: defaultVault.path,
    logLevel: globalConfig.settings.log_level,
    watchEnabled: globalConfig.settings.watch_enabled,
    indexPath: env.PALACE_INDEX_PATH
      ? resolve(env.PALACE_INDEX_PATH)
      : resolve(defaultVault.path, '.palace', 'index.sqlite'),
  };
}

// Singleton config instance
let configInstance: PalaceConfig | null = null;

/**
 * Get the current config (cached)
 */
export function getConfig(): PalaceConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset config (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
  resetGlobalConfig();
}

// Re-export global config functions
export {
  getGlobalConfig,
  getDefaultVaultEntry,
  validateVaultPaths,
  loadGlobalConfig,
  resetGlobalConfig,
} from './global-config.js';

// Re-export vault config functions
export {
  loadVaultConfig,
  createDefaultVaultConfig,
  getStructurePath,
  getSubpath,
  getAiBinding,
} from './vault-config.js';
