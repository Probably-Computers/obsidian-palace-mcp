/**
 * Index synchronization - keeps SQLite index in sync with vault files
 */

import { createHash } from 'crypto';
import { getDatabaseSync } from './sqlite.js';
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
 * Index a note in the database
 */
export function indexNote(note: Note): void {
  const db = getDatabaseSync();
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
      insertTagsAndLinks(existing.id, frontmatter.tags ?? [], content);

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
      insertTagsAndLinks(noteId, frontmatter.tags ?? [], content);

      logger.debug(`Indexed new note: ${path}`);
    }
  })();
}

/**
 * Insert tags and wiki-links for a note
 */
function insertTagsAndLinks(noteId: number, tags: string[], content: string): void {
  const db = getDatabaseSync();

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
 * Remove a note from the index
 */
export function removeFromIndex(path: string): void {
  const db = getDatabaseSync();

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
export function needsReindex(path: string, content: string): boolean {
  const db = getDatabaseSync();
  const contentHash = hashContent(content);

  const existing = db
    .prepare('SELECT content_hash FROM notes WHERE path = ?')
    .get(path) as { content_hash: string } | undefined;

  return !existing || existing.content_hash !== contentHash;
}

/**
 * Get all indexed paths
 */
export function getIndexedPaths(): string[] {
  const db = getDatabaseSync();
  const rows = db.prepare('SELECT path FROM notes').all() as { path: string }[];
  return rows.map((r) => r.path);
}

/**
 * Clear the entire index
 */
export function clearIndex(): void {
  const db = getDatabaseSync();

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
export function rebuildFtsIndex(): void {
  const db = getDatabaseSync();
  db.prepare("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')").run();
  logger.info('FTS index rebuilt');
}

/**
 * Get index statistics
 */
export function getIndexStats(): {
  noteCount: number;
  tagCount: number;
  linkCount: number;
} {
  const db = getDatabaseSync();

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
