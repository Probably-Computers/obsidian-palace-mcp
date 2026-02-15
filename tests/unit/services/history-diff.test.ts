/**
 * Tests for diff generation service (Phase 028)
 */

import { describe, it, expect } from 'vitest';
import {
  generateDiff,
  formatUnifiedDiff,
  generateFrontmatterDiff,
  formatFrontmatterDiff,
  generateChangeSummary,
} from '../../../src/services/history/diff.js';

describe('Diff Service', () => {
  describe('generateDiff', () => {
    it('should detect no changes for identical content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const result = generateDiff(content, content);

      expect(result.hasChanges).toBe(false);
      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(0);
    });

    it('should detect additions', () => {
      const oldContent = 'Line 1\nLine 2';
      const newContent = 'Line 1\nLine 2\nLine 3';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.additions).toBe(1);
      expect(result.deletions).toBe(0);
    });

    it('should detect deletions', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1\nLine 2';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(1);
    });

    it('should detect modifications', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1\nLine 2 modified\nLine 3';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.additions).toBe(1);
      expect(result.deletions).toBe(1);
    });

    it('should handle empty old content', () => {
      const oldContent = '';
      const newContent = 'Line 1\nLine 2';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      // Empty string splits to [''] which is one "line"
      expect(result.additions).toBe(2);
      expect(result.deletions).toBe(1); // The empty line
    });

    it('should handle empty new content', () => {
      const oldContent = 'Line 1\nLine 2';
      const newContent = '';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.additions).toBe(1); // The empty line
      expect(result.deletions).toBe(2);
    });
  });

  describe('formatUnifiedDiff', () => {
    it('should format diff with header', () => {
      const oldContent = 'Line 1\nLine 2';
      const newContent = 'Line 1\nLine 2\nLine 3';
      const diff = generateDiff(oldContent, newContent);
      const formatted = formatUnifiedDiff(diff, 'v1', 'v2');

      expect(formatted).toContain('--- v1');
      expect(formatted).toContain('+++ v2');
    });

    it('should show additions with + prefix', () => {
      const oldContent = 'Line 1';
      const newContent = 'Line 1\nLine 2';
      const diff = generateDiff(oldContent, newContent);
      const formatted = formatUnifiedDiff(diff);

      expect(formatted).toContain('+Line 2');
    });

    it('should show deletions with - prefix', () => {
      const oldContent = 'Line 1\nLine 2';
      const newContent = 'Line 1';
      const diff = generateDiff(oldContent, newContent);
      const formatted = formatUnifiedDiff(diff);

      expect(formatted).toContain('-Line 2');
    });

    it('should return no changes message for identical content', () => {
      const content = 'Line 1\nLine 2';
      const diff = generateDiff(content, content);
      const formatted = formatUnifiedDiff(diff);

      expect(formatted).toBe('(no changes)');
    });
  });

  describe('generateFrontmatterDiff', () => {
    it('should detect added fields', () => {
      const oldContent = '---\ntitle: Test\n---\nContent';
      const newContent = '---\ntitle: Test\ntags: [new]\n---\nContent';
      const diff = generateFrontmatterDiff(oldContent, newContent);

      const addedTags = diff.find(d => d.field === 'tags' && d.type === 'added');
      expect(addedTags).toBeDefined();
    });

    it('should detect removed fields', () => {
      const oldContent = '---\ntitle: Test\ntags: [old]\n---\nContent';
      const newContent = '---\ntitle: Test\n---\nContent';
      const diff = generateFrontmatterDiff(oldContent, newContent);

      const removedTags = diff.find(d => d.field === 'tags' && d.type === 'removed');
      expect(removedTags).toBeDefined();
    });

    it('should detect modified fields', () => {
      const oldContent = '---\ntitle: Old Title\n---\nContent';
      const newContent = '---\ntitle: New Title\n---\nContent';
      const diff = generateFrontmatterDiff(oldContent, newContent);

      const changedTitle = diff.find(d => d.field === 'title' && d.type === 'changed');
      expect(changedTitle).toBeDefined();
      expect(changedTitle?.oldValue).toBe('Old Title');
      expect(changedTitle?.newValue).toBe('New Title');
    });

    it('should handle content without frontmatter', () => {
      const oldContent = 'Just content';
      const newContent = '---\ntitle: New\n---\nContent';
      const diff = generateFrontmatterDiff(oldContent, newContent);

      const addedTitle = diff.find(d => d.field === 'title' && d.type === 'added');
      expect(addedTitle).toBeDefined();
    });
  });

  describe('formatFrontmatterDiff', () => {
    it('should format added fields', () => {
      const diff = [
        { field: 'tags', oldValue: undefined, newValue: ['test'], type: 'added' as const },
        { field: 'confidence', oldValue: undefined, newValue: 0.9, type: 'added' as const },
      ];
      const formatted = formatFrontmatterDiff(diff);

      expect(formatted).toContain('+ tags');
      expect(formatted).toContain('+ confidence');
    });

    it('should format removed fields', () => {
      const diff = [
        { field: 'oldField', oldValue: 'value', newValue: undefined, type: 'removed' as const },
      ];
      const formatted = formatFrontmatterDiff(diff);

      expect(formatted).toContain('- oldField');
    });

    it('should format modified fields', () => {
      const diff = [{ field: 'title', oldValue: 'Old', newValue: 'New', type: 'changed' as const }];
      const formatted = formatFrontmatterDiff(diff);

      expect(formatted).toContain('~ title:');
      expect(formatted).toContain('"Old"');
      expect(formatted).toContain('"New"');
    });

    it('should return no changes message for empty diff', () => {
      const diff: { field: string; oldValue: unknown; newValue: unknown; type: 'added' | 'removed' | 'changed' }[] = [];
      const formatted = formatFrontmatterDiff(diff);

      expect(formatted).toBe('(no frontmatter changes)');
    });
  });

  describe('generateChangeSummary', () => {
    it('should report no changes for identical content', () => {
      const content = 'Same content';
      const summary = generateChangeSummary(content, content);

      expect(summary).toBe('no changes detected');
    });

    it('should report additions only', () => {
      const oldContent = 'Line 1';
      const newContent = 'Line 1\nLine 2\nLine 3';
      const summary = generateChangeSummary(oldContent, newContent);

      expect(summary).toContain('2 additions');
    });

    it('should report deletions only', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1';
      const summary = generateChangeSummary(oldContent, newContent);

      expect(summary).toContain('2 deletions');
    });

    it('should report both additions and deletions', () => {
      const oldContent = 'Line 1\nLine 2';
      const newContent = 'Line 1\nLine 3\nLine 4';
      const summary = generateChangeSummary(oldContent, newContent);

      expect(summary).toContain('additions');
      expect(summary).toContain('deletions');
    });

    it('should report single addition', () => {
      const oldContent = 'Line 1';
      const newContent = 'Line 1\nLine 2';
      const summary = generateChangeSummary(oldContent, newContent);

      expect(summary).toContain('1 additions');
    });
  });
});
