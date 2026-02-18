/**
 * Path Resolution Engine (Phase 017 - Topic-Based Architecture)
 *
 * Resolves storage intents to actual file paths.
 * Key principle: domain/topic directly becomes the folder path.
 * No more type-to-folder mapping - the topic IS the path.
 */

import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { StorageIntent, VaultResolution } from '../../types/intent.js';
import type { ResolvedVault, VaultStructure } from '../../types/index.js';
import { slugify } from '../../utils/slugify.js';

// Default folder locations for special captures
const DEFAULT_STRUCTURE: VaultStructure = {
  sources: 'sources/',
  projects: 'projects/',
  clients: 'clients/',
  daily: 'daily/',
  standards: 'standards/',
};

/**
 * Resolve a storage intent to a vault location.
 *
 * Path resolution rules:
 * 1. Source captures → sources/{type}/{title}/
 * 2. Project captures → projects/{project}/
 * 3. Client captures → clients/{client}/
 * 4. Knowledge captures → {domain.join('/')}/  (domain IS the path)
 */
export function resolveStorage(
  intent: StorageIntent,
  title: string,
  vault: ResolvedVault
): VaultResolution {
  const structure = getStructure(vault.config.structure);

  // Determine base path based on capture type
  let basePath: string;
  let isNewTopLevelDomain = false;

  switch (intent.capture_type) {
    case 'source':
      basePath = resolveSourcePath(intent, structure);
      break;

    case 'project':
      basePath = resolveProjectPath(intent, structure);
      break;

    case 'knowledge':
    default: {
      const result = resolveKnowledgePath(intent, vault);
      basePath = result.path;
      isNewTopLevelDomain = result.isNewTopLevel;
      break;
    }
  }

  // Phase 018: Use title-style filenames (Obsidian-native)
  const filename = title.trim().replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ') + '.md';
  const relativePath = join(basePath, filename);

  return {
    vault: vault.alias,
    vaultPath: vault.path,
    relativePath,
    fullPath: join(vault.path, relativePath),
    filename,
    parentDir: join(vault.path, basePath),
    // Phase 018: hubPath removed - hub filenames are now title-based
    isNewTopLevelDomain,
  };
}

/**
 * Get merged structure configuration
 */
function getStructure(vaultStructure?: VaultStructure): Required<VaultStructure> {
  return {
    sources: vaultStructure?.sources || DEFAULT_STRUCTURE.sources || 'sources/',
    projects: vaultStructure?.projects || DEFAULT_STRUCTURE.projects || 'projects/',
    clients: vaultStructure?.clients || DEFAULT_STRUCTURE.clients || 'clients/',
    daily: vaultStructure?.daily || DEFAULT_STRUCTURE.daily || 'daily/',
    standards: vaultStructure?.standards || DEFAULT_STRUCTURE.standards || 'standards/',
    time: vaultStructure?.time || 'time/',
  };
}

/**
 * Resolve path for source captures.
 * Format: sources/{type}/{title}/
 */
function resolveSourcePath(
  intent: StorageIntent,
  structure: Required<VaultStructure>
): string {
  if (!intent.source) {
    throw new Error('Source information required for source captures');
  }

  const sourcesBase = structure.sources.replace(/\/$/, '');
  const sourceType = intent.source.type;
  const sourceTitle = slugify(intent.source.title);

  return `${sourcesBase}/${sourceType}/${sourceTitle}`;
}

/**
 * Resolve path for project/client captures.
 * Format: projects/{project}/ or clients/{client}/
 */
function resolveProjectPath(
  intent: StorageIntent,
  structure: Required<VaultStructure>
): string {
  // Client context takes precedence if both specified
  if (intent.client) {
    const clientsBase = structure.clients.replace(/\/$/, '');
    return `${clientsBase}/${slugify(intent.client)}`;
  }

  if (intent.project) {
    const projectsBase = structure.projects.replace(/\/$/, '');
    return `${projectsBase}/${slugify(intent.project)}`;
  }

  throw new Error('Project or client name required for project captures');
}

/**
 * Resolve path for knowledge captures.
 * Key principle: domain IS the path.
 * Format: {domain[0]}/{domain[1]}/{domain[2]}/...
 */
function resolveKnowledgePath(
  intent: StorageIntent,
  vault: ResolvedVault
): { path: string; isNewTopLevel: boolean } {
  if (!intent.domain || intent.domain.length === 0) {
    throw new Error('Domain is required for knowledge captures');
  }

  // Domain directly becomes the path
  const domainPath = intent.domain.map(slugify).join('/');

  // Check if this is a new top-level domain
  const topLevelDomain = intent.domain[0];
  const topLevelPath = join(vault.path, slugify(topLevelDomain || ''));
  const isNewTopLevel = topLevelDomain
    ? !existsSync(topLevelPath)
    : false;

  return {
    path: domainPath,
    isNewTopLevel,
  };
}

/**
 * Check if a resolved path conflicts with existing notes.
 * Returns the conflicting path if found, undefined otherwise.
 */
export function checkPathConflict(
  resolution: VaultResolution,
  existingPaths: string[]
): string | undefined {
  const normalizedResolved = resolution.relativePath.toLowerCase();
  return existingPaths.find((p) => p.toLowerCase() === normalizedResolved);
}

/**
 * Generate an alternative path if the original conflicts.
 */
export function generateAlternativePath(
  resolution: VaultResolution,
  suffix: number
): VaultResolution {
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
 * Validate that a path is within the vault.
 */
export function isPathWithinVault(path: string, vaultPath: string): boolean {
  const normalizedPath = join(path).toLowerCase();
  const normalizedVault = join(vaultPath).toLowerCase();
  return normalizedPath.startsWith(normalizedVault);
}

/**
 * Get all possible paths where a note might be stored based on intent.
 * Useful for checking if similar content exists.
 */
export function getPossiblePaths(
  intent: StorageIntent,
  title: string,
  vault: ResolvedVault
): string[] {
  const paths: string[] = [];
  const filename = slugify(title) + '.md';

  // Primary resolution
  const primary = resolveStorage(intent, title, vault);
  paths.push(primary.relativePath);

  // For knowledge captures, also check variants
  if (intent.capture_type === 'knowledge' && intent.domain.length > 0) {
    // Check without full domain nesting
    if (intent.domain.length > 1) {
      // Just first level
      paths.push(join(slugify(intent.domain[0] || ''), filename));

      // Just first two levels
      if (intent.domain.length > 2) {
        paths.push(
          join(
            slugify(intent.domain[0] || ''),
            slugify(intent.domain[1] || ''),
            filename
          )
        );
      }
    }
  }

  return [...new Set(paths)]; // Deduplicate
}

/**
 * Get the domain path from a note's relative path.
 * Extracts the topic hierarchy from the file path.
 *
 * Example: 'networking/wireless/lora/lora-basics.md' -> ['networking', 'wireless', 'lora']
 */
export function extractDomainFromPath(relativePath: string): string[] {
  // Remove filename
  const dirPath = dirname(relativePath);

  // Split into parts and filter empty strings
  const parts = dirPath.split('/').filter((p) => p && p !== '.');

  // Check if this is a special folder (sources, projects, clients, daily)
  const firstPart = parts[0]?.toLowerCase();
  if (
    firstPart === 'sources' ||
    firstPart === 'projects' ||
    firstPart === 'clients' ||
    firstPart === 'daily'
  ) {
    // For special folders, return everything after the base folder
    return parts.slice(1);
  }

  // For knowledge paths, the entire path is the domain
  return parts;
}

/**
 * Check if a path is in a special folder (not a knowledge domain).
 */
export function isSpecialFolder(relativePath: string): boolean {
  const firstPart = relativePath.split('/')[0]?.toLowerCase();
  return (
    firstPart === 'sources' ||
    firstPart === 'projects' ||
    firstPart === 'clients' ||
    firstPart === 'daily' ||
    firstPart === 'standards'
  );
}

/**
 * Get the capture type from a path.
 */
export function getCaptureTypeFromPath(
  relativePath: string
): 'source' | 'project' | 'knowledge' {
  const firstPart = relativePath.split('/')[0]?.toLowerCase();

  if (firstPart === 'sources') {
    return 'source';
  }

  if (firstPart === 'projects' || firstPart === 'clients') {
    return 'project';
  }

  return 'knowledge';
}
