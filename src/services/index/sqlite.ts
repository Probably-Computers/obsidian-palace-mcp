/**
 * SQLite database schema and initialization utilities
 *
 * Database connections are managed by VaultIndexManager in manager.ts.
 * This module provides schema definitions and initialization helpers.
 */

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

// Schema version (for future migrations if needed)
export const SCHEMA_VERSION = 1;

// SQL statements for schema creation - unified schema with all columns
export const SCHEMA_SQL = `
-- Notes table (unified schema with all fields)
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT,
    type TEXT,
    status TEXT DEFAULT 'active',
    domain TEXT,
    tags TEXT,
    related TEXT,
    aliases TEXT,
    mentioned_in TEXT,
    parent_path TEXT,
    technology_path TEXT,
    source TEXT,
    confidence REAL,
    verified INTEGER DEFAULT 0,
    ai_binding TEXT,
    applies_to TEXT,
    created TEXT,
    modified TEXT,
    content TEXT,
    content_hash TEXT,
    line_count INTEGER,
    section_count INTEGER,
    word_count INTEGER,
    palace_version INTEGER DEFAULT 1,
    last_agent TEXT,
    children_count INTEGER DEFAULT 0
);

-- Tags junction table
CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER,
    tag TEXT,
    PRIMARY KEY (note_id, tag),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Domain junction table (note to domain relationship)
CREATE TABLE IF NOT EXISTS note_domains (
    note_id INTEGER,
    domain TEXT,
    position INTEGER,
    PRIMARY KEY (note_id, domain, position),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Domains table (Phase 017 - tracks domain hierarchy)
CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    level INTEGER NOT NULL,
    parent_path TEXT,
    note_count INTEGER DEFAULT 0,
    created TEXT NOT NULL,
    last_used TEXT NOT NULL,
    FOREIGN KEY (parent_path) REFERENCES domains(path) ON DELETE SET NULL
);

-- Links table
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY,
    source_id INTEGER,
    target_path TEXT,
    target_id INTEGER,
    link_text TEXT,
    resolved INTEGER DEFAULT 0,
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE SET NULL
);

-- Technology mentions table
CREATE TABLE IF NOT EXISTS technology_mentions (
    id INTEGER PRIMARY KEY,
    note_id INTEGER,
    technology TEXT,
    mention_count INTEGER DEFAULT 1,
    first_mentioned TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    UNIQUE(note_id, technology)
);

-- Authors table
CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY,
    note_id INTEGER,
    agent TEXT,
    action TEXT,
    date TEXT,
    context TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(path);
CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_path);
CREATE INDEX IF NOT EXISTS idx_notes_technology ON notes(technology_path);
CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified);
CREATE INDEX IF NOT EXISTS idx_notes_confidence ON notes(confidence);
CREATE INDEX IF NOT EXISTS idx_notes_ai_binding ON notes(ai_binding);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);
CREATE INDEX IF NOT EXISTS idx_links_resolved ON links(resolved);
CREATE INDEX IF NOT EXISTS idx_authors_note ON authors(note_id);
CREATE INDEX IF NOT EXISTS idx_authors_agent ON authors(agent);
CREATE INDEX IF NOT EXISTS idx_tech_mentions_note ON technology_mentions(note_id);
CREATE INDEX IF NOT EXISTS idx_tech_mentions_tech ON technology_mentions(technology);
CREATE INDEX IF NOT EXISTS idx_domains_path ON domains(path);
CREATE INDEX IF NOT EXISTS idx_domains_level ON domains(level);
CREATE INDEX IF NOT EXISTS idx_domains_parent ON domains(parent_path);
CREATE INDEX IF NOT EXISTS idx_note_domains_domain ON note_domains(domain);
`;

// FTS5 virtual table for full-text search
export const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content,
    tags,
    domain,
    content='notes',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with notes table
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content, tags, domain)
    VALUES (new.id, new.title, new.content, new.tags, new.domain);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags, domain)
    VALUES ('delete', old.id, old.title, old.content, old.tags, old.domain);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags, domain)
    VALUES ('delete', old.id, old.title, old.content, old.tags, old.domain);
    INSERT INTO notes_fts(rowid, title, content, tags, domain)
    VALUES (new.id, new.title, new.content, new.tags, new.domain);
END;
`;

/**
 * Initialize database schema
 * Creates tables if they don't exist (fresh install)
 */
export function initializeSchema(db: Database.Database): void {
  // Check if notes table exists (indicates initialized database)
  const hasNotesTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'"
    )
    .get();

  if (!hasNotesTable) {
    logger.debug('Creating fresh database schema');
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(SCHEMA_SQL);
      db.exec(FTS_SQL);
      db.exec('COMMIT');
      logger.debug('Database schema created successfully');
    } catch (error) {
      db.exec('ROLLBACK');
      logger.error('Database schema creation failed', error);
      throw error;
    }
  } else {
    logger.debug('Database schema already exists');
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
