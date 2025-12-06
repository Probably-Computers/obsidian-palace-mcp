/**
 * Autolink service tests
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
  DEFAULT_MIN_TITLE_LENGTH,
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
});
