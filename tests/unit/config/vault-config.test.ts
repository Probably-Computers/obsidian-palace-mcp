/**
 * Per-vault configuration tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadVaultConfig,
  createDefaultVaultConfig,
  getStructurePath,
  getSubpath,
  getAiBinding,
  schemas,
} from '../../../src/config/vault-config';

describe('Vault Configuration', () => {
  const testDir = join(tmpdir(), `palace-vault-config-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Zod Schemas', () => {
    it('validates structure mapping', () => {
      const mapping = {
        path: 'technologies/{domain}/',
        hub_file: '_index.md',
      };
      const result = schemas.structureMapping.safeParse(mapping);
      expect(result.success).toBe(true);
    });

    it('validates atomic config with defaults', () => {
      const config = {};
      const result = schemas.atomicConfig.parse(config);
      expect(result.max_lines).toBe(200);
      expect(result.max_sections).toBe(6);
      expect(result.hub_filename).toBe('_index.md');
    });

    it('validates full vault config', () => {
      const config = {
        vault: { name: 'test' },
        structure: {},
      };
      const result = schemas.vaultConfig.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('createDefaultVaultConfig', () => {
    it('creates config with vault name from path', () => {
      const vaultPath = '/Users/test/My Vault';
      const config = createDefaultVaultConfig(vaultPath);

      expect(config.vault.name).toBe('My Vault');
    });

    it('includes default structure mappings', () => {
      const config = createDefaultVaultConfig(testDir);

      expect(config.structure.technology).toBeDefined();
      expect(config.structure.technology?.path).toBe('technologies/{domain}/');
      expect(config.structure.command).toBeDefined();
      expect(config.structure.project).toBeDefined();
    });

    it('includes default ignore patterns', () => {
      const config = createDefaultVaultConfig(testDir);

      expect(config.ignore.patterns).toContain('.obsidian/');
      expect(config.ignore.patterns).toContain('templates/');
      expect(config.ignore.marker_file).toBe('.palace-ignore');
    });

    it('includes default atomic settings', () => {
      const config = createDefaultVaultConfig(testDir);

      expect(config.atomic.max_lines).toBe(200);
      expect(config.atomic.max_sections).toBe(6);
      expect(config.atomic.hub_filename).toBe('_index.md');
      expect(config.atomic.auto_split).toBe(true);
    });

    it('respects mode parameter', () => {
      const config = createDefaultVaultConfig(testDir, 'ro');
      expect(config.vault.mode).toBe('ro');
    });
  });

  describe('loadVaultConfig', () => {
    it('returns defaults when no config file exists', () => {
      const config = loadVaultConfig(testDir);

      expect(config.vault.name).toBe(testDir.split('/').pop());
      expect(config.atomic.max_lines).toBe(200);
    });

    it('loads config from .palace.yaml', () => {
      const configContent = `
vault:
  name: custom-vault
  description: My custom vault

structure:
  technology:
    path: tech/{domain}/

atomic:
  max_lines: 150
  hub_filename: index.md
`;
      writeFileSync(join(testDir, '.palace.yaml'), configContent);

      const config = loadVaultConfig(testDir);

      expect(config.vault.name).toBe('custom-vault');
      expect(config.vault.description).toBe('My custom vault');
      expect(config.atomic.max_lines).toBe(150);
      expect(config.atomic.hub_filename).toBe('index.md');
    });

    it('merges with defaults for missing fields', () => {
      const configContent = `
vault:
  name: partial-config

atomic:
  max_lines: 100
`;
      writeFileSync(join(testDir, '.palace.yaml'), configContent);

      const config = loadVaultConfig(testDir);

      expect(config.vault.name).toBe('partial-config');
      expect(config.atomic.max_lines).toBe(100);
      // Defaults should be applied
      expect(config.atomic.max_sections).toBe(6);
      expect(config.structure.technology).toBeDefined();
    });

    it('returns defaults for invalid config', () => {
      const configContent = `
vault:
  name: 123  # Will be coerced to string
  invalid_field: true
`;
      writeFileSync(join(testDir, '.palace.yaml'), configContent);

      // Should not throw, should return defaults or merged config
      const config = loadVaultConfig(testDir);
      expect(config).toBeDefined();
    });
  });

  describe('getStructurePath', () => {
    it('returns path for known knowledge type', () => {
      const config = createDefaultVaultConfig(testDir);
      const path = getStructurePath(config, 'technology', { domain: 'docker' });

      expect(path).toBe('technologies/docker/');
    });

    it('replaces multiple variables', () => {
      const config = createDefaultVaultConfig(testDir);
      const path = getStructurePath(config, 'project', { project: 'myproject' });

      expect(path).toBe('projects/myproject/');
    });

    it('returns null for unknown knowledge type', () => {
      const config = createDefaultVaultConfig(testDir);
      const path = getStructurePath(config, 'unknown');

      expect(path).toBeNull();
    });
  });

  describe('getSubpath', () => {
    it('returns subpath for project type', () => {
      const config = createDefaultVaultConfig(testDir);
      const subpath = getSubpath(config, 'project', 'decision');

      expect(subpath).toBe('decisions/');
    });

    it('returns null for missing subpath', () => {
      const config = createDefaultVaultConfig(testDir);
      const subpath = getSubpath(config, 'project', 'unknown');

      expect(subpath).toBeNull();
    });

    it('returns null for type without subpaths', () => {
      const config = createDefaultVaultConfig(testDir);
      const subpath = getSubpath(config, 'technology', 'any');

      expect(subpath).toBeNull();
    });
  });

  describe('getAiBinding', () => {
    it('returns ai_binding for standard type', () => {
      const config = createDefaultVaultConfig(testDir);
      const binding = getAiBinding(config, 'standard');

      expect(binding).toBe('required');
    });

    it('returns undefined for types without binding', () => {
      const config = createDefaultVaultConfig(testDir);
      const binding = getAiBinding(config, 'technology');

      expect(binding).toBeUndefined();
    });
  });
});
