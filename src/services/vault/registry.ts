/**
 * Vault Registry Service
 * Manages multiple vaults and provides access to vault configurations
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { getGlobalConfig, getDefaultVaultEntry } from '../../config/global-config.js';
import { loadVaultConfig } from '../../config/vault-config.js';
import { logger } from '../../utils/logger.js';
import type {
  GlobalConfig,
  GlobalVaultEntry,
  ResolvedVault,
  VaultConfig,
} from '../../types/index.js';

// Registry singleton
let registryInstance: VaultRegistryImpl | null = null;

/**
 * Vault Registry implementation
 */
class VaultRegistryImpl {
  private _vaults: Map<string, ResolvedVault> = new Map();
  private _defaultVaultAlias: string = '';
  private _globalConfig: GlobalConfig;

  constructor(globalConfig: GlobalConfig) {
    this._globalConfig = globalConfig;
    this.initializeVaults();
  }

  /**
   * Initialize all vaults from global config
   */
  private initializeVaults(): void {
    const defaultEntry = getDefaultVaultEntry(this._globalConfig);
    this._defaultVaultAlias = defaultEntry.alias;

    for (const entry of this._globalConfig.vaults) {
      try {
        const resolved = this.resolveVault(entry);
        this._vaults.set(entry.alias, resolved);

        // Also map by path for lookup flexibility
        this._vaults.set(entry.path, resolved);

        logger.debug(`Registered vault: ${entry.alias} at ${entry.path}`);
      } catch (error) {
        logger.error(`Failed to initialize vault ${entry.alias}`, error);
      }
    }

    if (this._vaults.size === 0) {
      throw new Error('No vaults could be initialized');
    }
  }

  /**
   * Resolve a vault entry to full configuration
   */
  private resolveVault(entry: GlobalVaultEntry): ResolvedVault {
    // Check if vault path exists
    if (!existsSync(entry.path)) {
      throw new Error(`Vault path does not exist: ${entry.path}`);
    }

    // Load per-vault config
    const vaultConfig = loadVaultConfig(entry.path, entry.mode);

    // Override mode from global config if specified
    const mode = entry.mode || vaultConfig.vault.mode || 'rw';

    return {
      alias: entry.alias,
      path: entry.path,
      mode,
      isDefault: entry.default || false,
      description: entry.description || vaultConfig.vault.description,
      config: vaultConfig,
      indexPath: join(entry.path, '.palace', 'index.sqlite'),
    };
  }

  /**
   * Get a vault by alias or path
   */
  getVault(aliasOrPath: string): ResolvedVault | undefined {
    return this._vaults.get(aliasOrPath);
  }

  /**
   * Get the default vault
   */
  getDefaultVault(): ResolvedVault {
    const vault = this._vaults.get(this._defaultVaultAlias);
    if (!vault) {
      throw new Error('Default vault not found');
    }
    return vault;
  }

  /**
   * List all registered vaults (unique by alias)
   */
  listVaults(): ResolvedVault[] {
    const seen = new Set<string>();
    const vaults: ResolvedVault[] = [];

    for (const vault of this._vaults.values()) {
      // Only include by alias, not by path (avoid duplicates)
      if (!seen.has(vault.alias)) {
        seen.add(vault.alias);
        vaults.push(vault);
      }
    }

    // Sort with default first, then alphabetically
    return vaults.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.alias.localeCompare(b.alias);
    });
  }

  /**
   * Check if a vault is read-only
   */
  isReadOnly(aliasOrPath: string): boolean {
    const vault = this.getVault(aliasOrPath);
    return vault?.mode === 'ro';
  }

  /**
   * Get vault by alias (strict - throws if not found)
   */
  requireVault(aliasOrPath: string): ResolvedVault {
    const vault = this.getVault(aliasOrPath);
    if (!vault) {
      throw new Error(`Vault not found: ${aliasOrPath}`);
    }
    return vault;
  }

  /**
   * Get vault config
   */
  getVaultConfig(aliasOrPath: string): VaultConfig | undefined {
    return this.getVault(aliasOrPath)?.config;
  }

  /**
   * Get index path for a vault
   */
  getIndexPath(aliasOrPath: string): string | undefined {
    return this.getVault(aliasOrPath)?.indexPath;
  }

  /**
   * Get all vault paths
   */
  getAllPaths(): string[] {
    return this.listVaults().map((v) => v.path);
  }

  /**
   * Get all writable vaults
   */
  getWritableVaults(): ResolvedVault[] {
    return this.listVaults().filter((v) => v.mode === 'rw');
  }

  /**
   * Get the global config
   */
  getGlobalConfig(): GlobalConfig {
    return this._globalConfig;
  }

  /**
   * Check if cross-vault search is enabled
   */
  isCrossVaultSearchEnabled(): boolean {
    return this._globalConfig.cross_vault.search;
  }

  /**
   * Get the standards source vault
   */
  getStandardsSourceVault(): ResolvedVault | undefined {
    const standardsSource = this._globalConfig.cross_vault.standards_source;
    if (!standardsSource) {
      return undefined;
    }
    return this.getVault(standardsSource);
  }
}

/**
 * Initialize the vault registry
 */
export function initializeRegistry(globalConfig?: GlobalConfig): VaultRegistryImpl {
  const config = globalConfig || getGlobalConfig();
  registryInstance = new VaultRegistryImpl(config);
  return registryInstance;
}

/**
 * Get the vault registry (initializes if needed)
 */
export function getVaultRegistry(): VaultRegistryImpl {
  if (!registryInstance) {
    registryInstance = initializeRegistry();
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing)
 */
export function resetRegistry(): void {
  registryInstance = null;
}

// Convenience exports
export type { VaultRegistryImpl as VaultRegistry };

/**
 * Helper to get vault path (resolves alias to path)
 */
export function resolveVaultPath(aliasOrPath: string): string {
  const registry = getVaultRegistry();
  const vault = registry.getVault(aliasOrPath);
  return vault?.path || aliasOrPath;
}

/**
 * Helper to check write permission
 */
export function canWriteToVault(aliasOrPath: string): boolean {
  const registry = getVaultRegistry();
  return !registry.isReadOnly(aliasOrPath);
}

/**
 * Helper to get default vault path
 */
export function getDefaultVaultPath(): string {
  return getVaultRegistry().getDefaultVault().path;
}

/**
 * Helper to get default vault alias
 */
export function getDefaultVaultAlias(): string {
  return getVaultRegistry().getDefaultVault().alias;
}
