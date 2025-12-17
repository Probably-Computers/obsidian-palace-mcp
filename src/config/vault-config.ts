/**
 * Per-vault configuration loading and validation (Phase 017)
 *
 * Phase 017 simplifies the structure configuration:
 * - No more knowledge type to path mappings
 * - Only special folder locations are configurable
 * - Domain/topic directly becomes the folder path
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import type { VaultConfig, VaultAccessMode } from '../types/index.js';

// Zod schema for simplified structure (Phase 017)
const vaultStructureSchema = z.object({
  sources: z.string().optional().default('sources/'),
  projects: z.string().optional().default('projects/'),
  clients: z.string().optional().default('clients/'),
  daily: z.string().optional().default('daily/'),
  standards: z.string().optional().default('standards/'),
});

// Zod schema for ignore config
const ignoreConfigSchema = z.object({
  patterns: z.array(z.string()).default(['.obsidian/', 'templates/']),
  marker_file: z.string().default('.palace-ignore'),
  frontmatter_key: z.string().default('palace_ignore'),
});

// Zod schema for atomic config
// Phase 018: Removed hub_filename - hub names are now derived from title
// Phase 022: Added min_section_lines, max_children, and hub_sections
const atomicConfigSchema = z.object({
  max_lines: z.number().default(200),
  max_sections: z.number().default(6),
  section_max_lines: z.number().optional(),
  auto_split: z.boolean().default(true),
  // Phase 022: New configurable thresholds
  min_section_lines: z.number().optional(), // Minimum lines for section to be split (default: 5)
  max_children: z.number().optional(), // Maximum children to create (default: 10)
  // Phase 022: Sections that stay in hub during splits
  hub_sections: z.array(z.string()).optional(), // e.g., ['Quick Reference', 'Summary']
});

// Zod schema for stub config
const stubConfigSchema = z.object({
  auto_create: z.boolean().default(true),
  min_confidence: z.number().min(0).max(1).default(0.2),
});

// Zod schema for graph config
const graphConfigSchema = z.object({
  require_technology_links: z.boolean().default(false), // Phase 017: Default to false
  warn_orphan_depth: z.number().default(1),
  retroactive_linking: z.boolean().default(true),
});

// Zod schema for vault info
const vaultInfoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(['rw', 'ro']).optional(),
});

// Zod schema for complete vault config (Phase 017)
const vaultConfigSchema = z.object({
  vault: vaultInfoSchema,
  structure: vaultStructureSchema.default({}),
  ignore: ignoreConfigSchema.default({}),
  atomic: atomicConfigSchema.default({}),
  stubs: stubConfigSchema.default({}),
  graph: graphConfigSchema.default({}),
});

/**
 * Create default vault config for a path (Phase 017)
 */
export function createDefaultVaultConfig(
  vaultPath: string,
  mode: VaultAccessMode = 'rw'
): VaultConfig {
  const name = basename(vaultPath);

  return {
    vault: {
      name,
      mode,
    },
    structure: {
      sources: 'sources/',
      projects: 'projects/',
      clients: 'clients/',
      daily: 'daily/',
      standards: 'standards/',
    },
    ignore: {
      patterns: ['.obsidian/', 'templates/', 'private/**'],
      marker_file: '.palace-ignore',
      frontmatter_key: 'palace_ignore',
    },
    atomic: {
      max_lines: 200,
      max_sections: 6,
      auto_split: true,
    },
    stubs: {
      auto_create: true,
      min_confidence: 0.2,
    },
    graph: {
      require_technology_links: false,
      warn_orphan_depth: 1,
      retroactive_linking: true,
    },
  };
}

/**
 * Load vault configuration from .palace.yaml
 */
export function loadVaultConfig(
  vaultPath: string,
  defaultMode: VaultAccessMode = 'rw'
): VaultConfig {
  const configPath = join(vaultPath, '.palace.yaml');

  if (!existsSync(configPath)) {
    logger.debug(`No .palace.yaml found in ${vaultPath}, using defaults`);
    return createDefaultVaultConfig(vaultPath, defaultMode);
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const rawConfig = parseYaml(content);
    const result = vaultConfigSchema.safeParse(rawConfig);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      logger.warn(`Invalid vault config at ${configPath}:\n${errors}`);
      logger.warn('Using default configuration');
      return createDefaultVaultConfig(vaultPath, defaultMode);
    }

    logger.debug(`Loaded vault config from ${configPath}`);

    // Merge with defaults to ensure all fields exist
    const parsed = result.data;
    const defaults = createDefaultVaultConfig(vaultPath, defaultMode);

    const mergedConfig: VaultConfig = {
      vault: {
        name: parsed.vault.name ?? defaults.vault.name,
        description: parsed.vault.description ?? defaults.vault.description,
        mode: parsed.vault.mode ?? defaults.vault.mode,
      },
      structure: {
        sources: parsed.structure.sources ?? defaults.structure.sources,
        projects: parsed.structure.projects ?? defaults.structure.projects,
        clients: parsed.structure.clients ?? defaults.structure.clients,
        daily: parsed.structure.daily ?? defaults.structure.daily,
        standards: parsed.structure.standards ?? defaults.structure.standards,
      },
      ignore: {
        patterns: parsed.ignore.patterns ?? defaults.ignore.patterns,
        marker_file: parsed.ignore.marker_file ?? defaults.ignore.marker_file,
        frontmatter_key:
          parsed.ignore.frontmatter_key ?? defaults.ignore.frontmatter_key,
      },
      atomic: {
        max_lines: parsed.atomic.max_lines ?? defaults.atomic.max_lines,
        max_sections:
          parsed.atomic.max_sections ?? defaults.atomic.max_sections,
        section_max_lines:
          parsed.atomic.section_max_lines ?? defaults.atomic.section_max_lines,
        auto_split: parsed.atomic.auto_split ?? defaults.atomic.auto_split,
      },
      stubs: {
        auto_create: parsed.stubs.auto_create ?? defaults.stubs.auto_create,
        min_confidence:
          parsed.stubs.min_confidence ?? defaults.stubs.min_confidence,
      },
      graph: {
        require_technology_links:
          parsed.graph.require_technology_links ??
          defaults.graph.require_technology_links,
        warn_orphan_depth:
          parsed.graph.warn_orphan_depth ?? defaults.graph.warn_orphan_depth,
        retroactive_linking:
          parsed.graph.retroactive_linking ?? defaults.graph.retroactive_linking,
      },
    };

    return mergedConfig;
  } catch (error) {
    logger.error(`Failed to load vault config from ${configPath}`, error);
    return createDefaultVaultConfig(vaultPath, defaultMode);
  }
}

/**
 * Check if a path is in the standards folder
 */
export function isStandardsPath(config: VaultConfig, path: string): boolean {
  const standardsFolder = config.structure.standards || 'standards/';
  return path.startsWith(standardsFolder.replace(/\/$/, ''));
}

/**
 * Get ai_binding for a standard note (always 'required' for standards)
 */
export function getAiBinding(
  config: VaultConfig,
  path: string
): 'required' | 'recommended' | 'optional' | undefined {
  if (isStandardsPath(config, path)) {
    return 'required';
  }
  return undefined;
}

// Export schemas for testing
export const schemas = {
  vaultStructure: vaultStructureSchema,
  ignoreConfig: ignoreConfigSchema,
  atomicConfig: atomicConfigSchema,
  stubConfig: stubConfigSchema,
  graphConfig: graphConfigSchema,
  vaultInfo: vaultInfoSchema,
  vaultConfig: vaultConfigSchema,
};
