/**
 * Version history storage service (Phase 028)
 *
 * Stores note versions as full copies in .palace/history/{note-hash}/
 * Version files are named v{NNN}_{ISO-timestamp}.md
 */

import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { readdir, readFile, writeFile, mkdir, stat, unlink, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { parseFrontmatter, stringifyFrontmatter } from '../../utils/frontmatter.js';
import { logger } from '../../utils/logger.js';
import type { NoteFrontmatter } from '../../types/index.js';
import type { OperationType } from '../operations/tracker.js';

/**
 * Version metadata stored in version file frontmatter
 */
export interface VersionMetadata {
  palace_version: {
    number: number;
    timestamp: string;
    operation: OperationType | 'batch' | 'unknown';
    mode?: string | undefined; // For improve operations: append, replace, etc.
    previous_version: number;
    changes: ('frontmatter' | 'content')[];
    note_path: string; // Original note path (for reference)
  };
}

/**
 * Version entry for listing
 */
export interface VersionEntry {
  version: number;
  timestamp: string;
  operation: string;
  mode?: string | undefined;
  changes: string[];
  filePath: string;
}

/**
 * History configuration
 */
export interface HistoryConfig {
  enabled: boolean;
  maxVersionsPerNote: number;
  maxAgeDays: number;
  autoCleanup: boolean;
  excludePatterns: string[];
}

/**
 * Default history configuration
 */
export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  enabled: true,
  maxVersionsPerNote: 50,
  maxAgeDays: 90,
  autoCleanup: true,
  excludePatterns: ['daily/**'],
};

/**
 * Generate a stable hash for a note path
 * This creates a shorter, filesystem-safe identifier
 */
export function getPathHash(notePath: string): string {
  return createHash('sha256')
    .update(notePath.toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

/**
 * Get the history directory for a vault
 */
export function getHistoryDir(palaceDir: string): string {
  return join(palaceDir, 'history');
}

/**
 * Get the version directory for a specific note
 */
export function getNoteHistoryDir(palaceDir: string, notePath: string): string {
  const historyDir = getHistoryDir(palaceDir);
  const pathHash = getPathHash(notePath);
  return join(historyDir, pathHash);
}

/**
 * Format version number with leading zeros (v001, v002, etc.)
 */
function formatVersionNumber(version: number): string {
  return `v${version.toString().padStart(3, '0')}`;
}

/**
 * Parse version number from filename
 */
function parseVersionFromFilename(filename: string): number | null {
  const match = filename.match(/^v(\d{3})_/);
  const versionStr = match?.[1];
  return versionStr ? parseInt(versionStr, 10) : null;
}

/**
 * Format ISO timestamp for filename (replace colons with dashes)
 */
function formatTimestampForFilename(timestamp: string): string {
  return timestamp.replace(/:/g, '-');
}

/**
 * Build version filename
 */
function buildVersionFilename(version: number, timestamp: string): string {
  return `${formatVersionNumber(version)}_${formatTimestampForFilename(timestamp)}.md`;
}

/**
 * Check if a note path matches any exclude patterns
 */
function matchesExcludePattern(notePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching for common patterns
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (notePath.startsWith(prefix + '/') || notePath === prefix) {
        return true;
      }
    } else if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      const parts = notePath.split('/');
      if (parts.length === 2 && parts[0] === prefix) {
        return true;
      }
    } else if (notePath === pattern || notePath.startsWith(pattern + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * Save a version of a note before it is modified
 *
 * @param palaceDir Path to .palace directory
 * @param notePath Relative path to the note
 * @param currentContent Current content of the note (before modification)
 * @param operation Type of operation being performed
 * @param mode Optional mode (for improve operations)
 * @param config History configuration
 * @returns Version number saved, or null if version capture was skipped
 */
export async function saveVersion(
  palaceDir: string,
  notePath: string,
  currentContent: string,
  operation: OperationType | 'batch' | 'unknown',
  mode?: string,
  config: Partial<HistoryConfig> = {}
): Promise<number | null> {
  const mergedConfig = { ...DEFAULT_HISTORY_CONFIG, ...config };

  // Check if history is enabled
  if (!mergedConfig.enabled) {
    logger.debug(`History disabled, skipping version capture for ${notePath}`);
    return null;
  }

  // Check exclude patterns
  if (matchesExcludePattern(notePath, mergedConfig.excludePatterns)) {
    logger.debug(`Note matches exclude pattern, skipping version capture: ${notePath}`);
    return null;
  }

  const noteHistoryDir = getNoteHistoryDir(palaceDir, notePath);

  // Get current version number
  const currentVersion = await getLatestVersionNumber(palaceDir, notePath);
  const newVersion = currentVersion + 1;

  // Create history directory if it doesn't exist
  await mkdir(noteHistoryDir, { recursive: true });

  // Parse current content to compare frontmatter vs content changes
  const { frontmatter, body } = parseFrontmatter(currentContent);

  // Determine what's being changed (we'll mark both for now - actual comparison happens on improve)
  const changes: ('frontmatter' | 'content')[] = ['frontmatter', 'content'];

  // Build version metadata
  const palaceVersion: VersionMetadata['palace_version'] = {
    number: newVersion,
    timestamp: new Date().toISOString(),
    operation,
    previous_version: currentVersion,
    changes,
    note_path: notePath,
  };

  // Only add mode if it's defined
  if (mode !== undefined) {
    palaceVersion.mode = mode;
  }

  const versionMeta: VersionMetadata = {
    palace_version: palaceVersion,
  };

  // Combine original frontmatter with version metadata
  const versionFrontmatter = {
    ...frontmatter,
    ...versionMeta,
  };

  // Build version file content
  const versionContent = stringifyFrontmatter(versionFrontmatter, body);

  // Write version file
  const filename = buildVersionFilename(newVersion, versionMeta.palace_version.timestamp);
  const versionPath = join(noteHistoryDir, filename);
  await writeFile(versionPath, versionContent, 'utf-8');

  logger.debug(`Saved version ${newVersion} for ${notePath}`);

  // Auto-cleanup old versions if enabled
  if (mergedConfig.autoCleanup) {
    await cleanupOldVersions(palaceDir, notePath, mergedConfig);
  }

  return newVersion;
}

/**
 * Get the latest version number for a note
 */
export async function getLatestVersionNumber(palaceDir: string, notePath: string): Promise<number> {
  const noteHistoryDir = getNoteHistoryDir(palaceDir, notePath);

  if (!existsSync(noteHistoryDir)) {
    return 0;
  }

  const versions = await listVersions(palaceDir, notePath);
  if (versions.length === 0) {
    return 0;
  }

  return Math.max(...versions.map((v) => v.version));
}

/**
 * List all versions for a note
 */
export async function listVersions(
  palaceDir: string,
  notePath: string,
  limit?: number
): Promise<VersionEntry[]> {
  const noteHistoryDir = getNoteHistoryDir(palaceDir, notePath);

  if (!existsSync(noteHistoryDir)) {
    return [];
  }

  try {
    const files = await readdir(noteHistoryDir);
    const versions: VersionEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const versionNum = parseVersionFromFilename(file);
      if (versionNum === null) continue;

      const filePath = join(noteHistoryDir, file);
      const content = await readFile(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);

      const meta = frontmatter.palace_version as VersionMetadata['palace_version'] | undefined;

      const entry: VersionEntry = {
        version: versionNum,
        timestamp: meta?.timestamp ?? '',
        operation: meta?.operation ?? 'unknown',
        changes: meta?.changes ?? [],
        filePath,
      };

      // Only add mode if it's defined
      if (meta?.mode !== undefined) {
        entry.mode = meta.mode;
      }

      versions.push(entry);
    }

    // Sort by version number descending (newest first)
    versions.sort((a, b) => b.version - a.version);

    return limit ? versions.slice(0, limit) : versions;
  } catch (error) {
    logger.error(`Failed to list versions for ${notePath}:`, error);
    return [];
  }
}

/**
 * Get a specific version of a note
 */
export async function getVersion(
  palaceDir: string,
  notePath: string,
  version: number
): Promise<{ content: string; frontmatter: Partial<NoteFrontmatter>; body: string } | null> {
  const noteHistoryDir = getNoteHistoryDir(palaceDir, notePath);

  if (!existsSync(noteHistoryDir)) {
    return null;
  }

  try {
    const files = await readdir(noteHistoryDir);
    const versionFile = files.find((f) => parseVersionFromFilename(f) === version);

    if (!versionFile) {
      return null;
    }

    const filePath = join(noteHistoryDir, versionFile);
    const content = await readFile(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    // Remove palace_version metadata from frontmatter before returning
    const cleanFrontmatter = { ...frontmatter };
    delete cleanFrontmatter.palace_version;

    return {
      content,
      frontmatter: cleanFrontmatter,
      body,
    };
  } catch (error) {
    logger.error(`Failed to get version ${version} for ${notePath}:`, error);
    return null;
  }
}

/**
 * Get version content as raw string (for revert operations)
 */
export async function getVersionContent(
  palaceDir: string,
  notePath: string,
  version: number
): Promise<string | null> {
  const versionData = await getVersion(palaceDir, notePath, version);
  if (!versionData) {
    return null;
  }

  // Rebuild content without palace_version metadata
  return stringifyFrontmatter(versionData.frontmatter, versionData.body);
}

/**
 * Cleanup old versions based on retention policy
 */
export async function cleanupOldVersions(
  palaceDir: string,
  notePath: string,
  config: Partial<HistoryConfig> = {}
): Promise<number> {
  const mergedConfig = { ...DEFAULT_HISTORY_CONFIG, ...config };
  const versions = await listVersions(palaceDir, notePath);

  if (versions.length === 0) {
    return 0;
  }

  let deletedCount = 0;
  const now = Date.now();
  const maxAgeMs = mergedConfig.maxAgeDays * 24 * 60 * 60 * 1000;

  // Sort by version ascending for deletion (oldest first)
  const sortedVersions = [...versions].sort((a, b) => a.version - b.version);

  for (let i = 0; i < sortedVersions.length; i++) {
    const version = sortedVersions[i];
    if (!version) continue;

    const versionsRemaining = sortedVersions.length - i;

    // Check if we've exceeded max versions
    if (versionsRemaining > mergedConfig.maxVersionsPerNote) {
      await unlink(version.filePath);
      deletedCount++;
      continue;
    }

    // Check if version is too old
    if (version.timestamp) {
      const versionAge = now - new Date(version.timestamp).getTime();
      if (versionAge > maxAgeMs) {
        await unlink(version.filePath);
        deletedCount++;
        continue;
      }
    }
  }

  if (deletedCount > 0) {
    logger.debug(`Cleaned up ${deletedCount} old versions for ${notePath}`);
  }

  return deletedCount;
}

/**
 * Delete all versions for a note (when note is deleted)
 */
export async function deleteAllVersions(palaceDir: string, notePath: string): Promise<boolean> {
  const noteHistoryDir = getNoteHistoryDir(palaceDir, notePath);

  if (!existsSync(noteHistoryDir)) {
    return true;
  }

  try {
    await rm(noteHistoryDir, { recursive: true, force: true });
    logger.debug(`Deleted all versions for ${notePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete versions for ${notePath}:`, error);
    return false;
  }
}

/**
 * Get history storage statistics for a vault
 */
export async function getHistoryStats(palaceDir: string): Promise<{
  totalNotes: number;
  totalVersions: number;
  totalSizeBytes: number;
}> {
  const historyDir = getHistoryDir(palaceDir);

  if (!existsSync(historyDir)) {
    return { totalNotes: 0, totalVersions: 0, totalSizeBytes: 0 };
  }

  let totalNotes = 0;
  let totalVersions = 0;
  let totalSizeBytes = 0;

  try {
    const noteDirs = await readdir(historyDir);

    for (const noteDir of noteDirs) {
      const notePath = join(historyDir, noteDir);
      const noteStat = await stat(notePath);

      if (!noteStat.isDirectory()) continue;

      totalNotes++;

      const files = await readdir(notePath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        totalVersions++;
        const fileStat = await stat(join(notePath, file));
        totalSizeBytes += fileStat.size;
      }
    }

    return { totalNotes, totalVersions, totalSizeBytes };
  } catch (error) {
    logger.error('Failed to get history stats:', error);
    return { totalNotes: 0, totalVersions: 0, totalSizeBytes: 0 };
  }
}
