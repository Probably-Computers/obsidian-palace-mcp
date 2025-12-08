/**
 * Per-vault configuration tests (Phase 017)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadVaultConfig,
  createDefaultVaultConfig,
  getAiBinding,
  isStandardsPath,
  schemas,
} from '../../../src/config/vault-config';

describe('Vault Configuration (Phase 017)', () => {
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
    it('validates simplified structure config', () => {
      const structure = {
        sources: 'my-sources/',
        projects: 'my-projects/',
      };
      const result = schemas.vaultStructure.safeParse(structure);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sources).toBe('my-sources/');
        expect(result.data.projects).toBe('my-projects/');
        expect(result.data.clients).toBe('clients/'); // default
      }
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

    it('includes simplified structure with special folders (Phase 017)', () => {
      const config = createDefaultVaultConfig(testDir);

      expect(config.structure.sources).toBe('sources/');
      expect(config.structure.projects).toBe('projects/');
      expect(config.structure.clients).toBe('clients/');
      expect(config.structure.daily).toBe('daily/');
      expect(config.structure.standards).toBe('standards/');
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
  sources: my-sources/
  projects: my-projects/

atomic:
  max_lines: 150
  hub_filename: index.md
`;
      writeFileSync(join(testDir, '.palace.yaml'), configContent);

      const config = loadVaultConfig(testDir);

      expect(config.vault.name).toBe('custom-vault');
      expect(config.vault.description).toBe('My custom vault');
      expect(config.structure.sources).toBe('my-sources/');
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
      expect(config.structure.sources).toBe('sources/');
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

  describe('isStandardsPath', () => {
    it('returns true for paths in standards folder', () => {
      const config = createDefaultVaultConfig(testDir);

      expect(isStandardsPath(config, 'standards/git-workflow.md')).toBe(true);
      expect(isStandardsPath(config, 'standards/code-style/typescript.md')).toBe(true);
    });

    it('returns false for paths outside standards folder', () => {
      const config = createDefaultVaultConfig(testDir);

      expect(isStandardsPath(config, 'kubernetes/pods.md')).toBe(false);
      expect(isStandardsPath(config, 'projects/myapp/readme.md')).toBe(false);
    });

    it('uses custom standards folder from config', () => {
      const config = createDefaultVaultConfig(testDir);
      config.structure.standards = 'my-standards/';

      expect(isStandardsPath(config, 'my-standards/workflow.md')).toBe(true);
      expect(isStandardsPath(config, 'standards/workflow.md')).toBe(false);
    });
  });

  describe('getAiBinding', () => {
    it('returns required for paths in standards folder', () => {
      const config = createDefaultVaultConfig(testDir);
      const binding = getAiBinding(config, 'standards/git-workflow.md');

      expect(binding).toBe('required');
    });

    it('returns undefined for paths outside standards folder', () => {
      const config = createDefaultVaultConfig(testDir);
      const binding = getAiBinding(config, 'kubernetes/pods.md');

      expect(binding).toBeUndefined();
    });
  });
});
