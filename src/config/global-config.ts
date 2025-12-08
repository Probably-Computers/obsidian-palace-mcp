/**
 * Global configuration loading and validation
 * Loads from ~/.config/palace/config.yaml, PALACE_CONFIG_PATH, or PALACE_VAULTS env var
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import type { GlobalConfig, GlobalVaultEntry } from '../types/index.js';

// Zod schema for vault access mode
const vaultAccessModeSchema = z.enum(['rw', 'ro']);

// Zod schema for vault entry
const vaultEntrySchema = z.object({
  path: z.string().min(1),
  alias: z.string().min(1),
  mode: vaultAccessModeSchema.default('rw'),
  default: z.boolean().optional(),
  description: z.string().optional(),
});

// Zod schema for cross-vault settings
const crossVaultSchema = z.object({
  search: z.boolean().default(true),
  link_format: z.string().default('vault:alias/path'),
  standards_source: z.string().optional(),
});

// Zod schema for global settings
const globalSettingsSchema = z.object({
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  watch_enabled: z.boolean().default(true),
  auto_index: z.boolean().default(true),
});

// Zod schema for complete global config
const globalConfigSchema = z.object({
  version: z.number().default(1),
  vaults: z.array(vaultEntrySchema).min(1),
  cross_vault: crossVaultSchema.default({}),
  settings: globalSettingsSchema.default({}),
});

// Default global config path
function getDefaultConfigPath(): string {
  return join(homedir(), '.config', 'palace', 'config.yaml');
}

// Parse PALACE_VAULTS env var (quick setup format: path:alias:mode,...)
function parseVaultsEnvVar(envValue: string): GlobalVaultEntry[] {
  const vaults: GlobalVaultEntry[] = [];
  const entries = envValue.split(',').map((e) => e.trim()).filter(Boolean);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!; // Safe because we're iterating within bounds
    const parts = entry.split(':').map((p) => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      logger.warn(`Invalid PALACE_VAULTS entry: ${entry}`);
      continue;
    }

    vaults.push({
      path: parts[0],
      alias: parts[1],
      mode: (parts[2] as 'rw' | 'ro') || 'rw',
      default: i === 0, // First vault is default
    });
  }

  return vaults;
}

/**
 * Load global configuration from file or environment
 *
 * Configuration can be provided via:
 * 1. PALACE_VAULTS env var (quick setup): "path:alias:mode,path:alias:mode,..."
 * 2. Config file at PALACE_CONFIG_PATH or ~/.config/palace/config.yaml
 *
 * No fallback to single-vault mode - must use multi-vault configuration.
 */
export function loadGlobalConfig(): GlobalConfig {
  // Check for config file path override
  const configPath = process.env.PALACE_CONFIG_PATH || getDefaultConfigPath();

  // Check for quick setup via PALACE_VAULTS env var
  if (process.env.PALACE_VAULTS) {
    const vaults = parseVaultsEnvVar(process.env.PALACE_VAULTS);
    if (vaults.length > 0) {
      logger.debug('Using PALACE_VAULTS quick setup');

      // Apply default vault override
      if (process.env.PALACE_DEFAULT_VAULT) {
        const defaultAlias = process.env.PALACE_DEFAULT_VAULT;
        for (const vault of vaults) {
          vault.default = vault.alias === defaultAlias;
        }
      }

      return {
        version: 1,
        vaults,
        cross_vault: {
          search: true,
          link_format: 'vault:alias/path',
        },
        settings: {
          log_level: (process.env.PALACE_LOG_LEVEL as GlobalConfig['settings']['log_level']) || 'info',
          watch_enabled: process.env.PALACE_WATCH_ENABLED?.toLowerCase() !== 'false',
          auto_index: true,
        },
      };
    }
  }

  // Try to load config file
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const rawConfig = parseYaml(content);
      const result = globalConfigSchema.safeParse(rawConfig);

      if (!result.success) {
        const errors = result.error.issues
          .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
        throw new Error(`Invalid global config:\n${errors}`);
      }

      logger.debug(`Loaded global config from ${configPath}`);

      // Resolve vault paths to absolute and convert to GlobalVaultEntry[]
      const parsedConfig = result.data;
      const vaults: GlobalVaultEntry[] = parsedConfig.vaults.map((vault) => ({
        path: resolve(vault.path),
        alias: vault.alias,
        mode: vault.mode,
        default: vault.default,
        description: vault.description,
      }));

      // Apply default vault override from env
      if (process.env.PALACE_DEFAULT_VAULT) {
        const defaultAlias = process.env.PALACE_DEFAULT_VAULT;
        for (const vault of vaults) {
          vault.default = vault.alias === defaultAlias;
        }
      }

      const config: GlobalConfig = {
        version: parsedConfig.version,
        vaults,
        cross_vault: parsedConfig.cross_vault,
        settings: parsedConfig.settings,
      };

      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(
    'No configuration found. Please configure vaults using one of:\n' +
    '  1. PALACE_VAULTS environment variable: "path:alias:mode,path:alias:mode"\n' +
    '  2. Config file at ~/.config/palace/config.yaml\n' +
    '  3. PALACE_CONFIG_PATH environment variable pointing to your config file\n\n' +
    'Example PALACE_VAULTS: "/path/to/vault:main:rw"\n\n' +
    'Example config.yaml:\n' +
    '  version: 1\n' +
    '  vaults:\n' +
    '    - path: "/path/to/vault"\n' +
    '      alias: main\n' +
    '      mode: rw\n' +
    '      default: true'
  );
}

/**
 * Get the default vault from config
 */
export function getDefaultVaultEntry(config: GlobalConfig): GlobalVaultEntry {
  const defaultVault = config.vaults.find((v) => v.default);
  if (defaultVault) {
    return defaultVault;
  }
  // Fall back to first vault if no default is set
  const firstVault = config.vaults[0];
  if (!firstVault) {
    throw new Error('No vaults configured');
  }
  return firstVault;
}

/**
 * Validate that all vault paths exist
 */
export function validateVaultPaths(config: GlobalConfig): string[] {
  const errors: string[] = [];

  for (const vault of config.vaults) {
    if (!existsSync(vault.path)) {
      errors.push(`Vault path does not exist: ${vault.path} (${vault.alias})`);
    }
  }

  return errors;
}

// Singleton instance
let globalConfigInstance: GlobalConfig | null = null;

/**
 * Get global config (cached)
 */
export function getGlobalConfig(): GlobalConfig {
  if (!globalConfigInstance) {
    globalConfigInstance = loadGlobalConfig();
  }
  return globalConfigInstance;
}

/**
 * Reset global config (for testing)
 */
export function resetGlobalConfig(): void {
  globalConfigInstance = null;
}

// Export schemas for testing
export const schemas = {
  vaultEntry: vaultEntrySchema,
  crossVault: crossVaultSchema,
  globalSettings: globalSettingsSchema,
  globalConfig: globalConfigSchema,
};
