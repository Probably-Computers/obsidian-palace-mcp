/**
 * Index synchronization - keeps SQLite index in sync with vault files
 * Supports per-vault synchronization
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { getIndexManager } from './manager.js';
import { logger } from '../../utils/logger.js';
import { extractWikiLinks } from '../../utils/wikilinks.js';
import type { Note } from '../../types/index.js';

/**
 * Generate content hash for change detection
 */
function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Index a note in the specified vault's database
 */
export function indexNote(db: Database.Database, note: Note): void {
  const contentHash = hashContent(note.raw);

  // Check if note exists and has changed
  const existing = db
    .prepare('SELECT id, content_hash FROM notes WHERE path = ?')
    .get(note.path) as { id: number; content_hash: string } | undefined;

  if (existing && existing.content_hash === contentHash) {
    logger.debug(`Note unchanged, skipping: ${note.path}`);
    return;
  }

  const { frontmatter, content, path, title } = note;

  db.transaction(() => {
    if (existing) {
      // Update existing note
      db.prepare(
        `UPDATE notes SET
          title = ?, type = ?, created = ?, modified = ?,
          source = ?, confidence = ?, verified = ?,
          content = ?, content_hash = ?
        WHERE id = ?`
      ).run(
        title,
        frontmatter.type,
        frontmatter.created,
        frontmatter.modified,
        frontmatter.source ?? null,
        frontmatter.confidence ?? null,
        frontmatter.verified ? 1 : 0,
        content,
        contentHash,
        existing.id
      );

      // Clear existing tags and links
      db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(existing.id);
      db.prepare('DELETE FROM links WHERE source_id = ?').run(existing.id);

      // Re-insert tags and links
      insertTagsAndLinks(db, existing.id, frontmatter.tags ?? [], content);

      logger.debug(`Updated note in index: ${path}`);
    } else {
      // Insert new note
      const result = db.prepare(
        `INSERT INTO notes (
          path, title, type, created, modified,
          source, confidence, verified, content, content_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        path,
        title,
        frontmatter.type,
        frontmatter.created,
        frontmatter.modified,
        frontmatter.source ?? null,
        frontmatter.confidence ?? null,
        frontmatter.verified ? 1 : 0,
        content,
        contentHash
      );

      const noteId = result.lastInsertRowid as number;

      // Insert tags and links
      insertTagsAndLinks(db, noteId, frontmatter.tags ?? [], content);

      logger.debug(`Indexed new note: ${path}`);
    }
  })();
}

/**
 * Insert tags and wiki-links for a note
 */
function insertTagsAndLinks(
  db: Database.Database,
  noteId: number,
  tags: string[],
  content: string
): void {
  // Insert tags
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)'
  );
  for (const tag of tags) {
    insertTag.run(noteId, tag.toLowerCase());
  }

  // Extract and insert wiki-links
  const links = extractWikiLinks(content);
  const insertLink = db.prepare(
    'INSERT INTO links (source_id, target_path) VALUES (?, ?)'
  );
  for (const link of links) {
    insertLink.run(noteId, link.target);
  }
}

/**
 * Remove a note from the specified vault's index
 */
export function removeFromIndex(db: Database.Database, path: string): void {
  const note = db
    .prepare('SELECT id FROM notes WHERE path = ?')
    .get(path) as { id: number } | undefined;

  if (note) {
    db.transaction(() => {
      db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(note.id);
      db.prepare('DELETE FROM links WHERE source_id = ?').run(note.id);
      db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
    })();

    logger.debug(`Removed note from index: ${path}`);
  }
}

/**
 * Check if a note needs reindexing
 */
export function needsReindex(db: Database.Database, path: string, content: string): boolean {
  const contentHash = hashContent(content);

  const existing = db
    .prepare('SELECT content_hash FROM notes WHERE path = ?')
    .get(path) as { content_hash: string } | undefined;

  return !existing || existing.content_hash !== contentHash;
}

/**
 * Get all indexed paths from a vault
 */
export function getIndexedPaths(db: Database.Database): string[] {
  const rows = db.prepare('SELECT path FROM notes').all() as { path: string }[];
  return rows.map((r) => r.path);
}

/**
 * Clear the entire index for a vault
 */
export function clearIndex(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('DELETE FROM links').run();
    db.prepare('DELETE FROM note_tags').run();
    db.prepare('DELETE FROM notes').run();
  })();

  logger.info('Index cleared');
}

/**
 * Rebuild the FTS5 index (useful after bulk operations)
 */
export function rebuildFtsIndex(db: Database.Database): void {
  db.prepare("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')").run();
  logger.info('FTS index rebuilt');
}

/**
 * Get index statistics for a vault
 */
export function getIndexStats(db: Database.Database): {
  noteCount: number;
  tagCount: number;
  linkCount: number;
} {
  const noteCount = (
    db.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number }
  ).count;

  const tagCount = (
    db.prepare('SELECT COUNT(DISTINCT tag) as count FROM note_tags').get() as {
      count: number;
    }
  ).count;

  const linkCount = (
    db.prepare('SELECT COUNT(*) as count FROM links').get() as { count: number }
  ).count;

  return { noteCount, tagCount, linkCount };
}

/**
 * Sync a single vault's index with its files
 */
export async function syncVault(
  vaultAlias: string,
  listNotes: (path: string, recursive: boolean) => Promise<{ path: string }[]>,
  readNote: (path: string) => Promise<Note | null>
): Promise<number> {
  const manager = getIndexManager();
  const db = await manager.getIndex(vaultAlias);

  logger.info(`Syncing index for vault: ${vaultAlias}`);

  const allNotes = await listNotes('', true);
  let indexed = 0;

  for (const meta of allNotes) {
    try {
      const note = await readNote(meta.path);
      if (note) {
        indexNote(db, note);
        indexed++;
      }
    } catch (error) {
      logger.error(`Failed to index: ${meta.path}`, error);
    }
  }

  logger.info(`Vault sync complete: ${indexed} notes indexed in ${vaultAlias}`);
  return indexed;
}

/**
 * Sync all vaults
 */
export async function syncAllVaults(
  listNotesForVault: (vaultAlias: string, path: string, recursive: boolean) => Promise<{ path: string }[]>,
  readNoteFromVault: (vaultAlias: string, path: string) => Promise<Note | null>
): Promise<Map<string, number>> {
  const manager = getIndexManager();
  const registry = await import('../vault/registry.js').then((m) => m.getVaultRegistry());

  const results = new Map<string, number>();

  for (const vault of registry.listVaults()) {
    try {
      const count = await syncVault(
        vault.alias,
        (path, recursive) => listNotesForVault(vault.alias, path, recursive),
        (path) => readNoteFromVault(vault.alias, path)
      );
      results.set(vault.alias, count);
    } catch (error) {
      logger.error(`Failed to sync vault ${vault.alias}:`, error);
      results.set(vault.alias, 0);
    }
  }

  return results;
}
