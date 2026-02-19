/**
 * Tests for index-sync service (Phase 025)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../../src/services/vault/index.js', () => ({
  readNote: vi.fn(),
  listNotes: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  indexNote: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { checkIndexSync, repairIndexSync, fullReindex } from '../../../src/services/metadata/index-sync.js';
import { readNote, listNotes } from '../../../src/services/vault/index.js';
import { indexNote } from '../../../src/services/index/index.js';

const readOptions = { vaultPath: '/tmp/vault' };

describe('index-sync', () => {
  let db: Database.Database;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        title TEXT,
        type TEXT,
        modified TEXT,
        confidence REAL,
        tags TEXT,
        domain TEXT,
        related TEXT DEFAULT '[]'
      )
    `);
    db.exec(`
      CREATE TABLE links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER,
        target_path TEXT
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  function insertNote(path: string, type: string, modified: string, confidence: number) {
    db.prepare(
      'INSERT INTO notes (path, title, type, modified, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run(path, path, type, modified, confidence);
  }

  describe('checkIndexSync', () => {
    it('returns empty desyncs when everything is in sync', async () => {
      insertNote('note1.md', 'research', '2025-01-01T00:00:00Z', 0.8);
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'note1.md', frontmatter: {} },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: 'note1.md',
        frontmatter: { type: 'research', modified: '2025-01-01T00:00:00Z', confidence: 0.8 },
      });

      const result = await checkIndexSync(db, '/tmp/vault', readOptions);
      expect(result.notesInVault).toBe(1);
      expect(result.notesInIndex).toBe(1);
      expect(result.desyncs).toHaveLength(0);
    });

    it('detects notes missing from index', async () => {
      // vault has note, index does not
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'new-note.md', frontmatter: {} },
      ]);

      const result = await checkIndexSync(db, '/tmp/vault', readOptions);
      expect(result.desyncs).toHaveLength(1);
      expect(result.desyncs[0].type).toBe('missing_in_index');
      expect(result.desyncs[0].path).toBe('new-note.md');
    });

    it('detects notes missing from vault (stale index entries)', async () => {
      insertNote('deleted-note.md', 'research', '2025-01-01', 0.8);
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await checkIndexSync(db, '/tmp/vault', readOptions);
      expect(result.desyncs).toHaveLength(1);
      expect(result.desyncs[0].type).toBe('missing_in_vault');
      expect(result.desyncs[0].path).toBe('deleted-note.md');
    });

    it('detects type mismatch', async () => {
      insertNote('note1.md', 'research', '2025-01-01T00:00:00Z', 0.8);
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'note1.md', frontmatter: {} },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: 'note1.md',
        frontmatter: { type: 'command', modified: '2025-01-01T00:00:00Z', confidence: 0.8 },
      });

      const result = await checkIndexSync(db, '/tmp/vault', readOptions);
      const mismatch = result.desyncs.find(d => d.details === 'Type mismatch');
      expect(mismatch).toBeDefined();
      expect(mismatch!.fileValue).toBe('command');
      expect(mismatch!.indexValue).toBe('research');
    });

    it('detects modified timestamp mismatch', async () => {
      insertNote('note1.md', 'research', '2025-01-01T00:00:00Z', 0.8);
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'note1.md', frontmatter: {} },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: 'note1.md',
        frontmatter: { type: 'research', modified: '2025-06-15T12:00:00Z', confidence: 0.8 },
      });

      const result = await checkIndexSync(db, '/tmp/vault', readOptions);
      const mismatch = result.desyncs.find(d => d.details === 'Modified timestamp mismatch');
      expect(mismatch).toBeDefined();
    });

    it('detects confidence mismatch', async () => {
      insertNote('note1.md', 'research', '2025-01-01T00:00:00Z', 0.8);
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'note1.md', frontmatter: {} },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: 'note1.md',
        frontmatter: { type: 'research', modified: '2025-01-01T00:00:00Z', confidence: 0.5 },
      });

      const result = await checkIndexSync(db, '/tmp/vault', readOptions);
      const mismatch = result.desyncs.find(d => d.details === 'Confidence mismatch');
      expect(mismatch).toBeDefined();
      expect(mismatch!.fileValue).toBe(0.5);
      expect(mismatch!.indexValue).toBe(0.8);
    });

    it('tolerates small timestamp differences (< 1s)', async () => {
      insertNote('note1.md', 'research', '2025-01-01T00:00:00.000Z', 0.8);
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'note1.md', frontmatter: {} },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: 'note1.md',
        frontmatter: { type: 'research', modified: '2025-01-01T00:00:00.500Z', confidence: 0.8 },
      });

      const result = await checkIndexSync(db, '/tmp/vault', readOptions);
      const mismatch = result.desyncs.find(d => d.details === 'Modified timestamp mismatch');
      expect(mismatch).toBeUndefined();
    });
  });

  describe('repairIndexSync', () => {
    it('reindexes notes missing from index', async () => {
      const note = { path: 'new.md', frontmatter: { type: 'research' } };
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

      const repaired = await repairIndexSync(db, '/tmp/vault', readOptions, [
        { path: 'new.md', type: 'missing_in_index', details: 'Missing' },
      ]);

      expect(repaired).toBe(1);
      expect(indexNote).toHaveBeenCalledWith(db, note);
    });

    it('removes stale entries for missing_in_vault', async () => {
      insertNote('stale.md', 'research', '2025-01-01', 0.8);

      const repaired = await repairIndexSync(db, '/tmp/vault', readOptions, [
        { path: 'stale.md', type: 'missing_in_vault', details: 'Stale' },
      ]);

      expect(repaired).toBe(1);
      const remaining = db.prepare('SELECT * FROM notes WHERE path = ?').get('stale.md');
      expect(remaining).toBeUndefined();
    });

    it('reindexes notes with metadata mismatch', async () => {
      const note = { path: 'mismatch.md', frontmatter: { type: 'command' } };
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

      const repaired = await repairIndexSync(db, '/tmp/vault', readOptions, [
        { path: 'mismatch.md', type: 'metadata_mismatch', details: 'Type mismatch' },
      ]);

      expect(repaired).toBe(1);
      expect(indexNote).toHaveBeenCalledWith(db, note);
    });

    it('skips repair when readNote returns null', async () => {
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const repaired = await repairIndexSync(db, '/tmp/vault', readOptions, [
        { path: 'gone.md', type: 'missing_in_index', details: 'Missing' },
      ]);

      expect(repaired).toBe(0);
      expect(indexNote).not.toHaveBeenCalled();
    });
  });

  describe('fullReindex', () => {
    it('clears index and reindexes all notes', async () => {
      insertNote('old.md', 'research', '2025-01-01', 0.8);
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'note1.md' },
        { path: 'note2.md' },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: 'note1.md',
        frontmatter: { type: 'research' },
      });

      const result = await fullReindex(db, '/tmp/vault', readOptions);
      expect(result.indexed).toBe(2);
      expect(result.errors).toBe(0);

      // Old note should be gone (table was cleared)
      const rows = db.prepare('SELECT * FROM notes').all();
      expect(rows).toHaveLength(0); // notes table cleared, indexNote is mocked
    });

    it('counts errors when readNote throws', async () => {
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'ok.md' },
        { path: 'bad.md' },
      ]);
      (readNote as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ path: 'ok.md', frontmatter: {} })
        .mockRejectedValueOnce(new Error('Read failed'));

      const result = await fullReindex(db, '/tmp/vault', readOptions);
      expect(result.indexed).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('returns zero counts for empty vault', async () => {
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await fullReindex(db, '/tmp/vault', readOptions);
      expect(result.indexed).toBe(0);
      expect(result.errors).toBe(0);
    });
  });
});
