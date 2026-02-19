/**
 * Tests for migration executor service (Phase 029)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  access: vi.fn(),
}));

vi.mock('../../../src/utils/frontmatter.js', () => ({
  parseFrontmatter: vi.fn(),
  stringifyFrontmatter: vi.fn(),
}));

vi.mock('../../../src/utils/markdown.js', () => ({
  stripWikiLinks: vi.fn(),
}));

vi.mock('../../../src/services/index/sync.js', () => ({
  indexNote: vi.fn(),
  removeFromIndex: vi.fn(),
}));

vi.mock('../../../src/services/vault/reader.js', () => ({
  readNote: vi.fn(),
}));

vi.mock('../../../src/services/history/storage.js', () => ({
  saveVersion: vi.fn(),
}));

vi.mock('../../../src/services/operations/index.js', () => ({
  startOperation: vi.fn(() => ({ id: 'op_migrate_test' })),
  trackFileCreated: vi.fn(),
  trackFileModified: vi.fn(),
  trackFileDeleted: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { executeMigration } from '../../../src/services/migrate/executor.js';
import { readFile, writeFile, unlink, access } from 'fs/promises';
import { parseFrontmatter, stringifyFrontmatter } from '../../../src/utils/frontmatter.js';
import { stripWikiLinks } from '../../../src/utils/markdown.js';
import { indexNote, removeFromIndex } from '../../../src/services/index/sync.js';
import { readNote } from '../../../src/services/vault/reader.js';
import { saveVersion } from '../../../src/services/history/storage.js';
import {
  startOperation,
  trackFileCreated,
  trackFileModified,
  trackFileDeleted,
} from '../../../src/services/operations/index.js';
import type { InspectionIssue } from '../../../src/services/migrate/inspector.js';

const vaultPath = '/tmp/vault';
const vaultAlias = 'test';
const mockDb = {} as never;
const ignoreConfig = { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' };

describe('migration executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('---\ntitle: Test\n---\n\n# Test\nContent');
    (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (unlink as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (parseFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue({
      frontmatter: { title: 'Architecture', modified: '2025-01-01' },
      body: '# Architecture\nContent',
    });
    (stringifyFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue('---\ntitle: Updated\n---\n\n# Content');
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({ path: 'test.md', frontmatter: {} });
    (saveVersion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('returns operation_id and processes all issues', async () => {
    const issues: InspectionIssue[] = [];
    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.operation_id).toBe('op_migrate_test');
    expect(result.issues_processed).toBe(0);
    expect(result.issues_fixed).toBe(0);
    expect(startOperation).toHaveBeenCalledWith('migrate', 'test', { issues_count: 0 });
  });

  it('fixes unprefixed_children by renaming', async () => {
    const issues: InspectionIssue[] = [
      {
        path: 'research/Architecture.md',
        type: 'unprefixed_children',
        description: 'Child not prefixed',
        suggestion: 'Rename to Kubernetes - Architecture.md',
        details: {
          hub_path: 'research/Kubernetes.md',
          hub_title: 'Kubernetes',
          suggested_filename: 'Kubernetes - Architecture.md',
        },
      },
    ];

    // Mock readFile for hub update
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      '---\ntitle: Kubernetes\n---\n\n# Kubernetes\n\n## Knowledge Map\n\n- [[Architecture]]'
    );

    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.issues_fixed).toBe(1);
    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0].type).toBe('unprefixed_children');
    expect(result.fixes[0].new_path).toContain('Kubernetes - Architecture.md');
    expect(writeFile).toHaveBeenCalled();
    expect(unlink).toHaveBeenCalled();
    expect(removeFromIndex).toHaveBeenCalled();
    expect(trackFileDeleted).toHaveBeenCalled();
    expect(trackFileCreated).toHaveBeenCalled();
  });

  it('skips unprefixed_children when source file does not exist', async () => {
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

    const issues: InspectionIssue[] = [
      {
        path: 'research/Gone.md',
        type: 'unprefixed_children',
        description: 'Child not prefixed',
        suggestion: 'Rename',
        details: {
          hub_path: 'research/Hub.md',
          hub_title: 'Hub',
          suggested_filename: 'Hub - Gone.md',
        },
      },
    ];

    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.issues_skipped).toBe(1);
    expect(result.skipped[0].reason).toContain('no longer exists');
  });

  it('skips unprefixed_children when already correctly named', async () => {
    const issues: InspectionIssue[] = [
      {
        path: 'research/Hub - Child.md',
        type: 'unprefixed_children',
        description: 'Already correct',
        suggestion: 'Already correct',
        details: {
          hub_path: 'research/Hub.md',
          hub_title: 'Hub',
          suggested_filename: 'Hub - Child.md', // same as current
        },
      },
    ];

    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.issues_skipped).toBe(1);
    expect(result.skipped[0].reason).toContain('correct name');
  });

  it('fixes corrupted_headings by stripping wiki-links', async () => {
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      '---\ntitle: Test\n---\n\n# [[Wiki]] Heading\n\nContent'
    );
    (stripWikiLinks as ReturnType<typeof vi.fn>).mockReturnValue('# Wiki Heading');

    const issues: InspectionIssue[] = [
      {
        path: 'research/note.md',
        type: 'corrupted_headings',
        description: 'H1 contains wiki-links',
        suggestion: 'Strip wiki-links from heading',
      },
    ];

    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.issues_fixed).toBe(1);
    expect(result.fixes[0].action).toContain('Stripped wiki-links');
    expect(saveVersion).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    expect(trackFileModified).toHaveBeenCalled();
  });

  it('skips report-only issue types', async () => {
    const reportOnlyTypes = ['orphaned_fragments', 'naming_inconsistencies', 'broken_wiki_links', 'code_block_links'] as const;
    const issues: InspectionIssue[] = reportOnlyTypes.map(type => ({
      path: `research/${type}.md`,
      type,
      description: `${type} issue`,
      suggestion: 'Manual review needed',
    }));

    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.issues_skipped).toBe(4);
    expect(result.issues_fixed).toBe(0);
    expect(result.skipped).toHaveLength(4);
    for (const skipped of result.skipped) {
      expect(skipped.reason).toContain('manual review');
    }
  });

  it('captures errors per-issue without aborting', async () => {
    (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Read failed'));

    const issues: InspectionIssue[] = [
      {
        path: 'research/error.md',
        type: 'unprefixed_children',
        description: 'Will error',
        suggestion: 'Rename',
        details: {
          hub_path: 'research/Hub.md',
          hub_title: 'Hub',
          suggested_filename: 'Hub - Error.md',
        },
      },
    ];

    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Read failed');
    expect(result.issues_fixed).toBe(0);
  });

  it('sanitizes forward slashes in suggested filenames', async () => {
    const issues: InspectionIssue[] = [
      {
        path: 'research/Child.md',
        type: 'unprefixed_children',
        description: 'Child not prefixed',
        suggestion: 'Rename',
        details: {
          hub_path: 'research/Hub.md',
          hub_title: 'Hub',
          suggested_filename: 'Hub - A/B Test.md', // contains forward slash
        },
      },
    ];

    // Mock readFile for hub update
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('# Hub\n\n- [[Child]]');

    const result = await executeMigration(issues, vaultPath, vaultAlias, mockDb, ignoreConfig);
    expect(result.issues_fixed).toBe(1);
    // The forward slash should be replaced with a dash
    expect(result.fixes[0].new_path).toContain('Hub - A-B Test.md');
  });
});
