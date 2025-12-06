/**
 * Global configuration tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadGlobalConfig,
  getDefaultVaultEntry,
  validateVaultPaths,
  resetGlobalConfig,
  schemas,
} from '../../../src/config/global-config';
import type { GlobalConfig } from '../../../src/types';

describe('Global Configuration', () => {
  const testDir = join(tmpdir(), `palace-config-test-${Date.now()}`);
  const testVaultPath = join(testDir, 'vault');
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Create test directories
    mkdirSync(testDir, { recursive: true });
    mkdirSync(testVaultPath, { recursive: true });

    // Reset config singleton
    resetGlobalConfig();

    // Clear relevant env vars
    delete process.env.PALACE_VAULT_PATH;
    delete process.env.PALACE_VAULTS;
    delete process.env.PALACE_CONFIG_PATH;
    delete process.env.PALACE_DEFAULT_VAULT;
    delete process.env.PALACE_LOG_LEVEL;
    delete process.env.PALACE_WATCH_ENABLED;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;

    // Reset config singleton
    resetGlobalConfig();

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Zod Schemas', () => {
    it('validates vault entry', () => {
      const validEntry = {
        path: '/test/path',
        alias: 'test',
        mode: 'rw',
      };
      const result = schemas.vaultEntry.safeParse(validEntry);
      expect(result.success).toBe(true);
    });

    it('defaults mode to rw', () => {
      const entry = {
        path: '/test/path',
        alias: 'test',
      };
      const result = schemas.vaultEntry.parse(entry);
      expect(result.mode).toBe('rw');
    });

    it('validates global config', () => {
      const config = {
        version: 1,
        vaults: [
          { path: '/test', alias: 'test', mode: 'rw' },
        ],
      };
      const result = schemas.globalConfig.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('applies defaults to global config', () => {
      const config = {
        vaults: [
          { path: '/test', alias: 'test' },
        ],
      };
      const result = schemas.globalConfig.parse(config);
      expect(result.version).toBe(1);
      expect(result.cross_vault.search).toBe(true);
      expect(result.settings.log_level).toBe('info');
    });
  });

  describe('Legacy PALACE_VAULT_PATH', () => {
    it('loads config from legacy env var', () => {
      process.env.PALACE_VAULT_PATH = testVaultPath;

      const config = loadGlobalConfig();

      expect(config.vaults).toHaveLength(1);
      expect(config.vaults[0].alias).toBe('default');
      expect(config.vaults[0].mode).toBe('rw');
      expect(config.vaults[0].default).toBe(true);
    });

    it('respects PALACE_LOG_LEVEL in legacy mode', () => {
      process.env.PALACE_VAULT_PATH = testVaultPath;
      process.env.PALACE_LOG_LEVEL = 'debug';

      const config = loadGlobalConfig();

      expect(config.settings.log_level).toBe('debug');
    });
  });

  describe('PALACE_VAULTS Quick Setup', () => {
    it('parses PALACE_VAULTS env var', () => {
      const vault2Path = join(testDir, 'vault2');
      mkdirSync(vault2Path, { recursive: true });

      process.env.PALACE_VAULTS = `${testVaultPath}:work:rw,${vault2Path}:personal:ro`;

      const config = loadGlobalConfig();

      expect(config.vaults).toHaveLength(2);
      expect(config.vaults[0].alias).toBe('work');
      expect(config.vaults[0].mode).toBe('rw');
      expect(config.vaults[0].default).toBe(true);
      expect(config.vaults[1].alias).toBe('personal');
      expect(config.vaults[1].mode).toBe('ro');
    });

    it('respects PALACE_DEFAULT_VAULT override', () => {
      const vault2Path = join(testDir, 'vault2');
      mkdirSync(vault2Path, { recursive: true });

      process.env.PALACE_VAULTS = `${testVaultPath}:work:rw,${vault2Path}:personal:rw`;
      process.env.PALACE_DEFAULT_VAULT = 'personal';

      const config = loadGlobalConfig();

      expect(config.vaults[0].default).toBe(false);
      expect(config.vaults[1].default).toBe(true);
    });
  });

  describe('Config File Loading', () => {
    it('loads config from YAML file', () => {
      const configPath = join(testDir, 'config.yaml');
      const configContent = `
version: 1
vaults:
  - path: "${testVaultPath}"
    alias: test
    mode: rw
    default: true
cross_vault:
  search: true
settings:
  log_level: debug
`;
      writeFileSync(configPath, configContent);
      process.env.PALACE_CONFIG_PATH = configPath;

      const config = loadGlobalConfig();

      expect(config.vaults[0].alias).toBe('test');
      expect(config.settings.log_level).toBe('debug');
    });
  });

  describe('getDefaultVaultEntry', () => {
    it('returns vault with default: true', () => {
      const config: GlobalConfig = {
        version: 1,
        vaults: [
          { path: '/a', alias: 'a', mode: 'rw' },
          { path: '/b', alias: 'b', mode: 'rw', default: true },
        ],
        cross_vault: { search: true, link_format: 'vault:alias/path' },
        settings: { log_level: 'info', watch_enabled: true, auto_index: true },
      };

      const defaultVault = getDefaultVaultEntry(config);
      expect(defaultVault.alias).toBe('b');
    });

    it('returns first vault if no default set', () => {
      const config: GlobalConfig = {
        version: 1,
        vaults: [
          { path: '/a', alias: 'a', mode: 'rw' },
          { path: '/b', alias: 'b', mode: 'rw' },
        ],
        cross_vault: { search: true, link_format: 'vault:alias/path' },
        settings: { log_level: 'info', watch_enabled: true, auto_index: true },
      };

      const defaultVault = getDefaultVaultEntry(config);
      expect(defaultVault.alias).toBe('a');
    });
  });

  describe('validateVaultPaths', () => {
    it('returns empty array for valid paths', () => {
      const config: GlobalConfig = {
        version: 1,
        vaults: [
          { path: testVaultPath, alias: 'test', mode: 'rw' },
        ],
        cross_vault: { search: true, link_format: 'vault:alias/path' },
        settings: { log_level: 'info', watch_enabled: true, auto_index: true },
      };

      const errors = validateVaultPaths(config);
      expect(errors).toHaveLength(0);
    });

    it('returns errors for missing paths', () => {
      const config: GlobalConfig = {
        version: 1,
        vaults: [
          { path: '/nonexistent/path', alias: 'missing', mode: 'rw' },
        ],
        cross_vault: { search: true, link_format: 'vault:alias/path' },
        settings: { log_level: 'info', watch_enabled: true, auto_index: true },
      };

      const errors = validateVaultPaths(config);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('missing');
    });
  });
});
