/**
 * Link extraction and resolution
 * Handles wiki-link parsing and resolving targets to actual note paths
 */

import Database from 'better-sqlite3';
import { basename } from 'path';
import { logger } from '../../utils/logger.js';
import type { GraphLink, NoteMetadata, NoteFrontmatter, KnowledgeSource } from '../../types/index.js';

/**
 * Get outgoing links from a note
 */
export function getOutgoingLinks(db: Database.Database, notePath: string): GraphLink[] {
  // Get the note ID
  const note = db
    .prepare('SELECT id FROM notes WHERE path = ?')
    .get(notePath) as { id: number } | undefined;

  if (!note) {
    logger.debug(`Note not found in index: ${notePath}`);
    return [];
  }

  // Get all links from this note
  const links = db
    .prepare('SELECT target_path FROM links WHERE source_id = ?')
    .all(note.id) as { target_path: string }[];

  return links.map((link) => ({
    source: notePath,
    target: link.target_path,
    resolved: isLinkResolved(db, link.target_path),
  }));
}

/**
 * Get incoming links (backlinks) to a note
 */
export function getIncomingLinks(db: Database.Database, notePath: string): GraphLink[] {
  // Get the note's title for matching
  const targetNote = db
    .prepare('SELECT title FROM notes WHERE path = ?')
    .get(notePath) as { title: string } | undefined;

  // Also get the filename without extension for matching
  const filenameWithoutExt = basename(notePath, '.md');

  // Build possible match targets (case-insensitive)
  const possibleTargets: string[] = [
    notePath, // Full path
    filenameWithoutExt, // Filename without .md
  ];

  if (targetNote) {
    possibleTargets.push(targetNote.title);
  }

  // Find all notes that link to any of these targets
  const placeholders = possibleTargets.map(() => 'LOWER(target_path) = LOWER(?)').join(' OR ');
  const links = db
    .prepare(
      `SELECT DISTINCT n.path as source_path, l.target_path
       FROM links l
       JOIN notes n ON n.id = l.source_id
       WHERE ${placeholders}`
    )
    .all(...possibleTargets) as { source_path: string; target_path: string }[];

  return links.map((link) => ({
    source: link.source_path,
    target: notePath, // Normalize to the actual path
    resolved: true, // We know the target exists since we're querying it
  }));
}

/**
 * Check if a link target resolves to an existing note
 */
export function isLinkResolved(db: Database.Database, target: string): boolean {
  // Try exact path match first
  const exactMatch = db
    .prepare('SELECT 1 FROM notes WHERE path = ? LIMIT 1')
    .get(target);

  if (exactMatch) {
    return true;
  }

  // Try case-insensitive title match
  const titleMatch = db
    .prepare('SELECT 1 FROM notes WHERE LOWER(title) = LOWER(?) LIMIT 1')
    .get(target);

  if (titleMatch) {
    return true;
  }

  // Try filename match (without extension)
  const filenameMatch = db
    .prepare(
      `SELECT 1 FROM notes
       WHERE LOWER(path) LIKE '%/' || LOWER(?) || '.md'
       OR LOWER(path) = LOWER(?) || '.md'
       LIMIT 1`
    )
    .get(target, target);

  return !!filenameMatch;
}

/**
 * Resolve a link target to an actual note path
 * Returns null if the target doesn't resolve to any note
 */
export function resolveLinkTarget(db: Database.Database, target: string): string | null {
  // Try exact path match first
  const exactMatch = db
    .prepare('SELECT path FROM notes WHERE path = ? LIMIT 1')
    .get(target) as { path: string } | undefined;

  if (exactMatch) {
    return exactMatch.path;
  }

  // Try case-insensitive title match
  const titleMatch = db
    .prepare('SELECT path FROM notes WHERE LOWER(title) = LOWER(?) LIMIT 1')
    .get(target) as { path: string } | undefined;

  if (titleMatch) {
    return titleMatch.path;
  }

  // Try filename match (without extension)
  const filenameMatch = db
    .prepare(
      `SELECT path FROM notes
       WHERE LOWER(path) LIKE '%/' || LOWER(?) || '.md'
       OR LOWER(path) = LOWER(?) || '.md'
       LIMIT 1`
    )
    .get(target, target) as { path: string } | undefined;

  if (filenameMatch) {
    return filenameMatch.path;
  }

  return null;
}

/**
 * Get both incoming and outgoing links for a note
 */
export function getAllLinks(db: Database.Database, notePath: string): {
  incoming: GraphLink[];
  outgoing: GraphLink[];
} {
  return {
    incoming: getIncomingLinks(db, notePath),
    outgoing: getOutgoingLinks(db, notePath),
  };
}

/**
 * Get all broken (unresolved) links in the vault
 */
export function getBrokenLinks(db: Database.Database): GraphLink[] {
  // Get all links
  const allLinks = db
    .prepare(
      `SELECT n.path as source_path, l.target_path
       FROM links l
       JOIN notes n ON n.id = l.source_id`
    )
    .all() as { source_path: string; target_path: string }[];

  // Filter to only unresolved links
  return allLinks
    .filter((link) => !isLinkResolved(db, link.target_path))
    .map((link) => ({
      source: link.source_path,
      target: link.target_path,
      resolved: false,
    }));
}

/**
 * Convert a database row to NoteMetadata
 */
export function rowToNoteMetadata(
  db: Database.Database,
  row: {
    path: string;
    title: string | null;
    type: string | null;
    created: string | null;
    modified: string | null;
    source: string | null;
    confidence: number | null;
    verified: number | null;
  }
): NoteMetadata {
  const frontmatter: NoteFrontmatter = {
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

  // Get tags for this note
  const noteId = db
    .prepare('SELECT id FROM notes WHERE path = ?')
    .get(row.path) as { id: number } | undefined;

  if (noteId) {
    const tags = db
      .prepare('SELECT tag FROM note_tags WHERE note_id = ?')
      .all(noteId.id) as { tag: string }[];
    if (tags.length > 0) {
      frontmatter.tags = tags.map((t) => t.tag);
    }
  }

  return {
    path: row.path,
    filename: basename(row.path),
    title: row.title ?? basename(row.path, '.md'),
    frontmatter,
  };
}

/**
 * Get note metadata by path
 */
export function getNoteMetadataByPath(db: Database.Database, path: string): NoteMetadata | null {
  const row = db
    .prepare(
      `SELECT path, title, type, created, modified, source, confidence, verified
       FROM notes WHERE path = ?`
    )
    .get(path) as {
    path: string;
    title: string | null;
    type: string | null;
    created: string | null;
    modified: string | null;
    source: string | null;
    confidence: number | null;
    verified: number | null;
  } | undefined;

  if (!row) {
    return null;
  }

  return rowToNoteMetadata(db, row);
}
