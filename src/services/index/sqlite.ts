/**
 * SQLite database schema and initialization utilities
 *
 * Database connections are managed by VaultIndexManager in manager.ts.
 * This module provides schema definitions and initialization helpers.
 */

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

// Schema version for migrations
export const SCHEMA_VERSION = 4;

// SQL statements for schema creation
export const SCHEMA_SQL = `
-- Notes table
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT,
    type TEXT,
    created TEXT,
    modified TEXT,
    source TEXT,
    confidence REAL,
    verified INTEGER DEFAULT 0,
    content TEXT,
    content_hash TEXT
);

-- Tags junction table
CREATE TABLE IF NOT EXISTS note_tags (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    UNIQUE(note_id, tag)
);

-- Links (wiki-links) table
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY,
    source_id INTEGER NOT NULL,
    target_path TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(path);
CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);
CREATE INDEX IF NOT EXISTS idx_links_source_id ON links(source_id);
`;

// FTS5 virtual table for full-text search
export const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content,
    content='notes',
    content_rowid='id'
);

-- Triggers to keep FTS in sync with notes table
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content)
    VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
    INSERT INTO notes_fts(rowid, title, content)
    VALUES (new.id, new.title, new.content);
END;
`;

/**
 * Initialize database schema
 */
export function initializeSchema(db: Database.Database): void {
  // Check current schema version
  const hasVersionTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    .get();

  let currentVersion = 0;
  if (hasVersionTable) {
    const row = db
      .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined;
    currentVersion = row?.version ?? 0;
  }

  if (currentVersion < SCHEMA_VERSION) {
    logger.debug(`Migrating database from version ${currentVersion} to ${SCHEMA_VERSION}`);
    runMigrations(db, currentVersion);
  }
}

/**
 * Run database migrations
 */
function runMigrations(db: Database.Database, fromVersion: number): void {
  db.exec('BEGIN TRANSACTION');

  try {
    if (fromVersion < 1) {
      // Initial schema
      db.exec(SCHEMA_SQL);
      db.exec(FTS_SQL);
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(1);
    }

    // Migration 2: Add status and stub tracking
    if (fromVersion < 2) {
      // Add status column for stub/active tracking
      db.exec(`
        ALTER TABLE notes ADD COLUMN status TEXT DEFAULT 'active';
        ALTER TABLE notes ADD COLUMN mentioned_in TEXT;
        ALTER TABLE notes ADD COLUMN tags TEXT;
        ALTER TABLE notes ADD COLUMN related TEXT;
        ALTER TABLE notes ADD COLUMN aliases TEXT;
        ALTER TABLE notes ADD COLUMN palace_version INTEGER DEFAULT 1;
      `);

      // Create index for status queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
      `);

      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(2);
    }

    // Migration 3: Add technology mentions tracking
    if (fromVersion < 3) {
      db.exec(`
        -- Technology mentions table
        CREATE TABLE IF NOT EXISTS technology_mentions (
          id INTEGER PRIMARY KEY,
          note_id INTEGER NOT NULL,
          technology TEXT NOT NULL,
          mention_count INTEGER DEFAULT 1,
          first_mentioned TEXT,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          UNIQUE(note_id, technology)
        );

        -- Index for technology lookups
        CREATE INDEX IF NOT EXISTS idx_tech_mentions_tech ON technology_mentions(technology);
        CREATE INDEX IF NOT EXISTS idx_tech_mentions_note ON technology_mentions(note_id);
      `);

      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(3);
    }

    // Migration 4: Add standards tracking fields
    if (fromVersion < 4) {
      db.exec(`
        -- Add ai_binding field for standards
        ALTER TABLE notes ADD COLUMN ai_binding TEXT;

        -- Add applies_to field (JSON array)
        ALTER TABLE notes ADD COLUMN applies_to TEXT;

        -- Add domain field (JSON array)
        ALTER TABLE notes ADD COLUMN domain TEXT;

        -- Create index for ai_binding queries (for loading required standards)
        CREATE INDEX IF NOT EXISTS idx_notes_ai_binding ON notes(ai_binding);
      `);

      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(4);
    }

    // Future migrations go here:
    // if (fromVersion < 5) { ... }

    db.exec('COMMIT');
    logger.debug('Database migration completed');
  } catch (error) {
    db.exec('ROLLBACK');
    logger.error('Database migration failed', error);
    throw error;
  }
}

/**
 * Create and initialize a new database connection
 */
export function createDatabase(dbPath: string): Database.Database {
  logger.info(`Opening database at: ${dbPath}`);

  // Open database with WAL mode for better concurrency
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(db);

  return db;
}
