/**
 * Path Resolution Engine
 *
 * Resolves storage intents to actual file paths based on vault configuration.
 * AI expresses WHAT to store, this service determines WHERE.
 */

import { join, dirname } from 'path';
import type {
  StorageIntent,
  VaultResolution,
  IntentKnowledgeType,
} from '../../types/intent.js';
import type { ResolvedVault, VaultStructure, StructureMapping } from '../../types/index.js';
import { determineLayer, getKnowledgeTypeFolder } from './layer-detector.js';
import { slugify } from '../../utils/slugify.js';

// Default structure mapping when vault config doesn't specify one
const DEFAULT_STRUCTURE: VaultStructure = {
  technology: { path: 'technologies/{domain}/', hub_file: '_index.md' },
  command: { path: 'commands/{domain}/', hub_file: '_index.md' },
  reference: { path: 'reference/{domain}/' },
  standard: { path: 'standards/{domain}/', ai_binding: 'required' },
  pattern: { path: 'patterns/{domain}/' },
  research: { path: 'research/{domain}/' },
  project: {
    path: 'projects/{project}/',
    subpaths: { decision: 'decisions/', configuration: 'configurations/', note: 'notes/' },
  },
  client: { path: 'clients/{client}/' },
  decision: { path: 'projects/{project}/decisions/' },
  configuration: { path: 'projects/{project}/configurations/' },
  troubleshooting: { path: 'troubleshooting/{domain}/' },
  note: { path: 'notes/{domain}/' },
};

/**
 * Resolve a storage intent to a vault location
 */
export function resolveStorage(intent: StorageIntent, title: string, vault: ResolvedVault): VaultResolution {
  const layer = determineLayer(intent);
  const structure = getStructureMapping(intent.knowledge_type, vault.config.structure);

  // Build the relative path using the structure template
  let relativePath = buildPath(structure, intent);

  // Add filename
  const filename = slugify(title) + '.md';
  relativePath = join(relativePath, filename);

  // Determine hub path if applicable
  const hubPath = structure.hub_file
    ? join(dirname(relativePath), structure.hub_file)
    : undefined;

  return {
    vault: vault.alias,
    vaultPath: vault.path,
    relativePath,
    fullPath: join(vault.path, relativePath),
    filename,
    parentDir: dirname(join(vault.path, relativePath)),
    hubPath,
    layer,
  };
}

/**
 * Get the structure mapping for a knowledge type
 */
function getStructureMapping(
  knowledgeType: IntentKnowledgeType,
  vaultStructure: VaultStructure
): StructureMapping {
  // Try vault-specific structure first
  const vaultMapping = vaultStructure[knowledgeType];
  if (vaultMapping) {
    return vaultMapping;
  }

  // Fall back to defaults
  const defaultMapping = DEFAULT_STRUCTURE[knowledgeType];
  if (defaultMapping) {
    return defaultMapping;
  }

  // Ultimate fallback
  return { path: `${getKnowledgeTypeFolder(knowledgeType)}/` };
}

/**
 * Build the path from a structure template and intent
 */
function buildPath(structure: StructureMapping, intent: StorageIntent): string {
  let path = structure.path;

  // Replace {domain} with domain hierarchy
  if (path.includes('{domain}')) {
    const domainPath = intent.domain.length > 0 ? intent.domain.join('/') : '';
    path = path.replace('{domain}', domainPath);
  }

  // Replace {project}, {client}, {product}
  path = path.replace('{project}', intent.project || '');
  path = path.replace('{client}', intent.client || '');
  path = path.replace('{product}', intent.product || '');

  // Handle subpaths for contextual knowledge
  if (structure.subpaths && intent.knowledge_type) {
    const subtypeKey = getSubtypeKey(intent.knowledge_type);
    const subpath = structure.subpaths[subtypeKey];
    if (subpath) {
      path = join(path, subpath);
    }
  }

  // Clean up double slashes and trailing slashes
  path = path.replace(/\/+/g, '/').replace(/\/$/, '');

  return path;
}

/**
 * Map knowledge types to subpath keys
 */
function getSubtypeKey(knowledgeType: IntentKnowledgeType): string {
  switch (knowledgeType) {
    case 'decision':
      return 'decision';
    case 'configuration':
      return 'configuration';
    case 'note':
      return 'note';
    default:
      return knowledgeType;
  }
}

/**
 * Check if a resolved path conflicts with existing notes
 * Returns the conflicting path if found, undefined otherwise
 */
export function checkPathConflict(resolution: VaultResolution, existingPaths: string[]): string | undefined {
  const normalizedResolved = resolution.relativePath.toLowerCase();
  return existingPaths.find((p) => p.toLowerCase() === normalizedResolved);
}

/**
 * Generate an alternative path if the original conflicts
 */
export function generateAlternativePath(resolution: VaultResolution, suffix: number): VaultResolution {
  const baseFilename = resolution.filename.replace(/\.md$/, '');
  const newFilename = `${baseFilename}-${suffix}.md`;
  const newRelativePath = join(dirname(resolution.relativePath), newFilename);

  return {
    ...resolution,
    filename: newFilename,
    relativePath: newRelativePath,
    fullPath: join(resolution.vaultPath, newRelativePath),
  };
}

/**
 * Validate that a path is within the vault
 */
export function isPathWithinVault(path: string, vaultPath: string): boolean {
  const normalizedPath = join(path).toLowerCase();
  const normalizedVault = join(vaultPath).toLowerCase();
  return normalizedPath.startsWith(normalizedVault);
}

/**
 * Get all possible paths where a note might be stored based on intent
 * Useful for checking if similar content exists
 */
export function getPossiblePaths(intent: StorageIntent, title: string, vault: ResolvedVault): string[] {
  const paths: string[] = [];
  const filename = slugify(title) + '.md';
  const structure = vault.config.structure;

  // Primary resolution
  const primary = resolveStorage(intent, title, vault);
  paths.push(primary.relativePath);

  // If has domain, also check without domain nesting
  if (intent.domain.length > 0) {
    const folderName = getKnowledgeTypeFolder(intent.knowledge_type);
    paths.push(join(folderName, filename));

    // Check with just first domain level
    if (intent.domain.length > 1) {
      paths.push(join(folderName, intent.domain[0] || '', filename));
    }
  }

  // If contextual, also check general location
  if (intent.project || intent.client || intent.product) {
    const generalMapping = structure[intent.knowledge_type];
    if (generalMapping) {
      // Without project context
      const generalPath = generalMapping.path
        .replace('{project}', '')
        .replace('{client}', '')
        .replace('{product}', '')
        .replace('{domain}', intent.domain.join('/'))
        .replace(/\/+/g, '/')
        .replace(/\/$/, '');
      paths.push(join(generalPath, filename));
    }
  }

  return [...new Set(paths)]; // Deduplicate
}
