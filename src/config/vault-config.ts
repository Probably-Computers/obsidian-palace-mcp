/**
 * Per-vault configuration loading and validation
 * Loads from {vault}/.palace.yaml
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import type { VaultConfig, VaultAccessMode, VaultStructure, StructureMapping } from '../types/index.js';

// Zod schema for structure mapping
const structureMappingSchema = z.object({
  path: z.string(),
  hub_file: z.string().optional(),
  ai_binding: z.enum(['required', 'recommended', 'optional']).optional(),
  subpaths: z.record(z.string()).optional(),
});

// Zod schema for vault structure
const vaultStructureSchema = z.record(structureMappingSchema).default({});

// Zod schema for ignore config
const ignoreConfigSchema = z.object({
  patterns: z.array(z.string()).default(['.obsidian/', 'templates/']),
  marker_file: z.string().default('.palace-ignore'),
  frontmatter_key: z.string().default('palace_ignore'),
});

// Zod schema for atomic config
const atomicConfigSchema = z.object({
  max_lines: z.number().default(200),
  max_sections: z.number().default(6),
  section_max_lines: z.number().optional(),
  hub_filename: z.string().default('_index.md'),
  auto_split: z.boolean().default(true),
});

// Zod schema for stub config
const stubConfigSchema = z.object({
  auto_create: z.boolean().default(true),
  min_confidence: z.number().min(0).max(1).default(0.2),
});

// Zod schema for graph config
const graphConfigSchema = z.object({
  require_technology_links: z.boolean().default(true),
  warn_orphan_depth: z.number().default(1),
  retroactive_linking: z.boolean().default(true),
});

// Zod schema for vault info
const vaultInfoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(['rw', 'ro']).optional(),
});

// Zod schema for complete vault config
const vaultConfigSchema = z.object({
  vault: vaultInfoSchema,
  structure: vaultStructureSchema,
  ignore: ignoreConfigSchema.default({}),
  atomic: atomicConfigSchema.default({}),
  stubs: stubConfigSchema.default({}),
  graph: graphConfigSchema.default({}),
});

/**
 * Create default vault config for a path
 */
export function createDefaultVaultConfig(vaultPath: string, mode: VaultAccessMode = 'rw'): VaultConfig {
  const name = basename(vaultPath);

  return {
    vault: {
      name,
      mode,
    },
    structure: {
      technology: { path: 'technologies/{domain}/', hub_file: '_index.md' },
      command: { path: 'commands/{domain}/' },
      standard: { path: 'standards/{domain}/', ai_binding: 'required' },
      pattern: { path: 'patterns/{domain}/' },
      reference: { path: 'references/{domain}/' },
      research: { path: 'research/' },
      project: {
        path: 'projects/{project}/',
        subpaths: {
          decision: 'decisions/',
          configuration: 'configurations/',
        },
      },
      client: { path: 'clients/{client}/' },
      troubleshooting: { path: 'troubleshooting/{domain}/' },
      note: { path: 'notes/' },
    },
    ignore: {
      patterns: ['.obsidian/', 'templates/', 'private/**'],
      marker_file: '.palace-ignore',
      frontmatter_key: 'palace_ignore',
    },
    atomic: {
      max_lines: 200,
      max_sections: 6,
      hub_filename: '_index.md',
      auto_split: true,
    },
    stubs: {
      auto_create: true,
      min_confidence: 0.2,
    },
    graph: {
      require_technology_links: true,
      warn_orphan_depth: 1,
      retroactive_linking: true,
    },
  };
}

/**
 * Load vault configuration from .palace.yaml
 */
export function loadVaultConfig(vaultPath: string, defaultMode: VaultAccessMode = 'rw'): VaultConfig {
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

    // Explicitly construct VaultConfig to satisfy strict types
    const mergedConfig: VaultConfig = {
      vault: {
        name: parsed.vault.name ?? defaults.vault.name,
        description: parsed.vault.description ?? defaults.vault.description,
        mode: parsed.vault.mode ?? defaults.vault.mode,
      },
      structure: {
        ...defaults.structure,
        ...Object.fromEntries(
          Object.entries(parsed.structure).map(([key, value]) => [
            key,
            value ? {
              path: value.path,
              hub_file: value.hub_file,
              ai_binding: value.ai_binding,
              subpaths: value.subpaths,
            } : undefined,
          ])
        ),
      },
      ignore: {
        patterns: parsed.ignore.patterns ?? defaults.ignore.patterns,
        marker_file: parsed.ignore.marker_file ?? defaults.ignore.marker_file,
        frontmatter_key: parsed.ignore.frontmatter_key ?? defaults.ignore.frontmatter_key,
      },
      atomic: {
        max_lines: parsed.atomic.max_lines ?? defaults.atomic.max_lines,
        max_sections: parsed.atomic.max_sections ?? defaults.atomic.max_sections,
        section_max_lines: parsed.atomic.section_max_lines ?? defaults.atomic.section_max_lines,
        hub_filename: parsed.atomic.hub_filename ?? defaults.atomic.hub_filename,
        auto_split: parsed.atomic.auto_split ?? defaults.atomic.auto_split,
      },
      stubs: {
        auto_create: parsed.stubs.auto_create ?? defaults.stubs.auto_create,
        min_confidence: parsed.stubs.min_confidence ?? defaults.stubs.min_confidence,
      },
      graph: {
        require_technology_links: parsed.graph.require_technology_links ?? defaults.graph.require_technology_links,
        warn_orphan_depth: parsed.graph.warn_orphan_depth ?? defaults.graph.warn_orphan_depth,
        retroactive_linking: parsed.graph.retroactive_linking ?? defaults.graph.retroactive_linking,
      },
    };

    return mergedConfig;
  } catch (error) {
    logger.error(`Failed to load vault config from ${configPath}`, error);
    return createDefaultVaultConfig(vaultPath, defaultMode);
  }
}

/**
 * Get structure path for a knowledge type
 */
export function getStructurePath(
  config: VaultConfig,
  knowledgeType: string,
  variables: Record<string, string> = {}
): string | null {
  const mapping = config.structure[knowledgeType];
  if (!mapping) {
    return null;
  }

  let path = mapping.path;

  // Replace variables like {domain}, {project}, {client}
  for (const [key, value] of Object.entries(variables)) {
    path = path.replace(`{${key}}`, value);
  }

  return path;
}

/**
 * Get subpath for a knowledge type
 */
export function getSubpath(
  config: VaultConfig,
  knowledgeType: string,
  subpathKey: string
): string | null {
  const mapping = config.structure[knowledgeType];
  if (!mapping?.subpaths) {
    return null;
  }

  return mapping.subpaths[subpathKey] || null;
}

/**
 * Check if a knowledge type has ai_binding requirement
 */
export function getAiBinding(
  config: VaultConfig,
  knowledgeType: string
): 'required' | 'recommended' | 'optional' | undefined {
  const mapping = config.structure[knowledgeType];
  return mapping?.ai_binding;
}

// Export schemas for testing
export const schemas = {
  structureMapping: structureMappingSchema,
  vaultStructure: vaultStructureSchema,
  ignoreConfig: ignoreConfigSchema,
  atomicConfig: atomicConfigSchema,
  stubConfig: stubConfigSchema,
  graphConfig: graphConfigSchema,
  vaultInfo: vaultInfoSchema,
  vaultConfig: vaultConfigSchema,
};
