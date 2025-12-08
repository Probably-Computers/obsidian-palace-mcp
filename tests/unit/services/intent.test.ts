/**
 * Intent-based storage service tests (Phase 017)
 * Tests for resolver and stub-manager with topic-based architecture
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-intent-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports
process.env.PALACE_VAULT_PATH = testVault;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

// Dynamic imports after env setup
import { resetConfig } from '../../../src/config/index';
import type { StorageIntent } from '../../../src/types/intent';
import type { ResolvedVault, VaultConfig } from '../../../src/types/index';

// Mock vault for testing (Phase 017 simplified structure)
const createMockVault = (): ResolvedVault => ({
  alias: 'test',
  path: testVault,
  mode: 'rw',
  isDefault: true,
  config: {
    vault: { name: 'test-vault' },
    structure: {
      sources: 'sources/',
      projects: 'projects/',
      clients: 'clients/',
      daily: 'daily/',
      standards: 'standards/',
    },
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
    atomic: { max_lines: 200, max_sections: 6, auto_split: true },
    stubs: { auto_create: true, min_confidence: 0.2 },
    graph: { require_technology_links: false, warn_orphan_depth: 1, retroactive_linking: true },
  } as VaultConfig,
  indexPath: join(testPalace, 'index.sqlite'),
});

describe('Storage Resolver (Phase 017)', () => {
  it('resolves knowledge path from domain array', async () => {
    const { resolveStorage } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      capture_type: 'knowledge',
      domain: ['kubernetes', 'networking'],
    };

    const resolution = resolveStorage(intent, 'Pod Networking', vault);

    expect(resolution.relativePath).toContain('kubernetes');
    expect(resolution.relativePath).toContain('networking');
    expect(resolution.relativePath).toMatch(/\.md$/);
    expect(resolution.isNewTopLevelDomain).toBe(true); // No kubernetes folder exists yet
  });

  it('resolves source capture path', async () => {
    const { resolveStorage } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      capture_type: 'source',
      domain: ['book-notes'],
      source: {
        type: 'book',
        title: 'Kubernetes in Action',
        author: 'Marko Luksa',
      },
    };

    const resolution = resolveStorage(intent, 'Chapter 3 Notes', vault);

    expect(resolution.relativePath).toContain('sources');
    expect(resolution.relativePath).toContain('book');
    // Phase 018: Title-style filenames preserve case and spaces
    expect(resolution.relativePath).toMatch(/Chapter 3 Notes\.md$/);
  });

  it('resolves project capture path', async () => {
    const { resolveStorage } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      capture_type: 'project',
      domain: ['architecture'],
      project: 'my-app',
    };

    const resolution = resolveStorage(intent, 'Database Choice', vault);

    expect(resolution.relativePath).toContain('projects');
    expect(resolution.relativePath).toContain('my-app');
  });

  it('resolves client-specific project path', async () => {
    const { resolveStorage } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      capture_type: 'project',
      domain: ['infrastructure'],
      client: 'acme-corp',
    };

    const resolution = resolveStorage(intent, 'Server Config', vault);

    expect(resolution.relativePath).toContain('clients');
    expect(resolution.relativePath).toContain('acme-corp');
  });

  it('generates alternative paths', async () => {
    const { resolveStorage, generateAlternativePath } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      capture_type: 'knowledge',
      domain: ['kubernetes'],
    };

    const original = resolveStorage(intent, 'Pods', vault);
    const alternative = generateAlternativePath(original, 2);

    // Phase 018: Title-style filenames - suffix appended to base
    expect(alternative.relativePath).toContain('Pods-2');
    expect(alternative.relativePath).not.toBe(original.relativePath);
  });

  it('checks path conflicts', async () => {
    const { resolveStorage, checkPathConflict } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      capture_type: 'knowledge',
      domain: ['test'],
    };

    const resolution = resolveStorage(intent, 'Test Note', vault);
    const existingPaths = [resolution.relativePath, 'other/note.md'];

    expect(checkPathConflict(resolution, existingPaths)).toBe(resolution.relativePath);
    expect(checkPathConflict(resolution, ['other/note.md'])).toBeUndefined();
  });

  it('extracts domain from existing paths', async () => {
    const { extractDomainFromPath } = await import('../../../src/services/vault/resolver');

    expect(extractDomainFromPath('kubernetes/networking/pods.md')).toEqual(['kubernetes', 'networking']);
    expect(extractDomainFromPath('docker/images.md')).toEqual(['docker']);
    // Special folders return content after the base folder
    expect(extractDomainFromPath('sources/book/notes.md')).toEqual(['book']);
  });

  it('identifies special folders', async () => {
    const { isSpecialFolder } = await import('../../../src/services/vault/resolver');

    expect(isSpecialFolder('sources/book/notes.md')).toBe(true);
    expect(isSpecialFolder('projects/my-app/readme.md')).toBe(true);
    expect(isSpecialFolder('clients/acme/config.md')).toBe(true);
    expect(isSpecialFolder('kubernetes/pods.md')).toBe(false);
  });

  it('detects capture type from existing paths', async () => {
    const { getCaptureTypeFromPath } = await import('../../../src/services/vault/resolver');

    expect(getCaptureTypeFromPath('sources/book/notes.md')).toBe('source');
    expect(getCaptureTypeFromPath('projects/my-app/readme.md')).toBe('project');
    expect(getCaptureTypeFromPath('clients/acme/config.md')).toBe('project');
    expect(getCaptureTypeFromPath('kubernetes/pods.md')).toBe('knowledge');
  });
});

describe('Stub Manager', () => {
  let db: Database.Database;

  beforeAll(async () => {
    // Create test vault directory
    await mkdir(testVault, { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();

    // Create database for testing
    const { createDatabase, initializeSchema } = await import('../../../src/services/index/sqlite');
    db = createDatabase(join(testPalace, 'index.sqlite'));
    initializeSchema(db);
  });

  afterAll(async () => {
    if (db && db.open) {
      db.close();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear tables between tests
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM note_tags');
    db.exec('DELETE FROM notes');
    db.exec('DELETE FROM notes_fts');
  });

  it('creates a stub note with Phase 017 schema', async () => {
    const { createStub } = await import('../../../src/services/vault/stub-manager');
    const vault = createMockVault();

    const stubPath = await createStub(
      'Docker',
      'Referenced in Kubernetes article',
      'kubernetes/pods.md',
      vault,
      ['containers']
    );

    expect(stubPath).toBeDefined();
    expect(stubPath).toMatch(/\.md$/);

    // Verify file was created
    const fullPath = join(testVault, stubPath);
    expect(existsSync(fullPath)).toBe(true);

    // Verify content has new Phase 017 schema
    const content = await readFile(fullPath, 'utf-8');
    expect(content).toContain('status: stub');
    expect(content).toContain('capture_type: knowledge');
    expect(content).toContain('Docker');
  });

  it('identifies stub notes', async () => {
    const { isStub } = await import('../../../src/services/vault/stub-manager');

    expect(isStub({ status: 'stub' })).toBe(true);
    expect(isStub({ status: 'active' })).toBe(false);
    expect(isStub({})).toBe(false);
  });

  it('expands a stub with real content', async () => {
    const { createStub, expandStub } = await import('../../../src/services/vault/stub-manager');
    const { parseFrontmatter } = await import('../../../src/utils/frontmatter');
    const vault = createMockVault();

    // Create stub
    const stubPath = await createStub(
      'Redis',
      'Mentioned in caching article',
      'caching/overview.md',
      vault,
      ['database']
    );

    // Expand stub
    const newContent = '# Redis\n\nRedis is an in-memory data structure store.';
    await expandStub(stubPath, newContent, vault, {
      origin: 'ai:research',
      confidence: 0.8,
    });

    // Verify expansion
    const fullPath = join(testVault, stubPath);
    const content = await readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    expect((frontmatter as Record<string, unknown>).status).toBe('active');
    expect((frontmatter as Record<string, unknown>).confidence).toBe(0.8);
    expect((frontmatter as Record<string, unknown>).expanded_from_stub).toBe(true);
    expect(body).toContain('in-memory data structure store');
  });

  it('finds stubs in database', async () => {
    const { findStubs } = await import('../../../src/services/vault/stub-manager');

    // Insert a stub note
    db.prepare(`
      INSERT INTO notes (path, title, type, created, modified, status, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'containers/docker.md',
      'Docker',
      'knowledge',
      new Date().toISOString(),
      new Date().toISOString(),
      'stub',
      'Stub content',
      'hash123'
    );

    const stubs = findStubs(db);
    expect(stubs.length).toBe(1);
    expect(stubs[0]!.title).toBe('Docker');
  });

  it('finds stub by title', async () => {
    const { findStubByTitle } = await import('../../../src/services/vault/stub-manager');

    // Insert a stub note
    db.prepare(`
      INSERT INTO notes (path, title, type, created, modified, status, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'api/graphql.md',
      'GraphQL',
      'knowledge',
      new Date().toISOString(),
      new Date().toISOString(),
      'stub',
      'GraphQL stub',
      'hash456'
    );

    const stub = findStubByTitle(db, 'GraphQL');
    expect(stub).not.toBeNull();
    expect(stub!.title).toBe('GraphQL');

    // Should return null for non-existent
    const noStub = findStubByTitle(db, 'NonExistent');
    expect(noStub).toBeNull();
  });
});
