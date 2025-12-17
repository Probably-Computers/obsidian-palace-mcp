import { describe, it, expect } from 'vitest';
import {
  stripWikiLinks,
  extractTitle,
  extractHeadings,
  processWikiLinks,
  adjustHeaderLevels,
  stripFrontmatter,
  frontmatterToHeader,
  markdownToHtml,
  wrapHtmlDocument,
} from '../../../src/utils/markdown.js';

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

// ============================================
// Phase 026: Link Processing Tests
// ============================================

describe('processWikiLinks (Phase 026)', () => {
  describe('keep style', () => {
    it('should leave wiki-links unchanged', () => {
      const content = 'Link to [[Note]] and [[Other|alias]]';
      expect(processWikiLinks(content, 'keep')).toBe(content);
    });
  });

  describe('plain_text style', () => {
    it('should convert simple wiki-links to plain text', () => {
      const content = 'Link to [[Note]] here';
      expect(processWikiLinks(content, 'plain_text')).toBe('Link to Note here');
    });

    it('should use display text when available', () => {
      const content = 'See [[Note|the note]] for details';
      expect(processWikiLinks(content, 'plain_text')).toBe('See the note for details');
    });

    it('should handle multiple links', () => {
      const content = '[[One]], [[Two|2]], and [[Three]]';
      expect(processWikiLinks(content, 'plain_text')).toBe('One, 2, and Three');
    });
  });

  describe('relative style', () => {
    it('should convert wiki-links to relative markdown links', () => {
      const content = 'Link to [[Note]] here';
      expect(processWikiLinks(content, 'relative')).toBe('Link to [Note](./Note.md) here');
    });

    it('should use display text for link text', () => {
      const content = 'See [[Note|the note]] for details';
      expect(processWikiLinks(content, 'relative')).toBe('See [the note](./Note.md) for details');
    });

    it('should use custom slugify function', () => {
      const content = '[[My Note]]';
      const slugify = (title: string) => title.toLowerCase().replace(/\s+/g, '-') + '.md';
      expect(processWikiLinks(content, 'relative', slugify)).toBe('[My Note](./my-note.md)');
    });
  });

  describe('remove style', () => {
    it('should remove wiki-links entirely', () => {
      const content = 'Link to [[Note]] is removed';
      expect(processWikiLinks(content, 'remove')).toBe('Link to  is removed');
    });

    it('should remove wiki-links with aliases', () => {
      const content = 'See [[Note|alias]] here';
      expect(processWikiLinks(content, 'remove')).toBe('See  here');
    });
  });
});

describe('adjustHeaderLevels (Phase 026)', () => {
  it('should increase header levels by offset', () => {
    const content = '# H1\n## H2\n### H3';
    expect(adjustHeaderLevels(content, 1)).toBe('## H1\n### H2\n#### H3');
  });

  it('should decrease header levels by negative offset', () => {
    const content = '## H2\n### H3';
    expect(adjustHeaderLevels(content, -1)).toBe('# H2\n## H3');
  });

  it('should not go below level 1', () => {
    const content = '# H1';
    expect(adjustHeaderLevels(content, -5)).toBe('# H1');
  });

  it('should not go above level 6', () => {
    const content = '###### H6';
    expect(adjustHeaderLevels(content, 5)).toBe('###### H6');
  });

  it('should return unchanged if offset is 0', () => {
    const content = '# Title\nContent\n## Section';
    expect(adjustHeaderLevels(content, 0)).toBe(content);
  });

  it('should preserve non-header content', () => {
    const content = '# Title\n\nParagraph text\n\n## Section';
    const result = adjustHeaderLevels(content, 1);
    expect(result).toContain('Paragraph text');
    expect(result).toContain('## Title');
    expect(result).toContain('### Section');
  });
});

describe('stripFrontmatter (Phase 026)', () => {
  it('should remove YAML frontmatter', () => {
    const content = `---
title: Test
type: research
---

# Content`;
    expect(stripFrontmatter(content)).toBe('# Content');
  });

  it('should handle content without frontmatter', () => {
    const content = '# Just Content\n\nNo frontmatter here';
    expect(stripFrontmatter(content)).toBe(content);
  });

  it('should handle empty frontmatter', () => {
    const content = `---
---

# Content`;
    expect(stripFrontmatter(content)).toBe('# Content');
  });
});

describe('frontmatterToHeader (Phase 026)', () => {
  it('should convert frontmatter to readable header', () => {
    const fm = {
      title: 'Test Note',
      created: '2025-01-01',
      tags: ['one', 'two'],
    };
    const result = frontmatterToHeader(fm);
    expect(result).toContain('**Title:** Test Note');
    expect(result).toContain('**Created:** 2025-01-01');
    expect(result).toContain('**Tags:** one, two');
    expect(result).toContain('---');
  });

  it('should use specified fields only', () => {
    const fm = {
      title: 'Test',
      created: '2025-01-01',
      secret: 'hidden',
    };
    const result = frontmatterToHeader(fm, ['title']);
    expect(result).toContain('**Title:** Test');
    expect(result).not.toContain('created');
    expect(result).not.toContain('secret');
  });

  it('should return empty string if no matching fields', () => {
    const fm = { other: 'value' };
    const result = frontmatterToHeader(fm, ['title']);
    expect(result).toBe('');
  });
});

describe('markdownToHtml (Phase 026)', () => {
  it('should convert headers', () => {
    expect(markdownToHtml('# H1')).toContain('<h1>H1</h1>');
    expect(markdownToHtml('## H2')).toContain('<h2>H2</h2>');
    expect(markdownToHtml('### H3')).toContain('<h3>H3</h3>');
  });

  it('should convert bold text', () => {
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(markdownToHtml('__bold__')).toContain('<strong>bold</strong>');
  });

  it('should convert italic text', () => {
    expect(markdownToHtml('*italic*')).toContain('<em>italic</em>');
    expect(markdownToHtml('_italic_')).toContain('<em>italic</em>');
  });

  it('should convert inline code', () => {
    expect(markdownToHtml('Use `code` here')).toContain('<code>code</code>');
  });

  it('should convert code blocks', () => {
    const md = '```js\nconst x = 1;\n```';
    const html = markdownToHtml(md);
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('should convert markdown links', () => {
    expect(markdownToHtml('[text](http://example.com)')).toContain('<a href="http://example.com">text</a>');
  });

  it('should convert wiki-links to spans', () => {
    expect(markdownToHtml('[[Note]]')).toContain('<span class="wiki-link"');
    expect(markdownToHtml('[[Note|Alias]]')).toContain('data-target="Note"');
    expect(markdownToHtml('[[Note|Alias]]')).toContain('>Alias</span>');
  });

  it('should convert lists', () => {
    expect(markdownToHtml('- item')).toContain('<li>item</li>');
  });

  it('should convert blockquotes', () => {
    expect(markdownToHtml('> quote')).toContain('<blockquote>quote</blockquote>');
  });
});

describe('wrapHtmlDocument (Phase 026)', () => {
  it('should wrap content in HTML document', () => {
    const html = wrapHtmlDocument('<p>Content</p>', 'Test Title');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Test Title</title>');
    expect(html).toContain('<p>Content</p>');
    expect(html).toContain('</html>');
  });

  it('should include styles when requested', () => {
    const html = wrapHtmlDocument('<p>Content</p>', 'Title', { includeStyles: true });
    expect(html).toContain('<style>');
    expect(html).toContain('font-family');
  });

  it('should omit styles when not requested', () => {
    const html = wrapHtmlDocument('<p>Content</p>', 'Title', { includeStyles: false });
    expect(html).not.toContain('<style>');
  });
});
