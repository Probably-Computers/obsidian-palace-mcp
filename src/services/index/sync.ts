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

  // Extract additional frontmatter fields
  const fm = frontmatter as unknown as Record<string, unknown>;
  const status = (fm.status as string | undefined) ?? 'active';
  const mentionedIn = fm.mentioned_in as string[] | undefined;
  const palaceObj = fm.palace as Record<string, unknown> | undefined;
  const palaceVersion = (palaceObj?.version as number | undefined) ?? 1;

  // Extract standards fields
  const aiBinding = fm.ai_binding as string | undefined;
  const appliesTo = fm.applies_to as string[] | undefined;
  const domain = fm.domain as string[] | undefined;

  db.transaction(() => {
    if (existing) {
      // Update existing note
      db.prepare(
        `UPDATE notes SET
          title = ?, type = ?, created = ?, modified = ?,
          source = ?, confidence = ?, verified = ?,
          content = ?, content_hash = ?,
          status = ?, mentioned_in = ?, tags = ?, related = ?, aliases = ?,
          palace_version = ?,
          ai_binding = ?, applies_to = ?, domain = ?
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
        status,
        mentionedIn ? JSON.stringify(mentionedIn) : null,
        frontmatter.tags ? JSON.stringify(frontmatter.tags) : null,
        frontmatter.related ? JSON.stringify(frontmatter.related) : null,
        frontmatter.aliases ? JSON.stringify(frontmatter.aliases) : null,
        palaceVersion,
        aiBinding ?? null,
        appliesTo ? JSON.stringify(appliesTo) : null,
        domain ? JSON.stringify(domain) : null,
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
          source, confidence, verified, content, content_hash,
          status, mentioned_in, tags, related, aliases, palace_version,
          ai_binding, applies_to, domain
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        contentHash,
        status,
        mentionedIn ? JSON.stringify(mentionedIn) : null,
        frontmatter.tags ? JSON.stringify(frontmatter.tags) : null,
        frontmatter.related ? JSON.stringify(frontmatter.related) : null,
        frontmatter.aliases ? JSON.stringify(frontmatter.aliases) : null,
        palaceVersion,
        aiBinding ?? null,
        appliesTo ? JSON.stringify(appliesTo) : null,
        domain ? JSON.stringify(domain) : null
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

/**
 * Track technology mentions for a note
 */
export function trackTechnologyMentions(
  db: Database.Database,
  notePath: string,
  technologies: string[]
): void {
  if (technologies.length === 0) return;

  const note = db
    .prepare('SELECT id FROM notes WHERE path = ?')
    .get(notePath) as { id: number } | undefined;

  if (!note) {
    logger.debug(`Note not found for tech tracking: ${notePath}`);
    return;
  }

  const now = new Date().toISOString();

  // Clear existing mentions for this note
  db.prepare('DELETE FROM technology_mentions WHERE note_id = ?').run(note.id);

  // Insert new mentions
  const insertMention = db.prepare(
    `INSERT OR REPLACE INTO technology_mentions
     (note_id, technology, mention_count, first_mentioned)
     VALUES (?, ?, 1, ?)`
  );

  for (const tech of technologies) {
    insertMention.run(note.id, tech.toLowerCase(), now);
  }

  logger.debug(`Tracked ${technologies.length} technology mentions for: ${notePath}`);
}

/**
 * Get all notes that mention a technology
 */
export function getNotesMentioningTechnology(
  db: Database.Database,
  technology: string
): Array<{ path: string; title: string; mentionCount: number }> {
  const results = db
    .prepare(
      `SELECT n.path, n.title, tm.mention_count
       FROM technology_mentions tm
       JOIN notes n ON n.id = tm.note_id
       WHERE tm.technology = ?
       ORDER BY tm.mention_count DESC`
    )
    .all(technology.toLowerCase()) as Array<{
    path: string;
    title: string;
    mention_count: number;
  }>;

  return results.map((r) => ({
    path: r.path,
    title: r.title,
    mentionCount: r.mention_count,
  }));
}

/**
 * Get all technologies mentioned by a note
 */
export function getTechnologiesMentionedBy(
  db: Database.Database,
  notePath: string
): string[] {
  const note = db
    .prepare('SELECT id FROM notes WHERE path = ?')
    .get(notePath) as { id: number } | undefined;

  if (!note) return [];

  const results = db
    .prepare(
      `SELECT technology FROM technology_mentions
       WHERE note_id = ?
       ORDER BY technology`
    )
    .all(note.id) as Array<{ technology: string }>;

  return results.map((r) => r.technology);
}

/**
 * Get technology mention statistics
 */
export function getTechnologyStats(
  db: Database.Database
): Array<{ technology: string; noteCount: number; totalMentions: number }> {
  const results = db
    .prepare(
      `SELECT
         technology,
         COUNT(DISTINCT note_id) as note_count,
         SUM(mention_count) as total_mentions
       FROM technology_mentions
       GROUP BY technology
       ORDER BY note_count DESC, total_mentions DESC`
    )
    .all() as Array<{
    technology: string;
    note_count: number;
    total_mentions: number;
  }>;

  return results.map((r) => ({
    technology: r.technology,
    noteCount: r.note_count,
    totalMentions: r.total_mentions,
  }));
}
