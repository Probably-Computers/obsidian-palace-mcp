/**
 * Vault Index Manager
 * Manages multiple SQLite database connections (one per vault)
 */

import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { getVaultRegistry } from '../vault/registry.js';
import { createDatabase } from './sqlite.js';
import { logger } from '../../utils/logger.js';
import type { ResolvedVault } from '../../types/index.js';

/**
 * Connection entry with metadata
 */
interface ConnectionEntry {
  db: Database.Database;
  vault: ResolvedVault;
  initialized: boolean;
}

/**
 * Vault Index Manager implementation
 */
class VaultIndexManagerImpl {
  private connections: Map<string, ConnectionEntry> = new Map();

  /**
   * Ensure the database directory exists
   */
  private async ensureDbDirectory(dbPath: string): Promise<void> {
    const dir = dirname(dbPath);
    await mkdir(dir, { recursive: true });
  }

  /**
   * Get or create a database connection for a vault
   */
  async getIndex(vaultAlias: string): Promise<Database.Database> {
    // Check if already connected
    const existing = this.connections.get(vaultAlias);
    if (existing?.initialized) {
      return existing.db;
    }

    const registry = getVaultRegistry();
    const vault = registry.getVault(vaultAlias);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultAlias}`);
    }

    // Determine database path
    const dbPath = vault.indexPath || join(vault.path, '.palace', 'index.sqlite');

    // Ensure directory exists
    await this.ensureDbDirectory(dbPath);

    logger.info(`Opening database for vault '${vaultAlias}' at: ${dbPath}`);

    // Create and initialize database
    const db = createDatabase(dbPath);

    // Store connection
    this.connections.set(vaultAlias, {
      db,
      vault,
      initialized: true,
    });

    return db;
  }

  /**
   * Get database connection synchronously (throws if not initialized)
   */
  getIndexSync(vaultAlias: string): Database.Database {
    const entry = this.connections.get(vaultAlias);
    if (!entry?.initialized) {
      throw new Error(`Database for vault '${vaultAlias}' not initialized. Call getIndex() first.`);
    }
    return entry.db;
  }

  /**
   * Check if a vault's database is initialized
   */
  isInitialized(vaultAlias: string): boolean {
    return this.connections.get(vaultAlias)?.initialized ?? false;
  }

  /**
   * Get all initialized databases
   */
  getAllIndexes(): Map<string, Database.Database> {
    const result = new Map<string, Database.Database>();
    for (const [alias, entry] of this.connections) {
      if (entry.initialized) {
        result.set(alias, entry.db);
      }
    }
    return result;
  }

  /**
   * Initialize databases for all registered vaults
   */
  async initializeAllVaults(): Promise<void> {
    const registry = getVaultRegistry();
    const vaults = registry.listVaults();

    for (const vault of vaults) {
      try {
        await this.getIndex(vault.alias);
        logger.info(`Initialized index for vault: ${vault.alias}`);
      } catch (error) {
        logger.error(`Failed to initialize index for vault ${vault.alias}`, error);
      }
    }
  }

  /**
   * Close a specific vault's database connection
   */
  closeIndex(vaultAlias: string): void {
    const entry = this.connections.get(vaultAlias);
    if (entry?.db) {
      entry.db.close();
      this.connections.delete(vaultAlias);
      logger.debug(`Closed database for vault: ${vaultAlias}`);
    }
  }

  /**
   * Close all database connections
   */
  closeAll(): void {
    for (const [alias, entry] of this.connections) {
      if (entry.db) {
        entry.db.close();
        logger.debug(`Closed database for vault: ${alias}`);
      }
    }
    this.connections.clear();
    logger.info('All database connections closed');
  }

  /**
   * Get vault info for a database
   */
  getVaultForIndex(vaultAlias: string): ResolvedVault | undefined {
    return this.connections.get(vaultAlias)?.vault;
  }

  /**
   * List all connected vault aliases
   */
  listConnectedVaults(): string[] {
    return Array.from(this.connections.keys());
  }
}

// Manager singleton
let managerInstance: VaultIndexManagerImpl | null = null;

/**
 * Get the vault index manager (creates if needed)
 */
export function getIndexManager(): VaultIndexManagerImpl {
  if (!managerInstance) {
    managerInstance = new VaultIndexManagerImpl();
  }
  return managerInstance;
}

/**
 * Reset the manager (for testing)
 */
export function resetIndexManager(): void {
  if (managerInstance) {
    managerInstance.closeAll();
    managerInstance = null;
  }
}

// Export types
export type { VaultIndexManagerImpl as VaultIndexManager };
