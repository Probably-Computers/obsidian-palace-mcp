/**
 * Index Metadata Sync (Phase 025)
 *
 * Ensures index reflects actual file frontmatter.
 * Detects and repairs desync between files and index.
 */

import type Database from 'better-sqlite3';
import { readNote, listNotes, type ReadOptions } from '../vault/index.js';
import { indexNote } from '../index/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Desync information
 */
export interface IndexDesync {
  path: string;
  type: 'missing_in_index' | 'missing_in_vault' | 'metadata_mismatch';
  details: string;
  fileValue?: unknown;
  indexValue?: unknown;
}

/**
 * Sync result
 */
export interface IndexSyncResult {
  notesInVault: number;
  notesInIndex: number;
  desyncs: IndexDesync[];
  repaired: number;
}

/**
 * Check sync status between vault files and index
 */
export async function checkIndexSync(
  db: Database.Database,
  vaultPath: string,
  readOptions: ReadOptions
): Promise<IndexSyncResult> {
  const desyncs: IndexDesync[] = [];

  // Get all notes from vault
  const vaultNotes = await listNotes('', true, readOptions);
  const vaultPaths = new Set(vaultNotes.map((n) => n.path));

  // Get all notes from index
  const indexNotes = db
    .prepare('SELECT path, type, modified, confidence, tags, domain FROM notes')
    .all() as Array<{
    path: string;
    type: string | null;
    modified: string | null;
    confidence: number | null;
    tags: string | null;
    domain: string | null;
  }>;
  const indexPaths = new Set(indexNotes.map((n) => n.path));

  // Find notes missing in index
  for (const vaultNote of vaultNotes) {
    if (!indexPaths.has(vaultNote.path)) {
      desyncs.push({
        path: vaultNote.path,
        type: 'missing_in_index',
        details: 'Note exists in vault but not in index',
      });
    }
  }

  // Find notes missing in vault (stale index entries)
  for (const indexNote of indexNotes) {
    if (!vaultPaths.has(indexNote.path)) {
      desyncs.push({
        path: indexNote.path,
        type: 'missing_in_vault',
        details: 'Note exists in index but not in vault (deleted?)',
      });
    }
  }

  // Check metadata mismatches for notes in both
  for (const indexNote of indexNotes) {
    if (!vaultPaths.has(indexNote.path)) continue;

    const vaultNote = await readNote(indexNote.path, readOptions);
    if (!vaultNote) continue;

    const fm = vaultNote.frontmatter;

    // Check type
    if (fm.type !== indexNote.type && fm.type !== undefined) {
      desyncs.push({
        path: indexNote.path,
        type: 'metadata_mismatch',
        details: 'Type mismatch',
        fileValue: fm.type,
        indexValue: indexNote.type,
      });
    }

    // Check modified timestamp (only if significantly different)
    if (fm.modified && indexNote.modified) {
      const fileDate = new Date(fm.modified).getTime();
      const indexDate = new Date(indexNote.modified).getTime();
      // Allow 1 second tolerance
      if (Math.abs(fileDate - indexDate) > 1000) {
        desyncs.push({
          path: indexNote.path,
          type: 'metadata_mismatch',
          details: 'Modified timestamp mismatch',
          fileValue: fm.modified,
          indexValue: indexNote.modified,
        });
      }
    }

    // Check confidence
    if (
      fm.confidence !== undefined &&
      indexNote.confidence !== null &&
      Math.abs((fm.confidence ?? 0) - indexNote.confidence) > 0.01
    ) {
      desyncs.push({
        path: indexNote.path,
        type: 'metadata_mismatch',
        details: 'Confidence mismatch',
        fileValue: fm.confidence,
        indexValue: indexNote.confidence,
      });
    }
  }

  return {
    notesInVault: vaultPaths.size,
    notesInIndex: indexPaths.size,
    desyncs,
    repaired: 0,
  };
}

/**
 * Repair index by reindexing desynced notes
 */
export async function repairIndexSync(
  db: Database.Database,
  vaultPath: string,
  readOptions: ReadOptions,
  desyncs: IndexDesync[]
): Promise<number> {
  let repaired = 0;

  for (const desync of desyncs) {
    switch (desync.type) {
      case 'missing_in_index': {
        // Reindex the note
        const note = await readNote(desync.path, readOptions);
        if (note) {
          indexNote(db, note);
          repaired++;
          logger.debug(`Reindexed missing note: ${desync.path}`);
        }
        break;
      }

      case 'missing_in_vault': {
        // Remove stale index entry
        db.prepare('DELETE FROM notes WHERE path = ?').run(desync.path);
        repaired++;
        logger.debug(`Removed stale index entry: ${desync.path}`);
        break;
      }

      case 'metadata_mismatch': {
        // Reindex to fix mismatch
        const note = await readNote(desync.path, readOptions);
        if (note) {
          indexNote(db, note);
          repaired++;
          logger.debug(`Reindexed mismatched note: ${desync.path}`);
        }
        break;
      }
    }
  }

  return repaired;
}

/**
 * Perform full reindex of vault
 */
export async function fullReindex(
  db: Database.Database,
  vaultPath: string,
  readOptions: ReadOptions
): Promise<{ indexed: number; errors: number }> {
  // Clear existing index
  db.exec('DELETE FROM notes');
  db.exec('DELETE FROM links');
  logger.info('Cleared index for full reindex');

  // Get all notes
  const notes = await listNotes('', true, readOptions);
  let indexed = 0;
  let errors = 0;

  for (const noteMeta of notes) {
    try {
      const note = await readNote(noteMeta.path, readOptions);
      if (note) {
        indexNote(db, note);
        indexed++;
      }
    } catch (error) {
      logger.error(`Failed to index ${noteMeta.path}:`, error);
      errors++;
    }
  }

  logger.info(`Full reindex complete: ${indexed} notes indexed, ${errors} errors`);

  return { indexed, errors };
}
