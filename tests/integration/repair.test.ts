/**
 * Integration tests for palace_repair tool (Phase 025)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { repairHandler } from '../../src/tools/repair.js';

// Mock dependencies
vi.mock('../../src/services/vault/registry', () => ({
  getVaultRegistry: vi.fn(),
}));

vi.mock('../../src/services/vault/index', () => ({
  readNote: vi.fn(),
  listNotes: vi.fn(),
}));

vi.mock('../../src/services/vault/writer', () => ({
  updateNote: vi.fn(),
}));

vi.mock('../../src/services/index/index', () => ({
  indexNote: vi.fn(),
  getIndexManager: vi.fn(),
}));

vi.mock('../../src/services/atomic/children-count', () => ({
  getAccurateChildrenCount: vi.fn(),
  updateChildrenCount: vi.fn(),
}));

// Import mocked modules
import * as registry from '../../src/services/vault/registry';
import { readNote, listNotes } from '../../src/services/vault/index';
import { updateNote } from '../../src/services/vault/writer';
import { indexNote, getIndexManager } from '../../src/services/index/index';
import { getAccurateChildrenCount } from '../../src/services/atomic/children-count';
import type { ResolvedVault, Note } from '../../src/types/index';

describe('palace_repair Integration Tests (Phase 025)', () => {
  const mockVaultConfig = {
    vault: { name: 'test' },
    structure: {},
    ignore: {
      patterns: ['.obsidian/'],
      marker_file: '.palace-ignore',
      frontmatter_key: 'palace_ignore',
    },
    atomic: { max_lines: 200, max_sections: 6, auto_split: false },
    stubs: { auto_create: false, min_confidence: 0.2 },
    graph: { require_technology_links: false, warn_orphan_depth: 1, retroactive_linking: false },
  };

  const mockVault: ResolvedVault = {
    path: '/test/vault',
    alias: 'test',
    mode: 'rw',
    isDefault: true,
    indexPath: '/test/vault/.palace/index.sqlite',
    config: mockVaultConfig,
  };

  const mockDb = {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  };

  const mockIndexManager = {
    getIndex: vi.fn(() => mockDb),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (registry.getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      listVaults: () => [mockVault],
      getDefaultVault: () => mockVault,
      getVault: (alias: string) => (alias === 'test' ? mockVault : undefined),
    });

    (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue(mockIndexManager);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Type Repair', () => {
    it('should detect and report invalid type in dry-run mode', async () => {
      const noteWithBadType: Note = {
        path: 'test/note.md',
        title: 'Test Note',
        content: '# Test Note\n\nContent here.',
        frontmatter: {
          type: 'research_hub_hub', // Invalid double suffix
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithBadType);

      const result = await repairHandler({
        repairs: ['types'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);
      expect(result.data?.total_issues).toBe(1);
      expect(result.data?.notes_repaired).toBe(0); // dry run
      expect(result.data?.results[0].issues[0].field).toBe('type');
      expect(result.data?.results[0].issues[0].suggestion).toBe('research_hub');
    });

    it('should fix invalid type when dry_run is false', async () => {
      const noteWithBadType: Note = {
        path: 'test/note.md',
        title: 'Test Note',
        content: '# Test Note',
        frontmatter: {
          type: 'research_hub_hub',
          created: '2025-01-01T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithBadType);
      (updateNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithBadType);

      const result = await repairHandler({
        repairs: ['types'],
        dry_run: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_repaired).toBe(1);
      expect(updateNote).toHaveBeenCalled();
      expect(indexNote).toHaveBeenCalled();
    });

    it('should normalize common type aliases', async () => {
      const noteWithAlias: Note = {
        path: 'test/note.md',
        title: 'Test Note',
        content: '# Test Note',
        frontmatter: {
          type: 'note', // Should normalize to 'research'
          created: '2025-01-01T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithAlias);

      const result = await repairHandler({
        repairs: ['types'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.results[0].issues[0].suggestion).toBe('research');
    });
  });

  describe('Children Count Repair', () => {
    it('should detect stale children_count in hub notes', async () => {
      const hubNote: Note = {
        path: 'topic/Hub.md',
        title: 'Hub',
        content: '# Hub\n\n## Knowledge Map\n\n- [[Child]]',
        frontmatter: {
          type: 'research_hub',
          children_count: 5, // Stale count
          created: '2025-01-01T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'topic/Hub.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(hubNote);
      (getAccurateChildrenCount as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: 'topic/Hub.md',
        storedCount: 5,
        actualCount: 1,
        isAccurate: false,
        existingChildren: ['topic/Child.md'],
        missingChildren: [],
        orphanedChildren: [],
      });

      const result = await repairHandler({
        repairs: ['children_count'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);
      expect(result.data?.results[0].issues[0].field).toBe('children_count');
      expect(result.data?.results[0].issues[0].value).toBe(5);
      expect(result.data?.results[0].issues[0].suggestion).toBe(1);
    });

    it('should skip non-hub notes for children_count repair', async () => {
      const regularNote: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research', // Not a hub
          created: '2025-01-01T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(regularNote);

      const result = await repairHandler({
        repairs: ['children_count'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(0);
      expect(getAccurateChildrenCount).not.toHaveBeenCalled();
    });
  });

  describe('Date Repair', () => {
    it('should detect invalid date formats', async () => {
      const noteWithBadDates: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          created: 'not-a-date',
          modified: 'also-invalid',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithBadDates);

      const result = await repairHandler({
        repairs: ['dates'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);

      const issues = result.data?.results[0].issues;
      expect(issues).toHaveLength(2);
      expect(issues.some((i: { field: string }) => i.field === 'created')).toBe(true);
      expect(issues.some((i: { field: string }) => i.field === 'modified')).toBe(true);
    });

    it('should leave valid dates unchanged', async () => {
      const noteWithValidDates: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-02T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithValidDates);

      const result = await repairHandler({
        repairs: ['dates'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(0);
    });
  });

  describe('Domain Repair', () => {
    it('should convert non-array domain to array', async () => {
      const noteWithStringDomain: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          domain: 'single-domain', // Should be array
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithStringDomain);

      const result = await repairHandler({
        repairs: ['domains'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);
      expect(result.data?.results[0].issues[0].field).toBe('domain');
      expect(result.data?.results[0].issues[0].suggestion).toEqual(['single-domain']);
    });

    it('should normalize domain casing to lowercase', async () => {
      const noteWithMixedCaseDomains: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          domain: ['Kubernetes', 'AWS', 'DevOps'],
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithMixedCaseDomains);

      const result = await repairHandler({
        repairs: ['domains'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);
      expect(result.data?.results[0].issues[0].suggestion).toEqual(['kubernetes', 'aws', 'devops']);
    });

    it('should leave lowercase domains unchanged', async () => {
      const noteWithLowercaseDomains: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          domain: ['kubernetes', 'aws'],
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithLowercaseDomains);

      const result = await repairHandler({
        repairs: ['domains'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(0);
    });
  });

  describe('Required Fields Repair', () => {
    it('should add missing created timestamp', async () => {
      const noteWithoutCreated: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          // Missing created
          modified: '2025-01-02T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithoutCreated);

      const result = await repairHandler({
        repairs: ['required_fields'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);
      expect(result.data?.results[0].issues.some((i: { field: string }) => i.field === 'created')).toBe(true);
    });

    it('should add missing modified timestamp', async () => {
      const noteWithoutModified: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          created: '2025-01-01T00:00:00Z',
          // Missing modified
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithoutModified);

      const result = await repairHandler({
        repairs: ['required_fields'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);
      expect(result.data?.results[0].issues.some((i: { field: string }) => i.field === 'modified')).toBe(true);
    });
  });

  describe('All Repairs', () => {
    it('should perform all repair types when "all" is specified', async () => {
      const noteWithMultipleIssues: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'note', // Invalid type alias
          domain: 'Tech', // Not array + not lowercase
          // Missing created and modified
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(noteWithMultipleIssues);

      const result = await repairHandler({
        repairs: ['all'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(1);

      const issues = result.data?.results[0].issues;
      // Should have issues for type, domain, and required fields
      expect(issues.some((i: { field: string }) => i.field === 'type')).toBe(true);
      expect(issues.some((i: { field: string }) => i.field === 'domain')).toBe(true);
      expect(issues.some((i: { field: string }) => i.field === 'created')).toBe(true);
    });

    it('should handle notes with no issues', async () => {
      const validNote: Note = {
        path: 'test/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'research',
          domain: ['tech'],
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-02T00:00:00Z',
        },
      };

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(validNote);

      const result = await repairHandler({
        repairs: ['all'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(0);
      expect(result.data?.notes_processed).toBe(1);
    });
  });

  describe('Path Filtering', () => {
    it('should repair only specified path', async () => {
      const targetNote: Note = {
        path: 'specific/note.md',
        title: 'Note',
        content: '# Note',
        frontmatter: {
          type: 'invalid_type',
        },
      };

      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(targetNote);

      const result = await repairHandler({
        path: 'specific/note.md',
        repairs: ['types'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_processed).toBe(1);
      expect(listNotes).not.toHaveBeenCalled(); // Should read single file, not list
    });

    it('should repair directory recursively', async () => {
      const note1: Note = {
        path: 'dir/note1.md',
        title: 'Note 1',
        content: '# Note 1',
        frontmatter: { type: 'research' },
      };

      const note2: Note = {
        path: 'dir/note2.md',
        title: 'Note 2',
        content: '# Note 2',
        frontmatter: { type: 'research' },
      };

      (readNote as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // First call for path check
        .mockResolvedValueOnce(note1)
        .mockResolvedValueOnce(note2);

      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'dir/note1.md' },
        { path: 'dir/note2.md' },
      ]);

      const result = await repairHandler({
        path: 'dir',
        repairs: ['types'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_processed).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle read errors gracefully', async () => {
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: 'test/note.md' }]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await repairHandler({
        repairs: ['all'],
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.notes_with_issues).toBe(0);
    });

    it('should enforce write access when dry_run is false', async () => {
      const roVault: ResolvedVault = {
        ...mockVault,
        mode: 'ro',
      };

      (registry.getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
        listVaults: () => [roVault],
        getDefaultVault: () => roVault,
        getVault: () => roVault,
      });

      const result = await repairHandler({
        repairs: ['all'],
        dry_run: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    });

    it('should validate input schema', async () => {
      const result = await repairHandler({
        repairs: ['invalid_repair_type'],
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });
});
