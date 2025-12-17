/**
 * Autolink service tests
 *
 * Phase 024: Extended tests for autolink improvements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  findSkipZones,
  isInSkipZone,
  insertLinks,
  autolinkContent,
} from '../../../src/services/autolink/linker';
import {
  scanForMatches,
  filterByLinkMode,
  filterByStopWords,
  filterByDomainScope,
  filterByLinkDensity,
  analyzeLinkDensity,
  DEFAULT_MIN_TITLE_LENGTH,
  DEFAULT_STOP_WORDS,
  type LinkableTitle,
  type AutolinkMatch,
} from '../../../src/services/autolink/scanner';

describe('autolink/linker', () => {
  describe('findSkipZones', () => {
    it('detects frontmatter', () => {
      const content = `---
type: research
created: 2025-01-01
---

# Title

Content here`;

      const zones = findSkipZones(content);
      const fmZone = zones.find((z) => z.type === 'frontmatter');

      expect(fmZone).toBeDefined();
      expect(fmZone!.start).toBe(0);
      expect(content.slice(fmZone!.start, fmZone!.end)).toContain('type: research');
    });

    it('detects fenced code blocks', () => {
      const content = `Some text

\`\`\`typescript
const docker = 'hello';
\`\`\`

More text`;

      const zones = findSkipZones(content);
      const codeZone = zones.find((z) => z.type === 'code_block');

      expect(codeZone).toBeDefined();
      expect(content.slice(codeZone!.start, codeZone!.end)).toContain('const docker');
    });

    it('detects inline code', () => {
      const content = 'Use the `docker build` command to build images.';

      const zones = findSkipZones(content);
      const inlineZone = zones.find((z) => z.type === 'inline_code');

      expect(inlineZone).toBeDefined();
      expect(content.slice(inlineZone!.start, inlineZone!.end)).toBe('`docker build`');
    });

    it('detects existing wiki-links', () => {
      const content = 'See [[Docker]] for more info.';

      const zones = findSkipZones(content);
      const linkZone = zones.find((z) => z.type === 'wiki_link');

      expect(linkZone).toBeDefined();
      expect(content.slice(linkZone!.start, linkZone!.end)).toBe('[[Docker]]');
    });

    it('detects markdown links', () => {
      const content = 'Check out [Docker docs](https://docs.docker.com) for help.';

      const zones = findSkipZones(content);
      const linkZone = zones.find((z) => z.type === 'markdown_link');

      expect(linkZone).toBeDefined();
      expect(content.slice(linkZone!.start, linkZone!.end)).toBe('[Docker docs](https://docs.docker.com)');
    });

    it('detects URLs', () => {
      const content = 'Visit https://docker.com for more info.';

      const zones = findSkipZones(content);
      const urlZone = zones.find((z) => z.type === 'url');

      expect(urlZone).toBeDefined();
      expect(content.slice(urlZone!.start, urlZone!.end)).toBe('https://docker.com');
    });

    it('detects headings', () => {
      const content = `# Docker Setup

Some content about Docker.

## Docker Commands

More content here.`;

      const zones = findSkipZones(content);
      const headingZones = zones.filter((z) => z.type === 'heading');

      expect(headingZones.length).toBe(2);
      expect(content.slice(headingZones[0]!.start, headingZones[0]!.end)).toBe('# Docker Setup');
      expect(content.slice(headingZones[1]!.start, headingZones[1]!.end)).toBe('## Docker Commands');
    });
  });

  describe('isInSkipZone', () => {
    it('returns zone when position is inside', () => {
      const zones = [
        { start: 10, end: 20, type: 'code_block' as const },
        { start: 30, end: 40, type: 'wiki_link' as const },
      ];

      const result = isInSkipZone(15, 18, zones);
      expect(result).toBeDefined();
      expect(result!.type).toBe('code_block');
    });

    it('returns null when position is outside all zones', () => {
      const zones = [
        { start: 10, end: 20, type: 'code_block' as const },
        { start: 30, end: 40, type: 'wiki_link' as const },
      ];

      const result = isInSkipZone(22, 28, zones);
      expect(result).toBeNull();
    });

    it('detects overlapping matches', () => {
      const zones = [
        { start: 10, end: 20, type: 'code_block' as const },
      ];

      // Match starts before zone but ends inside
      expect(isInSkipZone(5, 15, zones)).toBeDefined();

      // Match starts inside zone but ends after
      expect(isInSkipZone(15, 25, zones)).toBeDefined();

      // Match fully contains zone
      expect(isInSkipZone(5, 25, zones)).toBeDefined();
    });
  });

  describe('insertLinks', () => {
    it('inserts wiki-links at match positions', () => {
      const content = 'I use Docker for container management.';
      const matches: AutolinkMatch[] = [
        { start: 6, end: 12, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      ];

      const result = insertLinks(content, matches, []);

      expect(result.linkedContent).toBe('I use [[Docker]] for container management.');
      expect(result.linksAdded.length).toBe(1);
    });

    it('preserves original case with display text', () => {
      const content = 'I use DOCKER for container management.';
      const matches: AutolinkMatch[] = [
        { start: 6, end: 12, matchedText: 'DOCKER', target: 'Docker', path: 'tech/docker.md' },
      ];

      const result = insertLinks(content, matches, []);

      expect(result.linkedContent).toBe('I use [[Docker|DOCKER]] for container management.');
    });

    it('handles multiple matches in correct order', () => {
      const content = 'Use Docker and Kubernetes for container orchestration.';
      const matches: AutolinkMatch[] = [
        { start: 4, end: 10, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 15, end: 25, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
      ];

      const result = insertLinks(content, matches, []);

      expect(result.linkedContent).toBe('Use [[Docker]] and [[Kubernetes]] for container orchestration.');
      expect(result.linksAdded.length).toBe(2);
    });

    it('skips matches in skip zones', () => {
      const content = 'Use `Docker` command. Docker is great.';
      const matches: AutolinkMatch[] = [
        { start: 5, end: 11, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 22, end: 28, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      ];

      const zones = findSkipZones(content);
      const result = insertLinks(content, matches, zones);

      expect(result.linkedContent).toBe('Use `Docker` command. [[Docker]] is great.');
      expect(result.linksAdded.length).toBe(1);
      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0]!.reason).toContain('inline_code');
    });
  });

  describe('autolinkContent', () => {
    it('combines scanning and linking', () => {
      const content = `---
type: research
---

# Introduction

Docker is a container platform. Use Docker for deployments.`;

      const matches: AutolinkMatch[] = [
        { start: 52, end: 58, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 86, end: 92, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      ];

      const result = autolinkContent(content, matches);

      // First mention in heading should be skipped
      expect(result.linkedContent).toContain('[[Docker]]');
      expect(result.linksAdded.length).toBeGreaterThan(0);
    });
  });
});

describe('autolink/scanner', () => {
  describe('scanForMatches', () => {
    it('finds matching titles in content', () => {
      const content = 'Docker is a container platform.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);

      expect(matches.length).toBe(1);
      expect(matches[0]!.matchedText).toBe('Docker');
      expect(matches[0]!.target).toBe('Docker');
    });

    it('performs case-insensitive matching', () => {
      const content = 'DOCKER is great. docker is useful.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);

      expect(matches.length).toBe(2);
      expect(matches[0]!.matchedText).toBe('DOCKER');
      expect(matches[1]!.matchedText).toBe('docker');
    });

    it('respects word boundaries', () => {
      const content = 'Docker and Dockerfiles are different.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);

      // Should only match "Docker", not "Docker" within "Dockerfiles"
      expect(matches.length).toBe(1);
      expect(matches[0]!.matchedText).toBe('Docker');
    });

    it('avoids self-linking', () => {
      const content = 'Docker is a container platform.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index, 'tech/docker.md');

      expect(matches.length).toBe(0);
    });

    it('prioritizes longer matches', () => {
      const content = 'Docker Compose is useful for multi-container apps.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
        ['docker compose', { title: 'Docker Compose', path: 'tech/docker-compose.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);

      // Should match "Docker Compose" not just "Docker"
      expect(matches.length).toBe(1);
      expect(matches[0]!.target).toBe('Docker Compose');
    });

    it('handles overlapping matches correctly', () => {
      const content = 'Docker Compose and Docker Swarm are orchestration tools.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
        ['docker compose', { title: 'Docker Compose', path: 'tech/docker-compose.md', aliases: [] }],
        ['docker swarm', { title: 'Docker Swarm', path: 'tech/docker-swarm.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);

      // Should match "Docker Compose" and "Docker Swarm", not standalone "Docker"
      expect(matches.length).toBe(2);
      expect(matches.map((m) => m.target).sort()).toEqual(['Docker Compose', 'Docker Swarm']);
    });
  });

  describe('DEFAULT_MIN_TITLE_LENGTH', () => {
    it('has a reasonable default', () => {
      expect(DEFAULT_MIN_TITLE_LENGTH).toBe(3);
    });
  });

  describe('filterByLinkMode', () => {
    const matches: AutolinkMatch[] = [
      { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      { start: 50, end: 56, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      { start: 100, end: 106, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      { start: 20, end: 30, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
    ];

    it('returns all matches when mode is "all"', () => {
      const filtered = filterByLinkMode(matches, 'all', '');
      expect(filtered).toHaveLength(4);
    });

    it('returns first occurrence per note when mode is "first_per_note"', () => {
      const filtered = filterByLinkMode(matches, 'first_per_note', '');
      expect(filtered).toHaveLength(2); // One Docker, one Kubernetes
      expect(filtered.find(m => m.target === 'Docker')?.start).toBe(0); // First Docker
      expect(filtered.find(m => m.target === 'Kubernetes')).toBeDefined();
    });

    it('returns first occurrence per section when mode is "first_per_section"', () => {
      const content = `# Section 1

Docker is great. Docker again.

## Section 2

Docker is also here. Kubernetes too.`;

      const sectionMatches: AutolinkMatch[] = [
        { start: 14, end: 20, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 31, end: 37, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 54, end: 60, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 79, end: 89, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
      ];

      const filtered = filterByLinkMode(sectionMatches, 'first_per_section', content);
      // First Docker in Section 1, first Docker in Section 2, first Kubernetes
      expect(filtered).toHaveLength(3);
    });
  });

  describe('filterByStopWords', () => {
    it('filters out matches for stop words', () => {
      const matches: AutolinkMatch[] = [
        { start: 0, end: 8, matchedText: 'Overview', target: 'Overview', path: 'pages/overview.md' },
        { start: 10, end: 16, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 30, end: 43, matchedText: 'Documentation', target: 'Documentation', path: 'pages/documentation.md' },
      ];

      const stopWords = ['overview', 'documentation'];
      const filtered = filterByStopWords(matches, stopWords);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.target).toBe('Docker');
    });

    it('is case-insensitive', () => {
      const matches: AutolinkMatch[] = [
        { start: 0, end: 8, matchedText: 'OVERVIEW', target: 'Overview', path: 'pages/overview.md' },
      ];

      const stopWords = ['overview'];
      const filtered = filterByStopWords(matches, stopWords);

      expect(filtered).toHaveLength(0);
    });

    it('supports regex patterns for stop words', () => {
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Test 1', target: 'Test 1', path: 'tests/test-1.md' },
        { start: 10, end: 16, matchedText: 'Test 2', target: 'Test 2', path: 'tests/test-2.md' },
        { start: 20, end: 26, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 30, end: 39, matchedText: 'TestSuite', target: 'TestSuite', path: 'tests/testsuite.md' },
      ];

      // Regex pattern to match anything starting with "Test"
      const stopWords = ['/^Test/i'];
      const filtered = filterByStopWords(matches, stopWords);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.target).toBe('Docker');
    });

    it('handles invalid regex patterns gracefully', () => {
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 10, end: 16, matchedText: 'Invalid', target: 'Invalid', path: 'pages/invalid.md' },
      ];

      // Invalid regex pattern (unbalanced brackets)
      const stopWords = ['/[invalid/'];
      const filtered = filterByStopWords(matches, stopWords);

      // Should not crash, invalid pattern treated as literal string
      expect(filtered).toHaveLength(2);
    });

    it('supports regex with flags', () => {
      const matches: AutolinkMatch[] = [
        { start: 0, end: 7, matchedText: 'FooBar1', target: 'FooBar1', path: 'pages/foobar1.md' },
        { start: 10, end: 17, matchedText: 'foobar2', target: 'foobar2', path: 'pages/foobar2.md' },
        { start: 20, end: 26, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      ];

      // Regex with explicit case-insensitive flag
      const stopWords = ['/foobar\\d/i'];
      const filtered = filterByStopWords(matches, stopWords);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.target).toBe('Docker');
    });

    it('combines string and regex stop words', () => {
      const matches: AutolinkMatch[] = [
        { start: 0, end: 8, matchedText: 'Overview', target: 'Overview', path: 'pages/overview.md' },
        { start: 10, end: 16, matchedText: 'Test 1', target: 'Test 1', path: 'tests/test-1.md' },
        { start: 20, end: 26, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      ];

      // Mix of string and regex stop words
      const stopWords = ['overview', '/^Test/'];
      const filtered = filterByStopWords(matches, stopWords);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.target).toBe('Docker');
    });
  });

  describe('DEFAULT_STOP_WORDS', () => {
    it('includes common generic terms', () => {
      expect(DEFAULT_STOP_WORDS).toContain('overview');
      expect(DEFAULT_STOP_WORDS).toContain('documentation');
      expect(DEFAULT_STOP_WORDS).toContain('related');
      expect(DEFAULT_STOP_WORDS).toContain('references');
    });
  });
});

describe('autolink bug fixes (Phase 024)', () => {
  describe('double-linking prevention', () => {
    it('should not create [[A]] [[A]] patterns', () => {
      const content = 'Docker Docker Docker';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);
      // All three should match
      expect(matches).toHaveLength(3);

      // But when using first_per_note, only one should link
      const filtered = filterByLinkMode(matches, 'first_per_note', content);
      expect(filtered).toHaveLength(1);

      const result = insertLinks(content, filtered, []);
      expect(result.linkedContent).toBe('[[Docker]] Docker Docker');
      // Should not have [[Docker]] [[Docker]]
      expect(result.linkedContent).not.toMatch(/\[\[Docker\]\]\s*\[\[Docker\]\]/);
    });
  });

  describe('nested bracket prevention', () => {
    it('should not create [[[[A]]]] patterns', () => {
      const content = 'See [[Docker]] for more info about Docker.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);
      const zones = findSkipZones(content);
      const result = insertLinks(content, matches, zones);

      // Should only link the second Docker, not the one already linked
      expect(result.linkedContent).toBe('See [[Docker]] for more info about [[Docker]].');
      // Should not have nested brackets
      expect(result.linkedContent).not.toContain('[[[[');
      expect(result.linkedContent).not.toContain(']]]]');
    });

    it('should skip terms inside existing wiki-links', () => {
      const content = 'The [[Docker Compose]] tool uses Docker.';
      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
        ['docker compose', { title: 'Docker Compose', path: 'tech/docker-compose.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);
      const zones = findSkipZones(content);
      const result = insertLinks(content, matches, zones);

      // Should not link Docker inside [[Docker Compose]]
      expect(result.linkedContent).toBe('The [[Docker Compose]] tool uses [[Docker]].');
    });
  });

  describe('heading protection', () => {
    it('should not link terms in H1 headings', () => {
      const content = `# Docker Setup Guide

Docker is a great tool.`;

      const index = new Map<string, LinkableTitle>([
        ['docker', { title: 'Docker', path: 'tech/docker.md', aliases: [] }],
      ]);

      const matches = scanForMatches(content, index);
      const zones = findSkipZones(content);
      const result = insertLinks(content, matches, zones);

      // Should not link Docker in heading
      expect(result.linkedContent).toBe(`# Docker Setup Guide

[[Docker]] is a great tool.`);
    });

    it('should not link terms in any heading level', () => {
      const content = `# Docker
## Docker Features
### Docker CLI
#### Docker Compose`;

      const zones = findSkipZones(content);
      const headingZones = zones.filter(z => z.type === 'heading');

      // All headings should be skip zones
      expect(headingZones).toHaveLength(4);
    });
  });

  describe('domain scoping', () => {
    const matches: AutolinkMatch[] = [
      { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      { start: 10, end: 13, matchedText: 'IoT', target: 'IoT', path: 'automotive/iot.md' },
      { start: 20, end: 30, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
    ];

    it('returns all matches when scope is "any"', () => {
      const filtered = filterByDomainScope(matches, 'tech/notes.md', 'any');
      expect(filtered).toHaveLength(3);
    });

    it('filters to same domain when scope is "same_domain"', () => {
      const filtered = filterByDomainScope(matches, 'tech/notes.md', 'same_domain');
      expect(filtered).toHaveLength(2);
      expect(filtered.map(m => m.target).sort()).toEqual(['Docker', 'Kubernetes']);
    });

    it('filters to specific domains when scope is an array', () => {
      const filtered = filterByDomainScope(matches, 'tech/notes.md', ['automotive']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.target).toBe('IoT');
    });

    it('includes root-level notes regardless of scope', () => {
      const matchesWithRoot: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 10, end: 16, matchedText: 'README', target: 'README', path: 'readme.md' },
      ];

      const filtered = filterByDomainScope(matchesWithRoot, 'automotive/project.md', 'same_domain');
      // readme.md has no domain, so it's included
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.target).toBe('README');
    });
  });

  describe('link density controls', () => {
    describe('maxLinksPerParagraph', () => {
      it('limits links per paragraph', () => {
        const content = `Docker and Kubernetes and Redis and MongoDB are tools.

Another paragraph with more tools.`;

        const matches: AutolinkMatch[] = [
          { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
          { start: 11, end: 21, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
          { start: 26, end: 31, matchedText: 'Redis', target: 'Redis', path: 'tech/redis.md' },
          { start: 36, end: 43, matchedText: 'MongoDB', target: 'MongoDB', path: 'tech/mongodb.md' },
        ];

        const filtered = filterByLinkDensity(matches, content, { maxLinksPerParagraph: 2 });
        expect(filtered).toHaveLength(2);
        // First two matches should be kept
        expect(filtered[0]!.target).toBe('Docker');
        expect(filtered[1]!.target).toBe('Kubernetes');
      });
    });

    describe('minWordDistance', () => {
      it('enforces minimum word distance between links', () => {
        const content = 'Docker is a tool. Kubernetes is another tool. Redis works too.';

        const matches: AutolinkMatch[] = [
          { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
          { start: 18, end: 28, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
          { start: 46, end: 51, matchedText: 'Redis', target: 'Redis', path: 'tech/redis.md' },
        ];

        const filtered = filterByLinkDensity(matches, content, { minWordDistance: 5 });
        // Docker, then Kubernetes (5+ words later), then Redis (5+ words later)
        expect(filtered.length).toBeGreaterThanOrEqual(2);
      });

      it('skips links that are too close together', () => {
        const content = 'Docker Kubernetes Redis MongoDB';

        const matches: AutolinkMatch[] = [
          { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
          { start: 7, end: 17, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
          { start: 18, end: 23, matchedText: 'Redis', target: 'Redis', path: 'tech/redis.md' },
          { start: 24, end: 31, matchedText: 'MongoDB', target: 'MongoDB', path: 'tech/mongodb.md' },
        ];

        const filtered = filterByLinkDensity(matches, content, { minWordDistance: 3 });
        // Only Docker should be kept - others are too close
        expect(filtered).toHaveLength(1);
        expect(filtered[0]!.target).toBe('Docker');
      });
    });

    it('returns all matches when no density options provided', () => {
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 7, end: 17, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
      ];

      const filtered = filterByLinkDensity(matches, 'content', {});
      expect(filtered).toHaveLength(2);
    });
  });
});

describe('analyzeLinkDensity (Phase 024)', () => {
  describe('high density detection', () => {
    it('warns when link density ratio exceeds threshold', () => {
      // 10 words, 2 links = 20% density
      const content = 'Docker and Kubernetes are tools for container orchestration today';
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 11, end: 21, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
      ];

      const warnings = analyzeLinkDensity(content, matches, { highDensityRatio: 0.15 });
      expect(warnings.some(w => w.type === 'high_density')).toBe(true);
    });

    it('does not warn when density is acceptable', () => {
      const content = 'Docker is a containerization platform that helps developers build and deploy applications efficiently across different environments.';
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      ];

      const warnings = analyzeLinkDensity(content, matches, { highDensityRatio: 0.1 });
      expect(warnings.some(w => w.type === 'high_density')).toBe(false);
    });
  });

  describe('paragraph overload detection', () => {
    it('warns when a paragraph has too many links', () => {
      const content = 'Docker Kubernetes Redis MongoDB PostgreSQL Nginx Apache are all useful tools.';
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 7, end: 17, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
        { start: 18, end: 23, matchedText: 'Redis', target: 'Redis', path: 'tech/redis.md' },
        { start: 24, end: 31, matchedText: 'MongoDB', target: 'MongoDB', path: 'tech/mongodb.md' },
        { start: 32, end: 42, matchedText: 'PostgreSQL', target: 'PostgreSQL', path: 'tech/postgres.md' },
        { start: 43, end: 48, matchedText: 'Nginx', target: 'Nginx', path: 'tech/nginx.md' },
      ];

      const warnings = analyzeLinkDensity(content, matches, { maxLinksPerParagraph: 3 });
      expect(warnings.some(w => w.type === 'paragraph_overload')).toBe(true);
    });
  });

  describe('clustered links detection', () => {
    it('warns when links are too close together on average', () => {
      const content = 'Docker Kubernetes Redis are tools.';
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 7, end: 17, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
        { start: 18, end: 23, matchedText: 'Redis', target: 'Redis', path: 'tech/redis.md' },
      ];

      const warnings = analyzeLinkDensity(content, matches, { minAverageWordDistance: 5 });
      expect(warnings.some(w => w.type === 'clustered_links')).toBe(true);
    });

    it('does not warn when links are well spaced', () => {
      const content = 'Docker is a great tool for containers. Kubernetes helps with orchestration and scaling. Redis provides fast caching.';
      const matches: AutolinkMatch[] = [
        { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
        { start: 39, end: 49, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
        { start: 87, end: 92, matchedText: 'Redis', target: 'Redis', path: 'tech/redis.md' },
      ];

      const warnings = analyzeLinkDensity(content, matches, { minAverageWordDistance: 3 });
      expect(warnings.some(w => w.type === 'clustered_links')).toBe(false);
    });
  });

  it('returns empty warnings array when no matches', () => {
    const warnings = analyzeLinkDensity('Some content', []);
    expect(warnings).toHaveLength(0);
  });

  it('provides detailed warning information', () => {
    const content = 'Docker Kubernetes Redis MongoDB are tools.';
    const matches: AutolinkMatch[] = [
      { start: 0, end: 6, matchedText: 'Docker', target: 'Docker', path: 'tech/docker.md' },
      { start: 7, end: 17, matchedText: 'Kubernetes', target: 'Kubernetes', path: 'tech/k8s.md' },
      { start: 18, end: 23, matchedText: 'Redis', target: 'Redis', path: 'tech/redis.md' },
      { start: 24, end: 31, matchedText: 'MongoDB', target: 'MongoDB', path: 'tech/mongodb.md' },
    ];

    const warnings = analyzeLinkDensity(content, matches, {
      maxLinksPerParagraph: 2,
      highDensityRatio: 0.3,
    });

    // Should have paragraph overload warning
    const paragraphWarning = warnings.find(w => w.type === 'paragraph_overload');
    expect(paragraphWarning).toBeDefined();
    expect(paragraphWarning!.details.paragraph).toBe(1);
    expect(paragraphWarning!.details.linkCount).toBe(4);
    expect(paragraphWarning!.details.threshold).toBe(2);
    expect(paragraphWarning!.message).toContain('links');
  });
});
