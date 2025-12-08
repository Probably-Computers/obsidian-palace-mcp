/**
 * Query builder for SQLite FTS5 search and filtering
 * Supports single-vault and cross-vault queries
 */

import Database from 'better-sqlite3';
import { getIndexManager } from './manager.js';
import { getVaultRegistry } from '../vault/registry.js';
import {
  addVaultAttribution,
  addVaultAttributionToNote,
  aggregateSearchResults,
  aggregateQueryResults,
  type VaultSearchResult,
  type VaultQueryResult,
} from './aggregator.js';
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
 * Cross-vault search options
 */
export interface CrossVaultSearchOptions extends SearchOptions {
  vaults?: string[]; // Limit to specific vaults
  excludeVaults?: string[]; // Exclude specific vaults
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
 * Cross-vault filter options
 */
export interface CrossVaultFilterOptions extends FilterOptions {
  vaults?: string[];
  excludeVaults?: string[];
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
    tags: [],
    related: [],
    aliases: [],
  };

  const source = row.source as string | null;
  if (source) {
    frontmatter.source = source as KnowledgeSource;
  }
  // Always include confidence - default to 0.5 (unknown/moderate) if not set
  frontmatter.confidence = row.confidence != null ? (row.confidence as number) : 0.5;

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
  return query
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `"${word}"`)
    .join(' OR ');
}

/**
 * Search notes in a single vault using FTS5
 */
export function searchNotesInVault(
  db: Database.Database,
  options: SearchOptions
): SearchResult[] {
  const { query, type, tags, path, minConfidence, limit = 20, offset = 0 } = options;

  logger.debug('FTS5 search:', { query, type, tags, path, minConfidence });

  const ftsQuery = escapeFtsQuery(query);

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

  sql += ' ORDER BY rank';
  sql += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

    return rows.map((row) => ({
      note: rowToMetadata(row),
      score: Math.abs(row.rank as number) * 10,
    }));
  } catch (error) {
    logger.error('FTS5 search error:', error);
    throw error;
  }
}

/**
 * Search across all vaults (or specified vaults)
 */
export async function searchAllVaults(
  options: CrossVaultSearchOptions
): Promise<VaultSearchResult[]> {
  const registry = getVaultRegistry();
  const manager = getIndexManager();

  // Check if cross-vault search is enabled
  if (!registry.isCrossVaultSearchEnabled()) {
    // Search only default vault
    const defaultVault = registry.getDefaultVault();
    const db = await manager.getIndex(defaultVault.alias);
    const results = searchNotesInVault(db, options);
    return results.map((r) => addVaultAttribution(r, defaultVault.alias));
  }

  // Determine which vaults to search
  let vaultsToSearch = registry.listVaults();

  if (options.vaults && options.vaults.length > 0) {
    vaultsToSearch = vaultsToSearch.filter((v) => options.vaults!.includes(v.alias));
  }

  if (options.excludeVaults && options.excludeVaults.length > 0) {
    vaultsToSearch = vaultsToSearch.filter((v) => !options.excludeVaults!.includes(v.alias));
  }

  // Search all vaults in parallel
  const searchPromises = vaultsToSearch.map(async (vault) => {
    try {
      const db = await manager.getIndex(vault.alias);
      const results = searchNotesInVault(db, options);
      return results.map((r) => addVaultAttribution(r, vault.alias));
    } catch (error) {
      logger.error(`Failed to search vault ${vault.alias}:`, error);
      return [];
    }
  });

  const allResults = await Promise.all(searchPromises);
  const flatResults = allResults.flat();

  // Aggregate and rank
  return aggregateSearchResults(flatResults, options.limit);
}

/**
 * Query notes in a single vault by properties
 */
export function queryNotesInVault(
  db: Database.Database,
  options: FilterOptions
): NoteMetadata[] {
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

  const validSortColumns = ['created', 'modified', 'title', 'confidence'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'modified';
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortColumn} ${order}`;

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
 * Query across all vaults (or specified vaults)
 */
export async function queryAllVaults(
  options: CrossVaultFilterOptions
): Promise<VaultQueryResult[]> {
  const registry = getVaultRegistry();
  const manager = getIndexManager();

  // Determine which vaults to query
  let vaultsToQuery = registry.listVaults();

  if (options.vaults && options.vaults.length > 0) {
    vaultsToQuery = vaultsToQuery.filter((v) => options.vaults!.includes(v.alias));
  }

  if (options.excludeVaults && options.excludeVaults.length > 0) {
    vaultsToQuery = vaultsToQuery.filter((v) => !options.excludeVaults!.includes(v.alias));
  }

  // Query all vaults in parallel
  const queryPromises = vaultsToQuery.map(async (vault) => {
    try {
      const db = await manager.getIndex(vault.alias);
      const results = queryNotesInVault(db, options);
      return results.map((note) => addVaultAttributionToNote(note, vault.alias));
    } catch (error) {
      logger.error(`Failed to query vault ${vault.alias}:`, error);
      return [];
    }
  });

  const allResults = await Promise.all(queryPromises);
  const flatResults = allResults.flat();

  // Aggregate
  return aggregateQueryResults(flatResults, options.limit);
}

/**
 * Get tags for a note in a specific vault
 */
export function getNoteTags(db: Database.Database, noteId: number): string[] {
  const rows = db
    .prepare('SELECT tag FROM note_tags WHERE note_id = ?')
    .all(noteId) as { tag: string }[];
  return rows.map((r) => r.tag);
}

/**
 * Get note by path in a specific vault
 */
export function getNoteByPath(db: Database.Database, path: string): NoteMetadata | null {
  const row = db
    .prepare('SELECT * FROM notes WHERE path = ?')
    .get(path) as Record<string, unknown> | undefined;

  if (!row) return null;

  const metadata = rowToMetadata(row);
  metadata.frontmatter.tags = getNoteTags(db, row.id as number);
  return metadata;
}

/**
 * Get total count of notes matching filter in a vault
 */
export function countNotesInVault(
  db: Database.Database,
  options: Omit<FilterOptions, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>
): number {
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

/**
 * Count notes across all vaults
 */
export async function countNotesAllVaults(
  options: Omit<CrossVaultFilterOptions, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>
): Promise<number> {
  const registry = getVaultRegistry();
  const manager = getIndexManager();

  let vaultsToCount = registry.listVaults();

  if (options.vaults && options.vaults.length > 0) {
    vaultsToCount = vaultsToCount.filter((v) => options.vaults!.includes(v.alias));
  }

  if (options.excludeVaults && options.excludeVaults.length > 0) {
    vaultsToCount = vaultsToCount.filter((v) => !options.excludeVaults!.includes(v.alias));
  }

  const countPromises = vaultsToCount.map(async (vault) => {
    try {
      const db = await manager.getIndex(vault.alias);
      return countNotesInVault(db, options);
    } catch (error) {
      logger.error(`Failed to count notes in vault ${vault.alias}:`, error);
      return 0;
    }
  });

  const counts = await Promise.all(countPromises);
  return counts.reduce((sum, count) => sum + count, 0);
}
