/**
 * Configuration loading and validation
 * Supports both legacy single-vault and new multi-vault modes
 */

import { z } from 'zod';
import { resolve } from 'path';
import type { PalaceConfig } from '../types/index.js';
import { getGlobalConfig, getDefaultVaultEntry, resetGlobalConfig } from './global-config.js';

// Environment variable schema (legacy mode)
const envSchema = z.object({
  PALACE_VAULT_PATH: z.string().optional(),
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
 * Load configuration - supports both legacy and multi-vault modes
 * Returns a PalaceConfig for backward compatibility
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

  // Try to use global config (multi-vault mode)
  try {
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
  } catch {
    // Fall back to legacy mode if global config fails
    if (!env.PALACE_VAULT_PATH) {
      throw new Error(
        'Configuration error:\n  - PALACE_VAULT_PATH is required (or configure multi-vault mode)'
      );
    }

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
