/**
 * Intent-based storage service tests
 * Tests for layer-detector, resolver, stub-manager
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
import { KnowledgeLayer } from '../../../src/types/intent';
import type { ResolvedVault, VaultConfig } from '../../../src/types/index';

// Mock vault for testing
const createMockVault = (): ResolvedVault => ({
  alias: 'test',
  path: testVault,
  mode: 'rw',
  isDefault: true,
  config: {
    vault: { name: 'test-vault' },
    structure: {
      technology: { path: 'technologies/{domain}/' },
      command: { path: 'commands/{domain}/' },
      standard: { path: 'standards/{domain}/' },
      project: { path: 'projects/{project}/' },
      pattern: { path: 'patterns/{domain}/' },
      research: { path: 'research/{domain}/' },
      infrastructure: { path: 'infrastructure/{domain}/' },
      troubleshooting: { path: 'troubleshooting/{domain}/' },
      client: { path: 'clients/{client}/' },
    },
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
    atomic: { max_lines: 200, max_sections: 6, hub_filename: '_index.md', auto_split: true },
    stubs: { auto_create: true, min_confidence: 0.2 },
    graph: { require_technology_links: true, warn_orphan_depth: 1, retroactive_linking: true },
  } as VaultConfig,
});

describe('Layer Detector', () => {
  it('classifies technology knowledge as technical layer', async () => {
    const { determineLayer } = await import('../../../src/services/vault/layer-detector');

    const intent: StorageIntent = {
      knowledge_type: 'technology',
      domain: ['kubernetes'],
      scope: 'general',
    };

    const layer = determineLayer(intent);
    expect(layer).toBe(KnowledgeLayer.TECHNICAL);
  });

  it('classifies command knowledge as technical layer', async () => {
    const { determineLayer } = await import('../../../src/services/vault/layer-detector');

    const intent: StorageIntent = {
      knowledge_type: 'command',
      domain: ['docker'],
      scope: 'general',
    };

    const layer = determineLayer(intent);
    expect(layer).toBe(KnowledgeLayer.TECHNICAL);
  });

  it('classifies pattern knowledge as domain layer', async () => {
    const { determineLayer } = await import('../../../src/services/vault/layer-detector');

    const intent: StorageIntent = {
      knowledge_type: 'pattern',
      domain: ['architecture'],
      scope: 'general',
    };

    const layer = determineLayer(intent);
    expect(layer).toBe(KnowledgeLayer.DOMAIN);
  });

  it('classifies decision knowledge as contextual layer', async () => {
    const { determineLayer } = await import('../../../src/services/vault/layer-detector');

    const intent: StorageIntent = {
      knowledge_type: 'decision',
      domain: ['project-x'],
      scope: 'project-specific',
      project: 'project-x',
    };

    const layer = determineLayer(intent);
    expect(layer).toBe(KnowledgeLayer.CONTEXTUAL);
  });

  it('classifies project-specific knowledge as contextual layer', async () => {
    const { determineLayer } = await import('../../../src/services/vault/layer-detector');

    const intent: StorageIntent = {
      knowledge_type: 'research',
      domain: ['api'],
      scope: 'project-specific',
      project: 'my-app',
    };

    const layer = determineLayer(intent);
    expect(layer).toBe(KnowledgeLayer.CONTEXTUAL);
  });

  it('classifies client-specific knowledge as contextual layer', async () => {
    const { determineLayer } = await import('../../../src/services/vault/layer-detector');

    const intent: StorageIntent = {
      knowledge_type: 'configuration',
      domain: ['infrastructure'],
      scope: 'general',
      client: 'acme-corp',
    };

    const layer = determineLayer(intent);
    expect(layer).toBe(KnowledgeLayer.CONTEXTUAL);
  });

  it('provides layer base folders', async () => {
    const { getLayerBaseFolders } = await import('../../../src/services/vault/layer-detector');

    expect(getLayerBaseFolders(KnowledgeLayer.TECHNICAL)).toContain('technologies');
    expect(getLayerBaseFolders(KnowledgeLayer.DOMAIN)).toContain('patterns');
    expect(getLayerBaseFolders(KnowledgeLayer.CONTEXTUAL)).toContain('projects');
  });

  it('provides knowledge type folders', async () => {
    const { getKnowledgeTypeFolder } = await import('../../../src/services/vault/layer-detector');

    expect(getKnowledgeTypeFolder('technology')).toBe('technologies');
    expect(getKnowledgeTypeFolder('command')).toBe('commands');
    expect(getKnowledgeTypeFolder('pattern')).toBe('patterns');
  });

  it('detects reusable knowledge', async () => {
    const { isReusableKnowledge } = await import('../../../src/services/vault/layer-detector');

    const intent: StorageIntent = {
      knowledge_type: 'troubleshooting',
      domain: ['docker'],
      scope: 'general',
    };

    const genericContent = 'This is a best practice for Docker. Typically you should use multi-stage builds.';
    const specificContent = 'For this project, we decided to use Docker. In our case, this works better.';

    expect(isReusableKnowledge(genericContent, intent)).toBe(true);
    expect(isReusableKnowledge(specificContent, intent)).toBe(false);
  });
});

describe('Storage Resolver', () => {
  it('resolves technology path with domain substitution', async () => {
    const { resolveStorage } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      knowledge_type: 'technology',
      domain: ['kubernetes'],
      scope: 'general',
    };

    const resolution = resolveStorage(intent, 'Kubernetes Networking', vault);

    expect(resolution.relativePath).toContain('kubernetes');
    expect(resolution.relativePath).toMatch(/\.md$/);
    expect(resolution.layer).toBe(KnowledgeLayer.TECHNICAL);
  });

  it('resolves command path', async () => {
    const { resolveStorage } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      knowledge_type: 'command',
      domain: ['docker'],
      scope: 'general',
    };

    const resolution = resolveStorage(intent, 'docker build', vault);

    expect(resolution.relativePath).toContain('docker');
    expect(resolution.relativePath).toContain('docker-build');
  });

  it('resolves project-specific path', async () => {
    const { resolveStorage } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      knowledge_type: 'decision',
      domain: ['architecture'],
      scope: 'project-specific',
      project: 'my-app',
    };

    const resolution = resolveStorage(intent, 'Database Choice', vault);

    expect(resolution.relativePath).toContain('my-app');
    expect(resolution.layer).toBe(KnowledgeLayer.CONTEXTUAL);
  });

  it('generates alternative paths', async () => {
    const { resolveStorage, generateAlternativePath } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      knowledge_type: 'research',
      domain: ['kubernetes'],
      scope: 'general',
    };

    const original = resolveStorage(intent, 'Pods', vault);
    const alternative = generateAlternativePath(original, 2);

    expect(alternative.relativePath).toContain('pods-2');
    expect(alternative.relativePath).not.toBe(original.relativePath);
  });

  it('checks path conflicts', async () => {
    const { resolveStorage, checkPathConflict } = await import('../../../src/services/vault/resolver');
    const vault = createMockVault();

    const intent: StorageIntent = {
      knowledge_type: 'research',
      domain: ['test'],
      scope: 'general',
    };

    const resolution = resolveStorage(intent, 'Test Note', vault);
    const existingPaths = [resolution.relativePath, 'other/note.md'];

    // checkPathConflict returns the conflicting path or undefined
    expect(checkPathConflict(resolution, existingPaths)).toBe(resolution.relativePath);
    expect(checkPathConflict(resolution, ['other/note.md'])).toBeUndefined();
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

  it('creates a stub note', async () => {
    const { createStub } = await import('../../../src/services/vault/stub-manager');
    const vault = createMockVault();

    const stubPath = await createStub(
      'Docker',
      'Referenced in Kubernetes article',
      'research/kubernetes.md',
      vault,
      ['containers']
    );

    expect(stubPath).toBeDefined();
    expect(stubPath).toMatch(/\.md$/);

    // Verify file was created
    const fullPath = join(testVault, stubPath);
    expect(existsSync(fullPath)).toBe(true);

    // Verify content
    const content = await readFile(fullPath, 'utf-8');
    expect(content).toContain('status: stub');
    expect(content).toContain('Docker');
    expect(content).toContain('kubernetes');
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
      'research/caching.md',
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
      'tech/stub-note.md',
      'Stub Note',
      'technology',
      new Date().toISOString(),
      new Date().toISOString(),
      'stub',
      'Stub content',
      'hash123'
    );

    const stubs = findStubs(db);
    expect(stubs.length).toBe(1);
    expect(stubs[0]!.title).toBe('Stub Note');
  });

  it('finds stub by title', async () => {
    const { findStubByTitle } = await import('../../../src/services/vault/stub-manager');

    // Insert a stub note
    db.prepare(`
      INSERT INTO notes (path, title, type, created, modified, status, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'tech/graphql.md',
      'GraphQL',
      'technology',
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
