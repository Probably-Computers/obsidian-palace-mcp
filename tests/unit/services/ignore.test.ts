/**
 * Ignore mechanism tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  matchesIgnorePatterns,
  hasIgnoreMarker,
  hasIgnoreMarkerInPath,
  hasIgnoreFrontmatter,
  shouldIgnore,
  createIgnoreFilter,
  mergeIgnorePatterns,
  DEFAULT_IGNORE_PATTERNS,
} from '../../../src/services/vault/ignore';
import type { VaultIgnoreConfig } from '../../../src/types';

describe('Ignore Mechanism', () => {
  const testDir = join(tmpdir(), `palace-ignore-test-${Date.now()}`);

  const defaultIgnoreConfig: VaultIgnoreConfig = {
    patterns: ['.obsidian/', 'templates/', 'private/**'],
    marker_file: '.palace-ignore',
    frontmatter_key: 'palace_ignore',
  };

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('matchesIgnorePatterns', () => {
    it('matches exact directory patterns', () => {
      expect(matchesIgnorePatterns('.obsidian/config.json', ['.obsidian/'])).toBe(true);
      expect(matchesIgnorePatterns('templates/note.md', ['templates/'])).toBe(true);
    });

    it('matches glob patterns with **', () => {
      expect(matchesIgnorePatterns('private/secret/file.md', ['private/**'])).toBe(true);
      expect(matchesIgnorePatterns('private/file.md', ['private/**'])).toBe(true);
    });

    it('matches glob patterns with *', () => {
      expect(matchesIgnorePatterns('test.tmp', ['*.tmp'])).toBe(true);
      expect(matchesIgnorePatterns('dir/test.tmp', ['*.tmp'])).toBe(true);
    });

    it('does not match non-matching paths', () => {
      expect(matchesIgnorePatterns('notes/test.md', ['.obsidian/', 'templates/'])).toBe(false);
      expect(matchesIgnorePatterns('public/file.md', ['private/**'])).toBe(false);
    });

    it('matches subdirectories', () => {
      expect(matchesIgnorePatterns('.obsidian/plugins/test.js', ['.obsidian/'])).toBe(true);
    });
  });

  describe('hasIgnoreMarker', () => {
    it('returns true when marker file exists', () => {
      const markerDir = join(testDir, 'ignored');
      mkdirSync(markerDir, { recursive: true });
      writeFileSync(join(markerDir, '.palace-ignore'), '');

      expect(hasIgnoreMarker(markerDir, '.palace-ignore')).toBe(true);
    });

    it('returns false when marker file does not exist', () => {
      expect(hasIgnoreMarker(testDir, '.palace-ignore')).toBe(false);
    });
  });

  describe('hasIgnoreMarkerInPath', () => {
    it('finds marker in parent directory', () => {
      const parentDir = join(testDir, 'parent');
      const childDir = join(parentDir, 'child');
      mkdirSync(childDir, { recursive: true });
      writeFileSync(join(parentDir, '.palace-ignore'), '');

      const filePath = join(childDir, 'note.md');
      expect(hasIgnoreMarkerInPath(filePath, testDir, '.palace-ignore')).toBe(true);
    });

    it('finds marker in grandparent directory', () => {
      const parentDir = join(testDir, 'parent');
      const childDir = join(parentDir, 'child', 'grandchild');
      mkdirSync(childDir, { recursive: true });
      writeFileSync(join(parentDir, '.palace-ignore'), '');

      const filePath = join(childDir, 'note.md');
      expect(hasIgnoreMarkerInPath(filePath, testDir, '.palace-ignore')).toBe(true);
    });

    it('returns false when no marker in path', () => {
      const childDir = join(testDir, 'child');
      mkdirSync(childDir, { recursive: true });

      const filePath = join(childDir, 'note.md');
      expect(hasIgnoreMarkerInPath(filePath, testDir, '.palace-ignore')).toBe(false);
    });

    it('does not search above vault path', () => {
      // Marker is above vault path - should not be found
      const filePath = join(testDir, 'note.md');
      writeFileSync(join(tmpdir(), '.palace-ignore'), '');

      expect(hasIgnoreMarkerInPath(filePath, testDir, '.palace-ignore')).toBe(false);

      // Cleanup
      try {
        rmSync(join(tmpdir(), '.palace-ignore'));
      } catch {
        // Ignore
      }
    });
  });

  describe('hasIgnoreFrontmatter', () => {
    it('returns true when palace_ignore is true', () => {
      expect(hasIgnoreFrontmatter({ palace_ignore: true }, 'palace_ignore')).toBe(true);
    });

    it('returns true when palace_ignore is "true" string', () => {
      expect(hasIgnoreFrontmatter({ palace_ignore: 'true' }, 'palace_ignore')).toBe(true);
    });

    it('returns false when palace_ignore is false', () => {
      expect(hasIgnoreFrontmatter({ palace_ignore: false }, 'palace_ignore')).toBe(false);
    });

    it('returns false when frontmatter is undefined', () => {
      expect(hasIgnoreFrontmatter(undefined, 'palace_ignore')).toBe(false);
    });

    it('returns false when key is missing', () => {
      expect(hasIgnoreFrontmatter({ type: 'research' }, 'palace_ignore')).toBe(false);
    });
  });

  describe('shouldIgnore', () => {
    it('ignores by pattern match', () => {
      const filePath = join(testDir, '.obsidian', 'config.json');
      const result = shouldIgnore(filePath, testDir, defaultIgnoreConfig);

      expect(result.ignored).toBe(true);
      expect(result.reason).toBe('pattern');
    });

    it('ignores by marker file', () => {
      const ignoredDir = join(testDir, 'ignored');
      mkdirSync(ignoredDir, { recursive: true });
      writeFileSync(join(ignoredDir, '.palace-ignore'), '');

      const filePath = join(ignoredDir, 'note.md');
      const result = shouldIgnore(filePath, testDir, defaultIgnoreConfig);

      expect(result.ignored).toBe(true);
      expect(result.reason).toBe('marker');
    });

    it('ignores by frontmatter', () => {
      const filePath = join(testDir, 'note.md');
      const frontmatter = { palace_ignore: true };
      const result = shouldIgnore(filePath, testDir, defaultIgnoreConfig, frontmatter);

      expect(result.ignored).toBe(true);
      expect(result.reason).toBe('frontmatter');
    });

    it('returns not ignored for regular files', () => {
      const filePath = join(testDir, 'notes', 'regular.md');
      mkdirSync(join(testDir, 'notes'), { recursive: true });

      const result = shouldIgnore(filePath, testDir, defaultIgnoreConfig);

      expect(result.ignored).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('createIgnoreFilter', () => {
    it('creates filter function that returns true for non-ignored', () => {
      const filter = createIgnoreFilter(testDir, defaultIgnoreConfig);

      expect(filter('notes/test.md')).toBe(true);
      expect(filter('research/topic.md')).toBe(true);
    });

    it('creates filter function that returns false for ignored', () => {
      const filter = createIgnoreFilter(testDir, defaultIgnoreConfig);

      expect(filter('.obsidian/config.json')).toBe(false);
      expect(filter('templates/template.md')).toBe(false);
    });

    it('respects frontmatter in filter', () => {
      const filter = createIgnoreFilter(testDir, defaultIgnoreConfig);
      const frontmatter = { palace_ignore: true } as any;

      expect(filter('notes/test.md', frontmatter)).toBe(false);
    });
  });

  describe('mergeIgnorePatterns', () => {
    it('merges custom patterns with defaults', () => {
      const custom = ['custom/', '*.bak'];
      const merged = mergeIgnorePatterns(custom);

      expect(merged).toContain('.obsidian/');
      expect(merged).toContain('.palace/');
      expect(merged).toContain('custom/');
      expect(merged).toContain('*.bak');
    });

    it('does not duplicate patterns', () => {
      const custom = ['.obsidian/', 'custom/'];
      const merged = mergeIgnorePatterns(custom);

      const obsidianCount = merged.filter((p) => p === '.obsidian/').length;
      expect(obsidianCount).toBe(1);
    });

    it('can skip defaults', () => {
      const custom = ['custom/'];
      const merged = mergeIgnorePatterns(custom, false);

      expect(merged).toEqual(['custom/']);
      expect(merged).not.toContain('.obsidian/');
    });
  });

  describe('DEFAULT_IGNORE_PATTERNS', () => {
    it('includes essential patterns', () => {
      expect(DEFAULT_IGNORE_PATTERNS).toContain('.obsidian/');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('.palace/');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('.git/');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules/');
    });
  });
});
