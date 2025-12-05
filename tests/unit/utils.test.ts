/**
 * Utility function tests
 */

import { describe, it, expect } from 'vitest';
import { slugify, unslugify, filenameFromTitle } from '../../src/utils/slugify';
import { extractWikiLinks, createWikiLink, hasWikiLinkTo } from '../../src/utils/wikilinks';
import { extractTitle, stripMarkdown, wordCount } from '../../src/utils/markdown';

describe('slugify', () => {
  it('converts titles to slugs', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('Docker Build Command')).toBe('docker-build-command');
    expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
  });

  it('handles special characters', () => {
    expect(slugify('What is K8s?')).toBe('what-is-k8s');
    expect(slugify("It's a test!")).toBe('its-a-test');
  });

  it('generates filenames', () => {
    expect(filenameFromTitle('Docker Build')).toBe('docker-build.md');
  });
});

describe('wikilinks', () => {
  it('extracts wiki-links from content', () => {
    const content = 'This links to [[Note One]] and [[Note Two|Display Text]].';
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      target: 'Note One',
      display: undefined,
      raw: '[[Note One]]',
    });
    expect(links[1]).toEqual({
      target: 'Note Two',
      display: 'Display Text',
      raw: '[[Note Two|Display Text]]',
    });
  });

  it('creates wiki-links', () => {
    expect(createWikiLink('Note')).toBe('[[Note]]');
    expect(createWikiLink('Note', 'Display')).toBe('[[Note|Display]]');
  });

  it('checks for wiki-link presence', () => {
    const content = 'Links to [[Target Note]] here.';
    expect(hasWikiLinkTo(content, 'Target Note')).toBe(true);
    expect(hasWikiLinkTo(content, 'target note')).toBe(true); // case insensitive
    expect(hasWikiLinkTo(content, 'Other Note')).toBe(false);
  });
});

describe('markdown', () => {
  it('extracts titles', () => {
    expect(extractTitle('# Hello World\n\nContent')).toBe('Hello World');
    expect(extractTitle('No heading here')).toBe(null);
  });

  it('strips markdown', () => {
    const md = '# Title\n\n**Bold** and *italic* with [[link]].';
    const text = stripMarkdown(md);
    expect(text).not.toContain('#');
    expect(text).not.toContain('*');
    expect(text).not.toContain('[[');
  });

  it('counts words', () => {
    expect(wordCount('Hello world')).toBe(2);
    expect(wordCount('# Title\n\nOne two three.')).toBe(4);
  });
});
