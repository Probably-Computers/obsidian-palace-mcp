import { describe, it, expect } from 'vitest';
import { stripWikiLinks, extractTitle, extractHeadings } from '../../../src/utils/markdown.js';

describe('stripWikiLinks', () => {
  it('should strip simple wiki-links', () => {
    expect(stripWikiLinks('[[target]]')).toBe('target');
  });

  it('should strip wiki-links with display text', () => {
    expect(stripWikiLinks('[[target|Display Text]]')).toBe('Display Text');
  });

  it('should handle multiple wiki-links', () => {
    expect(stripWikiLinks('[[one]] and [[two|Two]]')).toBe('one and Two');
  });

  it('should preserve text around wiki-links', () => {
    expect(stripWikiLinks('Before [[link]] after')).toBe('Before link after');
  });

  it('should handle text without wiki-links', () => {
    expect(stripWikiLinks('Plain text')).toBe('Plain text');
  });

  it('should handle empty string', () => {
    expect(stripWikiLinks('')).toBe('');
  });

  it('should handle nested brackets correctly', () => {
    expect(stripWikiLinks('[[_index]] Overview')).toBe('_index Overview');
  });

  it('should fix the "Sandboxed/Secure [[_index]]" issue', () => {
    expect(stripWikiLinks('Sandboxed/Secure [[_index]]')).toBe('Sandboxed/Secure _index');
  });

  it('should preserve path separators in targets', () => {
    expect(stripWikiLinks('[[folder/file]]')).toBe('folder/file');
  });
});

describe('extractTitle', () => {
  it('should extract title from H1 heading', () => {
    const content = '# My Title\n\nSome content';
    expect(extractTitle(content)).toBe('My Title');
  });

  it('should return null if no H1 heading', () => {
    const content = '## Section\n\nContent';
    expect(extractTitle(content)).toBeNull();
  });

  it('should strip wiki-links from title', () => {
    const content = '# [[_index]] Overview\n\nContent';
    expect(extractTitle(content)).toBe('_index Overview');
  });

  it('should strip wiki-links with display text from title', () => {
    const content = '# [[target|Kubernetes]] Overview\n\nContent';
    expect(extractTitle(content)).toBe('Kubernetes Overview');
  });

  it('should handle title with multiple wiki-links', () => {
    const content = '# [[a]] and [[b|B]]\n\nContent';
    expect(extractTitle(content)).toBe('a and B');
  });
});

describe('extractHeadings', () => {
  it('should extract all headings', () => {
    const content = '# H1\n\n## H2\n\n### H3';
    const headings = extractHeadings(content);
    expect(headings).toHaveLength(3);
    expect(headings[0]).toMatchObject({ level: 1, text: 'H1' });
    expect(headings[1]).toMatchObject({ level: 2, text: 'H2' });
    expect(headings[2]).toMatchObject({ level: 3, text: 'H3' });
  });

  it('should strip wiki-links from heading text', () => {
    const content = '# [[target]] Title\n\n## [[a|Section]] Two';
    const headings = extractHeadings(content);
    expect(headings[0]?.text).toBe('target Title');
    expect(headings[1]?.text).toBe('Section Two');
  });

  it('should track heading positions', () => {
    const content = '# First\n\n## Second';
    const headings = extractHeadings(content);
    expect(headings[0]?.position).toBe(0);
    expect(headings[1]?.position).toBeGreaterThan(0);
  });
});
