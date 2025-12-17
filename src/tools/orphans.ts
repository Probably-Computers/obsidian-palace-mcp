/**
 * palace_orphans - Find and optionally cleanup disconnected notes
 *
 * Phase 023: Enhanced with cleanup capabilities
 * - Categorizes orphans (isolated, stub_orphans, child_orphans)
 * - Optional deletion with dry_run preview
 * - Cleanup suggestions
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, OrphanType, NoteMetadata, KnowledgeSource } from '../types/index.js';
import { findOrphans } from '../services/graph/index.js';
import { getIndexManager } from '../services/index/index.js';
import { removeFromIndex } from '../services/index/sync.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';
import { deleteNote as deleteNoteFile } from '../services/vault/writer.js';
import { readNote } from '../services/vault/reader.js';
import {
  startOperation,
  trackFileDeleted,
} from '../services/operations/index.js';
import { logger } from '../utils/logger.js';
import Database from 'better-sqlite3';

// Extended orphan types for Phase 023
type ExtendedOrphanType = OrphanType | 'stub_orphans' | 'child_orphans';

// Input schema
const inputSchema = z.object({
  type: z
    .enum(['no_incoming', 'no_outgoing', 'isolated', 'stub_orphans', 'child_orphans'])
    .optional()
    .default('isolated'),
  path: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
  // Phase 023: Cleanup options
  delete_orphans: z
    .boolean()
    .optional()
    .default(false)
    .describe('Delete found orphans (requires dry_run: false)'),
  dry_run: z
    .boolean()
    .optional()
    .default(true)
    .describe('Preview deletion without actually deleting (default: true)'),
  include_suggestions: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include cleanup suggestions in response'),
  include_context: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include rich context for AI review (content preview, similar notes, action suggestions)'),
});

// Tool definition
export const orphansTool: Tool = {
  name: 'palace_orphans',
  description: `Find orphan notes and optionally clean them up.

**Orphan Types:**
- 'isolated': Notes with no incoming or outgoing links (default)
- 'no_incoming': Notes with no backlinks
- 'no_outgoing': Notes with no outgoing links
- 'stub_orphans': Stub notes that no one links to
- 'child_orphans': Child notes whose hub no longer exists

**Cleanup:** Set delete_orphans: true and dry_run: false to actually delete orphans.`,
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['no_incoming', 'no_outgoing', 'isolated', 'stub_orphans', 'child_orphans'],
        description: 'Type of orphan to find. Default: isolated',
      },
      path: {
        type: 'string',
        description: 'Optional path prefix to limit search to a specific directory',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 50, max: 100)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to search in (defaults to default vault)',
      },
      delete_orphans: {
        type: 'boolean',
        description: 'Delete found orphans (requires dry_run: false)',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview deletion without actually deleting (default: true)',
      },
      include_suggestions: {
        type: 'boolean',
        description: 'Include cleanup suggestions in response (default: true)',
      },
      include_context: {
        type: 'boolean',
        description: 'Include rich context for AI review (content preview, similar notes, action suggestions)',
      },
    },
  },
};

/**
 * Find stub orphans - stubs with no backlinks
 */
function findStubOrphans(db: Database.Database, pathPrefix?: string): NoteMetadata[] {
  const pathFilter = pathPrefix ? `AND n.path LIKE '${pathPrefix}%'` : '';

  const rows = db
    .prepare(
      `SELECT DISTINCT n.path, n.title, n.type, n.created, n.modified,
              n.source, n.confidence, n.verified
       FROM notes n
       WHERE n.status = 'stub'
       AND n.id NOT IN (
         SELECT DISTINCT target_note.id
         FROM notes target_note
         JOIN links l ON (
           LOWER(l.target_path) = LOWER(target_note.title)
           OR LOWER(l.target_path) = LOWER(REPLACE(target_note.path, '.md', ''))
           OR l.target_path = target_note.path
         )
       )
       ${pathFilter}
       ORDER BY n.path`
    )
    .all() as Array<{
    path: string;
    title: string | null;
    type: string | null;
    created: string | null;
    modified: string | null;
    source: string | null;
    confidence: number | null;
    verified: number | null;
  }>;

  return rows.map((row) => {
    const frontmatter: NoteMetadata['frontmatter'] = {
      created: row.created ?? new Date().toISOString(),
      modified: row.modified ?? new Date().toISOString(),
    };
    if (row.source) {
      frontmatter.source = row.source as KnowledgeSource;
    }
    if (row.confidence !== null) {
      frontmatter.confidence = row.confidence;
    }
    if (row.verified !== null) {
      frontmatter.verified = row.verified === 1;
    }
    return {
      path: row.path,
      filename: row.path.split('/').pop() ?? '',
      title: row.title ?? row.path.split('/').pop()?.replace('.md', '') ?? '',
      frontmatter,
    };
  });
}

/**
 * Find child orphans - children whose hub no longer exists
 */
function findChildOrphans(db: Database.Database, pathPrefix?: string): NoteMetadata[] {
  const pathFilter = pathPrefix ? `AND n.path LIKE '${pathPrefix}%'` : '';

  // Find notes that have a parent field but the parent doesn't exist
  const rows = db
    .prepare(
      `SELECT DISTINCT n.path, n.title, n.type, n.created, n.modified,
              n.source, n.confidence, n.verified
       FROM notes n
       WHERE (n.type NOT LIKE '%_hub' AND n.type IS NOT NULL)
       AND EXISTS (
         SELECT 1 FROM json_each(n.related)
         WHERE value LIKE '[[%Hub%]]' OR value LIKE '[[%hub%]]'
       )
       AND NOT EXISTS (
         SELECT 1 FROM notes parent
         WHERE parent.type LIKE '%_hub'
         AND n.path LIKE parent.path || '%'
       )
       ${pathFilter}
       ORDER BY n.path`
    )
    .all() as Array<{
    path: string;
    title: string | null;
    type: string | null;
    created: string | null;
    modified: string | null;
    source: string | null;
    confidence: number | null;
    verified: number | null;
  }>;

  return rows.map((row) => {
    const frontmatter: NoteMetadata['frontmatter'] = {
      created: row.created ?? new Date().toISOString(),
      modified: row.modified ?? new Date().toISOString(),
    };
    if (row.source) {
      frontmatter.source = row.source as KnowledgeSource;
    }
    if (row.confidence !== null) {
      frontmatter.confidence = row.confidence;
    }
    if (row.verified !== null) {
      frontmatter.verified = row.verified === 1;
    }
    return {
      path: row.path,
      filename: row.path.split('/').pop() ?? '',
      title: row.title ?? row.path.split('/').pop()?.replace('.md', '') ?? '',
      frontmatter,
    };
  });
}

/**
 * Generate cleanup suggestions based on orphan analysis
 */
function generateCleanupSuggestions(
  orphans: NoteMetadata[],
  type: ExtendedOrphanType
): string[] {
  const suggestions: string[] = [];

  if (orphans.length === 0) {
    suggestions.push('No cleanup needed - no orphans found.');
    return suggestions;
  }

  // Count by type patterns
  const stubCount = orphans.filter((o) => o.frontmatter.status === 'stub').length;
  const hubCount = orphans.filter((o) => (o.frontmatter as Record<string, unknown>).type?.toString().includes('_hub')).length;
  const oldOrphans = orphans.filter((o) => {
    const created = new Date(o.frontmatter.created);
    const daysSinceCreation = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation > 30;
  });

  if (stubCount > 0) {
    suggestions.push(
      `${stubCount} stub note${stubCount > 1 ? 's' : ''} could be deleted or expanded with content.`
    );
  }

  if (hubCount > 0) {
    suggestions.push(
      `${hubCount} orphaned hub${hubCount > 1 ? 's' : ''} - consider consolidating or removing.`
    );
  }

  if (oldOrphans.length > 0) {
    suggestions.push(
      `${oldOrphans.length} orphan${oldOrphans.length > 1 ? 's are' : ' is'} older than 30 days and may be safe to remove.`
    );
  }

  // Type-specific suggestions
  switch (type) {
    case 'isolated':
      suggestions.push(
        'Consider adding wiki-links to connect these notes to the knowledge graph.'
      );
      break;
    case 'no_incoming':
      suggestions.push(
        'These notes are not referenced elsewhere. Consider adding links from relevant notes.'
      );
      break;
    case 'no_outgoing':
      suggestions.push(
        'These notes don\'t link to other notes. Consider adding [[wiki-links]] to related content.'
      );
      break;
    case 'stub_orphans':
      suggestions.push(
        'These stubs are no longer referenced. They can be safely deleted or expanded with content.'
      );
      break;
    case 'child_orphans':
      suggestions.push(
        'These children have lost their hub. Consider re-linking to a hub or consolidating content.'
      );
      break;
  }

  if (orphans.length > 10) {
    suggestions.push(
      `Use delete_orphans: true, dry_run: false to cleanup ${orphans.length} orphans.`
    );
  }

  return suggestions;
}

/**
 * Orphan context for AI review
 */
interface OrphanContext {
  path: string;
  title: string;
  content_preview: string;
  word_count: number;
  created: string;
  type?: string | undefined;
  status?: string | undefined;
  tags?: string[] | undefined;
  similar_notes: Array<{ path: string; title: string; similarity: string }>;
  suggested_action: 'remove' | 'link' | 'expand' | 'merge';
  action_reason: string;
}

/**
 * Get content preview for a note
 */
async function getContentPreview(
  notePath: string,
  vaultPath: string,
  maxChars = 500
): Promise<{ preview: string; wordCount: number }> {
  try {
    const note = await readNote(notePath, { vaultPath });

    if (!note) {
      return { preview: '[Unable to read content]', wordCount: 0 };
    }

    // Use the content (body without frontmatter)
    const content = note.content;

    // Get preview
    const preview = content.slice(0, maxChars);
    const truncated = content.length > maxChars;

    // Count words
    const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;

    return {
      preview: truncated ? preview + '...' : preview,
      wordCount,
    };
  } catch {
    return { preview: '[Unable to read content]', wordCount: 0 };
  }
}

/**
 * Find similar notes that could be linked to
 */
function findSimilarNotes(
  db: Database.Database,
  orphanTitle: string,
  orphanPath: string,
  limit = 5
): Array<{ path: string; title: string; similarity: string }> {
  // Extract keywords from title
  const keywords = orphanTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  // Search for notes with similar titles or content
  const searchTerms = keywords.join(' OR ');

  try {
    const rows = db
      .prepare(
        `SELECT n.path, n.title
         FROM notes n
         JOIN notes_fts fts ON n.id = fts.rowid
         WHERE notes_fts MATCH ?
         AND n.path != ?
         ORDER BY bm25(notes_fts) DESC
         LIMIT ?`
      )
      .all(searchTerms, orphanPath, limit) as Array<{ path: string; title: string | null }>;

    return rows.map(row => ({
      path: row.path,
      title: row.title ?? row.path.split('/').pop()?.replace('.md', '') ?? '',
      similarity: 'keyword match',
    }));
  } catch {
    // FTS search failed, try simple title matching
    const likeClauses = keywords.map(() => `LOWER(n.title) LIKE ?`).join(' OR ');
    const likeParams = keywords.map(k => `%${k}%`);

    try {
      const rows = db
        .prepare(
          `SELECT n.path, n.title
           FROM notes n
           WHERE (${likeClauses})
           AND n.path != ?
           LIMIT ?`
        )
        .all(...likeParams, orphanPath, limit) as Array<{ path: string; title: string | null }>;

      return rows.map(row => ({
        path: row.path,
        title: row.title ?? row.path.split('/').pop()?.replace('.md', '') ?? '',
        similarity: 'title match',
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Generate suggested action for an orphan
 */
function suggestAction(
  orphan: NoteMetadata,
  orphanType: ExtendedOrphanType,
  wordCount: number,
  similarNotes: Array<{ path: string; title: string; similarity: string }>
): { action: 'remove' | 'link' | 'expand' | 'merge'; reason: string } {
  const isStub = orphan.frontmatter.status === 'stub' || wordCount < 50;
  const hasNoContent = wordCount < 10;
  const hasSimilarNotes = similarNotes.length > 0;
  const isOld = (() => {
    const created = new Date(orphan.frontmatter.created);
    const daysSinceCreation = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation > 30;
  })();

  // Stubs with no references should be removed
  if (orphanType === 'stub_orphans' || (isStub && orphanType === 'isolated')) {
    if (hasNoContent) {
      return { action: 'remove', reason: 'Empty stub with no references - safe to delete' };
    }
    if (hasSimilarNotes && similarNotes[0]) {
      return { action: 'merge', reason: `Could merge into: ${similarNotes[0].title}` };
    }
    return { action: 'expand', reason: 'Stub needs content or should be deleted' };
  }

  // Child orphans without hubs
  if (orphanType === 'child_orphans') {
    if (hasNoContent) {
      return { action: 'remove', reason: 'Orphaned child with no content' };
    }
    return { action: 'link', reason: 'Find or create a hub to link this child to' };
  }

  // Isolated notes with minimal content
  if (hasNoContent) {
    return { action: 'remove', reason: 'Note has almost no content - likely a leftover' };
  }

  // Old isolated notes with no connections
  if (isOld && orphanType === 'isolated') {
    if (hasSimilarNotes && similarNotes[0]) {
      return { action: 'link', reason: `Could link to: ${similarNotes[0].title}` };
    }
    return { action: 'remove', reason: 'Old isolated note - review for deletion or linking' };
  }

  // Notes with similar content elsewhere
  if (hasSimilarNotes && wordCount < 200 && similarNotes[0]) {
    return { action: 'merge', reason: `Similar content exists in: ${similarNotes[0].title}` };
  }

  // Default: suggest linking
  if (hasSimilarNotes) {
    const titles = similarNotes.slice(0, 2).map(n => n.title).join(', ');
    return { action: 'link', reason: `Add links to/from: ${titles}` };
  }

  return { action: 'link', reason: 'Add wiki-links to connect to the knowledge graph' };
}

/**
 * Build rich context for an orphan
 */
async function buildOrphanContext(
  db: Database.Database,
  orphan: NoteMetadata,
  orphanType: ExtendedOrphanType,
  vaultPath: string
): Promise<OrphanContext> {
  // Get content preview
  const { preview, wordCount } = await getContentPreview(orphan.path, vaultPath);

  // Find similar notes
  const similarNotes = findSimilarNotes(db, orphan.title, orphan.path);

  // Suggest action
  const { action, reason } = suggestAction(orphan, orphanType, wordCount, similarNotes);

  // Get tags from index
  const tagRows = db
    .prepare(
      `SELECT t.name FROM note_tags nt
       JOIN tags t ON nt.tag_id = t.id
       JOIN notes n ON nt.note_id = n.id
       WHERE n.path = ?`
    )
    .all(orphan.path) as Array<{ name: string }>;
  const tags = tagRows.map(r => r.name);

  const result: OrphanContext = {
    path: orphan.path,
    title: orphan.title,
    content_preview: preview,
    word_count: wordCount,
    created: orphan.frontmatter.created,
    similar_notes: similarNotes,
    suggested_action: action,
    action_reason: reason,
  };

  const noteType = (orphan.frontmatter as Record<string, unknown>).type;
  if (typeof noteType === 'string') {
    result.type = noteType;
  }

  if (orphan.frontmatter.status) {
    result.status = orphan.frontmatter.status;
  }

  if (tags.length > 0) {
    result.tags = tags;
  }

  return result;
}

// Tool handler
export async function orphansHandler(args: Record<string, unknown>): Promise<ToolResult> {
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
    type,
    path,
    limit,
    vault: vaultParam,
    delete_orphans: deleteOrphans,
    dry_run: dryRun,
    include_suggestions: includeSuggestions,
    include_context: includeContext,
  } = parseResult.data;

  try {
    // Resolve vault and get database
    const vault = resolveVaultParam(vaultParam);
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Find orphans based on type
    let orphans: NoteMetadata[];
    switch (type) {
      case 'stub_orphans':
        orphans = findStubOrphans(db, path);
        break;
      case 'child_orphans':
        orphans = findChildOrphans(db, path);
        break;
      default:
        orphans = findOrphans(db, type as OrphanType, path);
    }

    // Limit results
    const limited = orphans.slice(0, limit);

    // Build description based on type
    let description: string;
    switch (type) {
      case 'no_incoming':
        description = 'Notes with no backlinks (no other notes link to them)';
        break;
      case 'no_outgoing':
        description = 'Notes with no outgoing links (they link to no other notes)';
        break;
      case 'isolated':
        description = 'Completely isolated notes (no incoming or outgoing links)';
        break;
      case 'stub_orphans':
        description = 'Stub notes that no one links to';
        break;
      case 'child_orphans':
        description = 'Child notes whose hub no longer exists';
        break;
    }

    // Handle cleanup if requested
    const deletedPaths: string[] = [];
    let operationId: string | undefined;

    if (deleteOrphans) {
      // Check for read-only vault
      if (vault.mode === 'ro') {
        return {
          success: false,
          error: `Vault '${vault.alias}' is read-only`,
          code: 'READONLY_VAULT',
        };
      }

      // Start operation tracking
      const operation = startOperation('delete', vault.alias, {
        type: 'orphan_cleanup',
        orphan_type: type,
      });
      operationId = operation.id;

      if (!dryRun) {
        // Actually delete the orphans
        for (const orphan of limited) {
          try {
            await deleteNoteFile(orphan.path, { vaultPath: vault.path });
            removeFromIndex(db, orphan.path);
            trackFileDeleted(operation.id, orphan.path);
            deletedPaths.push(orphan.path);
            logger.info(`Deleted orphan: ${orphan.path}`);
          } catch (error) {
            logger.warn(`Failed to delete orphan ${orphan.path}: ${error}`);
          }
        }
      } else {
        // Dry run - just show what would be deleted
        deletedPaths.push(...limited.map((o) => o.path));
      }
    }

    // Generate cleanup suggestions if requested
    const suggestions = includeSuggestions
      ? generateCleanupSuggestions(orphans, type as ExtendedOrphanType)
      : undefined;

    // Build rich context if requested
    let orphanContexts: OrphanContext[] | undefined;
    if (includeContext) {
      orphanContexts = await Promise.all(
        limited.map((o) => buildOrphanContext(db, o, type as ExtendedOrphanType, vault.path))
      );
    }

    // Build response
    const response = {
      ...getVaultResultInfo(vault),
      type,
      description,
      count: limited.length,
      total: orphans.length,
      hasMore: orphans.length > limit,
      // Include either rich context or basic orphan info
      ...(includeContext
        ? {
            orphans_with_context: orphanContexts,
            action_summary: {
              remove: orphanContexts?.filter((o) => o.suggested_action === 'remove').length ?? 0,
              link: orphanContexts?.filter((o) => o.suggested_action === 'link').length ?? 0,
              expand: orphanContexts?.filter((o) => o.suggested_action === 'expand').length ?? 0,
              merge: orphanContexts?.filter((o) => o.suggested_action === 'merge').length ?? 0,
            },
          }
        : {
            orphans: limited.map((o) => ({
              path: o.path,
              title: o.title,
              created: o.frontmatter.created,
              type: (o.frontmatter as Record<string, unknown>).type,
              status: o.frontmatter.status,
            })),
          }),
      // Phase 023: Cleanup info
      ...(deleteOrphans && {
        cleanup: {
          deleted: deletedPaths,
          deleted_count: deletedPaths.length,
          dry_run: dryRun,
          operation_id: operationId,
          message: dryRun
            ? `DRY RUN: Would delete ${deletedPaths.length} orphans`
            : `Deleted ${deletedPaths.length} orphans`,
        },
      }),
      ...(suggestions && { suggestions }),
    };

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'ORPHANS_ERROR',
    };
  }
}
