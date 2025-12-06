/**
 * Ignore Mechanism
 * Three-layer ignore system: config patterns, marker files, frontmatter
 */

import { existsSync } from 'fs';
import { join, relative, dirname, normalize } from 'path';
import { logger } from '../../utils/logger.js';
import type { VaultIgnoreConfig, NoteFrontmatter } from '../../types/index.js';

/**
 * Check if a path matches a glob-like pattern
 * Supports: *, **, ?
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Normalize paths
  const normalizedPath = normalize(path).replace(/\\/g, '/');
  const normalizedPattern = normalize(pattern).replace(/\\/g, '/');

  // Convert glob pattern to regex
  let regexStr = normalizedPattern
    // Escape special regex characters (except * and ?)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Handle ** (match any path segment including /)
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    // Handle * (match anything except /)
    .replace(/\*/g, '[^/]*')
    // Handle ? (match single character except /)
    .replace(/\?/g, '[^/]')
    // Restore ** as match-all
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');

  // If pattern ends with /, match directory and contents
  if (normalizedPattern.endsWith('/')) {
    regexStr = regexStr.slice(0, -1) + '(?:/.*)?';
  }

  // Anchor to start if pattern starts with /
  if (!normalizedPattern.startsWith('/')) {
    regexStr = '(?:^|/)' + regexStr;
  } else {
    regexStr = '^' + regexStr.slice(1);
  }

  // Anchor to end
  regexStr = regexStr + '$';

  try {
    const regex = new RegExp(regexStr, 'i');
    return regex.test(normalizedPath);
  } catch (error) {
    logger.warn(`Invalid ignore pattern: ${pattern}`);
    return false;
  }
}

/**
 * Check if a path matches any of the ignore patterns
 */
export function matchesIgnorePatterns(
  relativePath: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => matchesPattern(relativePath, pattern));
}

/**
 * Check if a directory contains a marker file
 */
export function hasIgnoreMarker(dirPath: string, markerFile: string): boolean {
  const markerPath = join(dirPath, markerFile);
  return existsSync(markerPath);
}

/**
 * Check if any parent directory has an ignore marker
 */
export function hasIgnoreMarkerInPath(
  filePath: string,
  vaultPath: string,
  markerFile: string
): boolean {
  let currentDir = dirname(filePath);
  const normalizedVaultPath = normalize(vaultPath);

  while (currentDir.length >= normalizedVaultPath.length) {
    if (hasIgnoreMarker(currentDir, markerFile)) {
      return true;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached root
    }
    currentDir = parentDir;
  }

  return false;
}

/**
 * Check if frontmatter indicates the note should be ignored
 */
export function hasIgnoreFrontmatter(
  frontmatter: NoteFrontmatter | Record<string, unknown> | undefined,
  frontmatterKey: string
): boolean {
  if (!frontmatter) {
    return false;
  }

  const value = (frontmatter as Record<string, unknown>)[frontmatterKey];
  return value === true || value === 'true';
}

/**
 * Comprehensive ignore check combining all three layers
 */
export interface IgnoreCheckResult {
  ignored: boolean;
  reason?: 'pattern' | 'marker' | 'frontmatter';
  detail?: string;
}

export function shouldIgnore(
  filePath: string,
  vaultPath: string,
  config: VaultIgnoreConfig,
  frontmatter?: NoteFrontmatter | Record<string, unknown>
): IgnoreCheckResult {
  // Get relative path for pattern matching
  const relativePath = relative(vaultPath, filePath);

  // Layer 1: Check config patterns
  if (matchesIgnorePatterns(relativePath, config.patterns)) {
    return {
      ignored: true,
      reason: 'pattern',
      detail: `Matches ignore pattern`,
    };
  }

  // Layer 2: Check for marker file in path
  if (hasIgnoreMarkerInPath(filePath, vaultPath, config.marker_file)) {
    return {
      ignored: true,
      reason: 'marker',
      detail: `Found ${config.marker_file} in path`,
    };
  }

  // Layer 3: Check frontmatter
  if (hasIgnoreFrontmatter(frontmatter, config.frontmatter_key)) {
    return {
      ignored: true,
      reason: 'frontmatter',
      detail: `Has ${config.frontmatter_key}: true`,
    };
  }

  return { ignored: false };
}

/**
 * Create a filter function for a vault
 */
export function createIgnoreFilter(
  vaultPath: string,
  config: VaultIgnoreConfig
): (relativePath: string, frontmatter?: NoteFrontmatter) => boolean {
  return (relativePath: string, frontmatter?: NoteFrontmatter): boolean => {
    const fullPath = join(vaultPath, relativePath);
    const result = shouldIgnore(fullPath, vaultPath, config, frontmatter);
    return !result.ignored;
  };
}

/**
 * Default ignore patterns (always applied)
 */
export const DEFAULT_IGNORE_PATTERNS = [
  '.obsidian/',
  '.palace/',
  '.git/',
  'node_modules/',
  '.DS_Store',
  'Thumbs.db',
];

/**
 * Merge ignore patterns with defaults
 */
export function mergeIgnorePatterns(
  configPatterns: string[],
  includeDefaults = true
): string[] {
  if (!includeDefaults) {
    return configPatterns;
  }

  const merged = [...DEFAULT_IGNORE_PATTERNS];

  for (const pattern of configPatterns) {
    if (!merged.includes(pattern)) {
      merged.push(pattern);
    }
  }

  return merged;
}
