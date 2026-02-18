/**
 * palace_delete - Delete notes and directories from the vault
 *
 * Phase 023: Note Lifecycle Management
 * - Supports single note and directory deletion
 * - Dry-run mode by default for safety
 * - Backlink handling options (remove, warn, ignore)
 * - Protected path checking (.palace/, .obsidian/)
 */

import { z } from 'zod';
import { rm } from 'fs/promises';
import { join } from 'path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';
import { getIndexManager } from '../services/index/index.js';
import { removeFromIndex } from '../services/index/sync.js';
import { getIncomingLinks } from '../services/graph/links.js';
import { deleteNote as deleteNoteFile } from '../services/vault/writer.js';
import { readNote, noteExists, listNotes } from '../services/vault/reader.js';
import { saveVersion } from '../services/history/storage.js';
import { logger } from '../utils/logger.js';
import {
  startOperation,
  trackFileDeleted,
  trackFileModified,
} from '../services/operations/index.js';

// Backlink handling options
type BacklinkHandling = 'remove' | 'warn' | 'ignore';

// Protected paths that cannot be deleted
const PROTECTED_PATHS = ['.palace', '.obsidian', '.git'];

// Input schema
const inputSchema = z.object({
  path: z.string().describe('Path to note or directory to delete (relative to vault root)'),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
  confirm: z
    .boolean()
    .optional()
    .describe('Required to be true for directory deletion'),
  dry_run: z
    .boolean()
    .default(true)
    .describe('Preview what would be deleted without actually deleting (default: true)'),
  handle_backlinks: z
    .enum(['remove', 'warn', 'ignore'])
    .default('warn')
    .describe('How to handle backlinks: remove (update linking files), warn (list them), ignore'),
  recursive: z
    .boolean()
    .default(false)
    .describe('Delete directory contents recursively'),
});

// Delete result interface
interface DeleteResult {
  success: boolean;
  deleted: string[];
  backlinks_found: string[];
  backlinks_updated: string[];
  broken_links: string[];
  warnings: string[];
  dry_run: boolean;
  operation_id?: string | undefined;
}

// Tool definition
export const deleteTool: Tool = {
  name: 'palace_delete',
  description: `Delete a note or directory from the vault. IMPORTANT: dry_run defaults to true for safety - set dry_run: false to actually delete.

Features:
- Single note deletion with backlink handling
- Directory deletion (requires confirm: true)
- Protected paths (.palace/, .obsidian/) cannot be deleted
- Backlink options: 'remove' updates linking files, 'warn' lists them, 'ignore' deletes anyway`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to note or directory to delete (relative to vault root)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path (defaults to default vault)',
      },
      confirm: {
        type: 'boolean',
        description: 'Required to be true for directory deletion',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview without deleting (default: true). Set to false to actually delete.',
      },
      handle_backlinks: {
        type: 'string',
        enum: ['remove', 'warn', 'ignore'],
        description:
          "How to handle backlinks: 'remove' (update linking files), 'warn' (list them), 'ignore'",
      },
      recursive: {
        type: 'boolean',
        description: 'Delete directory contents recursively',
      },
    },
    required: ['path'],
  },
};

/**
 * Check if a path is protected
 */
function isProtectedPath(path: string): boolean {
  const normalizedPath = path.toLowerCase();
  return PROTECTED_PATHS.some(
    (protected_) =>
      normalizedPath === protected_ ||
      normalizedPath.startsWith(protected_ + '/') ||
      normalizedPath.startsWith(protected_ + '\\')
  );
}

/**
 * Remove wiki-links to a note from content
 */
function removeLinksFromContent(content: string, targetTitle: string): string {
  // Match [[Target]] or [[Target|Display]] patterns
  const linkRegex = new RegExp(
    `\\[\\[${escapeRegex(targetTitle)}(\\|[^\\]]+)?\\]\\]`,
    'gi'
  );

  // Replace with just the display text if present, otherwise empty
  return content.replace(linkRegex, (match) => {
    // Check for display text
    const displayMatch = match.match(/\|([^\]]+)\]\]$/);
    if (displayMatch) {
      return displayMatch[1] ?? '';
    }
    // No display text - just remove the link
    return targetTitle;
  });
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove related frontmatter references to a note
 */
function removeFromRelated(
  frontmatter: Record<string, unknown>,
  targetTitle: string
): Record<string, unknown> {
  if (!frontmatter.related || !Array.isArray(frontmatter.related)) {
    return frontmatter;
  }

  const updatedRelated = frontmatter.related.filter((rel: unknown) => {
    if (typeof rel !== 'string') return true;
    // Match [[Title]] or just Title
    const normalized = rel.replace(/^\[\[/, '').replace(/\]\]$/, '').toLowerCase();
    return normalized !== targetTitle.toLowerCase();
  });

  return {
    ...frontmatter,
    related: updatedRelated.length > 0 ? updatedRelated : undefined,
  };
}

/**
 * Handle deletion of a single note
 */
async function handleNoteDeletion(
  notePath: string,
  vaultPath: string,
  dryRun: boolean,
  handleBacklinks: BacklinkHandling,
  db: ReturnType<typeof import('better-sqlite3')>,
  operationId?: string
): Promise<DeleteResult> {
  const result: DeleteResult = {
    success: true,
    deleted: [],
    backlinks_found: [],
    backlinks_updated: [],
    broken_links: [],
    warnings: [],
    dry_run: dryRun,
    operation_id: operationId,
  };

  // Get note info before deletion for backlink handling
  const note = await readNote(notePath, { vaultPath });
  if (!note) {
    return {
      ...result,
      success: false,
      warnings: [`Note not found: ${notePath}`],
    };
  }

  const noteTitle = note.title;

  // Find backlinks
  const incomingLinks = getIncomingLinks(db, notePath);
  result.backlinks_found = incomingLinks.map((link) => link.source);

  if (incomingLinks.length > 0) {
    if (handleBacklinks === 'remove' && !dryRun) {
      // Remove links from linking files
      for (const link of incomingLinks) {
        try {
          const linkingNote = await readNote(link.source, { vaultPath });
          if (linkingNote) {
            // Remove wiki-links from content
            const updatedContent = removeLinksFromContent(linkingNote.content, noteTitle);

            // Remove from related array in frontmatter
            const updatedFrontmatter = removeFromRelated(
              linkingNote.frontmatter as Record<string, unknown>,
              noteTitle
            );

            // Import update function dynamically to avoid circular deps
            const { updateNote } = await import('../services/vault/writer.js');
            await updateNote(link.source, updatedContent, updatedFrontmatter, { vaultPath });

            // Re-index the updated note
            const updatedNote = await readNote(link.source, { vaultPath });
            if (updatedNote) {
              const { indexNote } = await import('../services/index/sync.js');
              indexNote(db, updatedNote);
            }

            result.backlinks_updated.push(link.source);
            // Track backlink modification
            if (operationId) {
              trackFileModified(operationId, link.source);
            }
            logger.info(`Removed backlinks from: ${link.source}`);
          }
        } catch (error) {
          logger.error(`Failed to update backlinks in: ${link.source}`, error);
          result.warnings.push(`Failed to update backlinks in: ${link.source}`);
        }
      }
    } else if (handleBacklinks === 'warn') {
      // Just warn about broken links
      result.broken_links = result.backlinks_found;
    }
    // 'ignore' - do nothing with backlinks
  }

  // Perform deletion
  if (!dryRun) {
    // Phase 028: Save version before deletion for undo capability
    try {
      const palaceDir = join(vaultPath, '.palace');
      await saveVersion(palaceDir, notePath, note.raw, 'delete');
    } catch (versionError) {
      logger.warn(`Failed to save version before deletion for ${notePath}:`, versionError);
    }

    try {
      await deleteNoteFile(notePath, { vaultPath });
      removeFromIndex(db, notePath);
      result.deleted.push(notePath);
      // Track file deletion
      if (operationId) {
        trackFileDeleted(operationId, notePath);
      }
      logger.info(`Deleted note: ${notePath}`);
    } catch (error) {
      result.success = false;
      result.warnings.push(
        `Failed to delete: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // Dry run - just report what would be deleted
    result.deleted.push(notePath);
  }

  return result;
}

/**
 * Handle deletion of a directory
 */
async function handleDirectoryDeletion(
  dirPath: string,
  vaultPath: string,
  dryRun: boolean,
  handleBacklinks: BacklinkHandling,
  recursive: boolean,
  db: ReturnType<typeof import('better-sqlite3')>,
  operationId?: string
): Promise<DeleteResult> {
  const result: DeleteResult = {
    success: true,
    deleted: [],
    backlinks_found: [],
    backlinks_updated: [],
    broken_links: [],
    warnings: [],
    dry_run: dryRun,
    operation_id: operationId,
  };

  // List all notes in the directory
  const notes = await listNotes(dirPath, recursive, { vaultPath });

  if (notes.length === 0) {
    result.warnings.push(`No notes found in directory: ${dirPath}`);
  }

  // Collect all backlinks for all notes
  const allBacklinks = new Map<string, string[]>();
  for (const note of notes) {
    const incomingLinks = getIncomingLinks(db, note.path);
    // Filter out internal links (links from notes being deleted)
    const externalLinks = incomingLinks.filter(
      (link) => !notes.some((n) => n.path === link.source)
    );
    if (externalLinks.length > 0) {
      allBacklinks.set(note.path, externalLinks.map((l) => l.source));
      result.backlinks_found.push(...externalLinks.map((l) => l.source));
    }
  }

  // Deduplicate backlinks_found
  result.backlinks_found = [...new Set(result.backlinks_found)];

  if (handleBacklinks === 'remove' && !dryRun && result.backlinks_found.length > 0) {
    // Remove links from all linking files
    for (const note of notes) {
      const noteInfo = await readNote(note.path, { vaultPath });
      if (!noteInfo) continue;

      const backlinksForNote = allBacklinks.get(note.path) ?? [];
      for (const linkSource of backlinksForNote) {
        try {
          const linkingNote = await readNote(linkSource, { vaultPath });
          if (linkingNote) {
            const updatedContent = removeLinksFromContent(linkingNote.content, noteInfo.title);
            const updatedFrontmatter = removeFromRelated(
              linkingNote.frontmatter as Record<string, unknown>,
              noteInfo.title
            );

            const { updateNote } = await import('../services/vault/writer.js');
            await updateNote(linkSource, updatedContent, updatedFrontmatter, { vaultPath });

            const updatedNote = await readNote(linkSource, { vaultPath });
            if (updatedNote) {
              const { indexNote } = await import('../services/index/sync.js');
              indexNote(db, updatedNote);
            }

            if (!result.backlinks_updated.includes(linkSource)) {
              result.backlinks_updated.push(linkSource);
              // Track backlink modification
              if (operationId) {
                trackFileModified(operationId, linkSource);
              }
            }
          }
        } catch (error) {
          result.warnings.push(`Failed to update backlinks in: ${linkSource}`);
        }
      }
    }
  } else if (handleBacklinks === 'warn' && result.backlinks_found.length > 0) {
    result.broken_links = result.backlinks_found;
  }

  // Perform deletion
  if (!dryRun) {
    // Delete each note and remove from index
    for (const note of notes) {
      try {
        await deleteNoteFile(note.path, { vaultPath });
        removeFromIndex(db, note.path);
        result.deleted.push(note.path);
        // Track file deletion
        if (operationId) {
          trackFileDeleted(operationId, note.path);
        }
        logger.info(`Deleted note: ${note.path}`);
      } catch (error) {
        result.warnings.push(`Failed to delete ${note.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Try to remove empty directory
    if (recursive) {
      try {
        const fullDirPath = join(vaultPath, dirPath);
        await rm(fullDirPath, { recursive: true, force: true });
        logger.info(`Removed directory: ${dirPath}`);
      } catch (error) {
        // Directory might not be empty or might not exist
        logger.debug(`Could not remove directory ${dirPath}: ${error}`);
      }
    }
  } else {
    // Dry run - report what would be deleted
    result.deleted = notes.map((n) => n.path);
    if (recursive) {
      result.deleted.push(`${dirPath}/ (directory)`);
    }
  }

  return result;
}

/**
 * Check if path is a directory
 */
async function isDirectory(path: string, vaultPath: string): Promise<boolean> {
  const { stat } = await import('fs/promises');
  const fullPath = join(vaultPath, path);
  try {
    const stats = await stat(fullPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// Tool handler
export async function deleteHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const {
    path: targetPath,
    vault: vaultParam,
    confirm,
    dry_run: dryRun,
    handle_backlinks: handleBacklinks,
    recursive,
  } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);

    // Check for read-only vault
    if (vault.mode === 'ro') {
      return {
        success: false,
        error: `Vault '${vault.alias}' is read-only`,
        code: 'READONLY_VAULT',
      };
    }

    // Check for protected paths
    if (isProtectedPath(targetPath)) {
      return {
        success: false,
        error: `Cannot delete protected path: ${targetPath}. Protected paths: ${PROTECTED_PATHS.join(', ')}`,
        code: 'PROTECTED_PATH',
      };
    }

    // Get database
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Start operation tracking
    const operation = startOperation('delete', vault.alias, {
      path: targetPath,
      recursive,
    });

    // Check if target is a directory
    const isDir = await isDirectory(targetPath, vault.path);

    if (isDir) {
      // Directory deletion requires confirmation
      if (!confirm && !dryRun) {
        return {
          success: false,
          error:
            'Directory deletion requires confirm: true. Use dry_run: true to preview what would be deleted.',
          code: 'CONFIRMATION_REQUIRED',
        };
      }

      const result = await handleDirectoryDeletion(
        targetPath,
        vault.path,
        dryRun,
        handleBacklinks,
        recursive,
        db,
        operation.id
      );

      if (!result.success) {
        return {
          success: false,
          error: result.warnings.join('; ') || 'Directory deletion failed',
          code: 'DELETE_ERROR',
        };
      }

      return {
        success: true,
        data: {
          ...getVaultResultInfo(vault),
          type: 'directory',
          ...result,
          message: dryRun
            ? `DRY RUN: Would delete ${result.deleted.length} items`
            : `Deleted ${result.deleted.length} items`,
        },
      };
    } else {
      // Single note deletion
      const exists = await noteExists(targetPath, { vaultPath: vault.path });
      if (!exists) {
        return {
          success: false,
          error: `Note not found: ${targetPath}`,
          code: 'NOT_FOUND',
        };
      }

      const result = await handleNoteDeletion(
        targetPath,
        vault.path,
        dryRun,
        handleBacklinks,
        db,
        operation.id
      );

      if (!result.success) {
        return {
          success: false,
          error: result.warnings.join('; ') || 'Note deletion failed',
          code: 'DELETE_ERROR',
        };
      }

      return {
        success: true,
        data: {
          ...getVaultResultInfo(vault),
          type: 'note',
          ...result,
          message: dryRun
            ? `DRY RUN: Would delete ${targetPath}`
            : `Deleted ${targetPath}`,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'DELETE_ERROR',
    };
  }
}
