/**
 * Query builder for SQLite FTS5 search and filtering
 */

import { getDatabaseSync } from './sqlite.js';
import { logger } from '../../utils/logger.js';
import type { NoteMetadata, NoteFrontmatter, SearchResult, KnowledgeSource } from '../../types/index.js';

/**
 * Search options for FTS5 queries
 */
export interface SearchOptions {
  query: string;
  type?: string;
  tags?: string[];
  path?: string;
  minConfidence?: number;
  verified?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Filter options for property-based queries
 */
export interface FilterOptions {
  type?: string;
  tags?: string[];
  path?: string;
  source?: string;
  minConfidence?: number;
  maxConfidence?: number;
  verified?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  sortBy?: 'created' | 'modified' | 'title' | 'confidence';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Convert a note row to NoteMetadata
 */
function rowToMetadata(row: Record<string, unknown>): NoteMetadata {
  const frontmatter: NoteFrontmatter = {
    type: row.type as NoteFrontmatter['type'],
    created: row.created as string,
    modified: row.modified as string,
    verified: Boolean(row.verified),
    tags: [], // Will be populated separately if needed
    related: [],
    aliases: [],
  };

  // Only set optional properties if they have values
  const source = row.source as string | null;
  if (source) {
    frontmatter.source = source as KnowledgeSource;
  }
  if (row.confidence != null) {
    frontmatter.confidence = row.confidence as number;
  }

  return {
    path: row.path as string,
    filename: (row.path as string).split('/').pop() ?? '',
    title: row.title as string,
    frontmatter,
  };
}

/**
 * Escape FTS5 special characters in search query
 */
function escapeFtsQuery(query: string): string {
  // FTS5 special characters that need quoting
  return query
    .replace(/"/g, '""') // Escape double quotes
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `"${word}"`)
    .join(' OR ');
}

/**
 * Search notes using FTS5 full-text search
 */
export function searchNotes(options: SearchOptions): SearchResult[] {
  const db = getDatabaseSync();
  const { query, type, tags, path, minConfidence, limit = 20, offset = 0 } = options;

  logger.debug('FTS5 search:', { query, type, tags, path, minConfidence });

  // Build the FTS5 query
  const ftsQuery = escapeFtsQuery(query);

  // Base query with FTS5 search and ranking
  let sql = `
    SELECT
      n.id, n.path, n.title, n.type, n.created, n.modified,
      n.source, n.confidence, n.verified, n.content,
      bm25(notes_fts) as rank
    FROM notes_fts
    JOIN notes n ON notes_fts.rowid = n.id
    WHERE notes_fts MATCH ?
  `;

  const params: unknown[] = [ftsQuery];

  // Add filters
  if (type && type !== 'all') {
    sql += ' AND n.type = ?';
    params.push(type);
  }

  if (path) {
    sql += ' AND n.path LIKE ?';
    params.push(`${path}%`);
  }

  if (minConfidence !== undefined) {
    sql += ' AND n.confidence >= ?';
    params.push(minConfidence);
  }

  // Handle tags filter (notes must have ALL specified tags)
  if (tags && tags.length > 0) {
    sql += `
      AND n.id IN (
        SELECT note_id FROM note_tags
        WHERE tag IN (${tags.map(() => '?').join(', ')})
        GROUP BY note_id
        HAVING COUNT(DISTINCT tag) = ?
      )
    `;
    params.push(...tags, tags.length);
  }

  // Order by relevance (bm25 score, lower is better)
  sql += ' ORDER BY rank';
  sql += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

    return rows.map((row) => ({
      note: rowToMetadata(row),
      score: Math.abs(row.rank as number) * 10, // Convert bm25 score to positive
    }));
  } catch (error) {
    logger.error('FTS5 search error:', error);
    throw error;
  }
}

/**
 * Query notes by properties (without full-text search)
 */
export function queryNotes(options: FilterOptions): NoteMetadata[] {
  const db = getDatabaseSync();
  const {
    type,
    tags,
    path,
    source,
    minConfidence,
    maxConfidence,
    verified,
    createdAfter,
    createdBefore,
    modifiedAfter,
    modifiedBefore,
    sortBy = 'modified',
    sortOrder = 'desc',
    limit = 50,
    offset = 0,
  } = options;

  let sql = 'SELECT * FROM notes WHERE 1=1';
  const params: unknown[] = [];

  // Build filter conditions
  if (type && type !== 'all') {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (path) {
    sql += ' AND path LIKE ?';
    params.push(`${path}%`);
  }

  if (source) {
    sql += ' AND source = ?';
    params.push(source);
  }

  if (minConfidence !== undefined) {
    sql += ' AND confidence >= ?';
    params.push(minConfidence);
  }

  if (maxConfidence !== undefined) {
    sql += ' AND confidence <= ?';
    params.push(maxConfidence);
  }

  if (verified !== undefined) {
    sql += ' AND verified = ?';
    params.push(verified ? 1 : 0);
  }

  if (createdAfter) {
    sql += ' AND created >= ?';
    params.push(createdAfter);
  }

  if (createdBefore) {
    sql += ' AND created <= ?';
    params.push(createdBefore);
  }

  if (modifiedAfter) {
    sql += ' AND modified >= ?';
    params.push(modifiedAfter);
  }

  if (modifiedBefore) {
    sql += ' AND modified <= ?';
    params.push(modifiedBefore);
  }

  // Handle tags filter
  if (tags && tags.length > 0) {
    sql += `
      AND id IN (
        SELECT note_id FROM note_tags
        WHERE tag IN (${tags.map(() => '?').join(', ')})
        GROUP BY note_id
        HAVING COUNT(DISTINCT tag) = ?
      )
    `;
    params.push(...tags, tags.length);
  }

  // Sorting
  const validSortColumns = ['created', 'modified', 'title', 'confidence'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'modified';
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortColumn} ${order}`;

  // Pagination
  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  try {
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToMetadata);
  } catch (error) {
    logger.error('Query error:', error);
    throw error;
  }
}

/**
 * Get tags for a note
 */
export function getNoteTags(noteId: number): string[] {
  const db = getDatabaseSync();
  const rows = db
    .prepare('SELECT tag FROM note_tags WHERE note_id = ?')
    .all(noteId) as { tag: string }[];
  return rows.map((r) => r.tag);
}

/**
 * Get note by path
 */
export function getNoteByPath(path: string): NoteMetadata | null {
  const db = getDatabaseSync();
  const row = db
    .prepare('SELECT * FROM notes WHERE path = ?')
    .get(path) as Record<string, unknown> | undefined;

  if (!row) return null;

  const metadata = rowToMetadata(row);
  metadata.frontmatter.tags = getNoteTags(row.id as number);
  return metadata;
}

/**
 * Get total count of notes matching filter
 */
export function countNotes(options: Omit<FilterOptions, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>): number {
  const db = getDatabaseSync();
  const { type, tags, path, minConfidence, verified } = options;

  let sql = 'SELECT COUNT(*) as count FROM notes WHERE 1=1';
  const params: unknown[] = [];

  if (type && type !== 'all') {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (path) {
    sql += ' AND path LIKE ?';
    params.push(`${path}%`);
  }

  if (minConfidence !== undefined) {
    sql += ' AND confidence >= ?';
    params.push(minConfidence);
  }

  if (verified !== undefined) {
    sql += ' AND verified = ?';
    params.push(verified ? 1 : 0);
  }

  if (tags && tags.length > 0) {
    sql += `
      AND id IN (
        SELECT note_id FROM note_tags
        WHERE tag IN (${tags.map(() => '?').join(', ')})
        GROUP BY note_id
        HAVING COUNT(DISTINCT tag) = ?
      )
    `;
    params.push(...tags, tags.length);
  }

  const row = db.prepare(sql).get(...params) as { count: number };
  return row.count;
}
