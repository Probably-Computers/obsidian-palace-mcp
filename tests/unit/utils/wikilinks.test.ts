/**
 * Tests for wiki-link parsing and creation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractWikiLinks,
  createWikiLink,
  hasWikiLinkTo,
  getUniqueTargets,
  formatRelatedLinks,
  isInsideCodeOrLink,
} from '../../../src/utils/wikilinks.js';

describe('extractWikiLinks', () => {
  it('extracts simple wiki-links', () => {
    const links = extractWikiLinks('See [[Kubernetes]] and [[Docker]].');
    expect(links).toHaveLength(2);
    expect(links[0].target).toBe('Kubernetes');
    expect(links[0].raw).toBe('[[Kubernetes]]');
    expect(links[0].display).toBeUndefined();
    expect(links[1].target).toBe('Docker');
  });

  it('extracts wiki-links with display text', () => {
    const links = extractWikiLinks('Check [[Kubernetes|K8s]] for more.');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Kubernetes');
    expect(links[0].display).toBe('K8s');
    expect(links[0].raw).toBe('[[Kubernetes|K8s]]');
  });

  it('returns empty array for no links', () => {
    expect(extractWikiLinks('No links here.')).toHaveLength(0);
  });

  it('trims whitespace from targets and display', () => {
    const links = extractWikiLinks('See [[ Spaced Target | Spaced Display ]].');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Spaced Target');
    expect(links[0].display).toBe('Spaced Display');
  });

  it('handles multiple links on same line', () => {
    const links = extractWikiLinks('[[A]] then [[B]] then [[C]]');
    expect(links).toHaveLength(3);
    expect(links.map(l => l.target)).toEqual(['A', 'B', 'C']);
  });
});

describe('createWikiLink', () => {
  it('creates simple link', () => {
    expect(createWikiLink('Kubernetes')).toBe('[[Kubernetes]]');
  });

  it('creates link with display text', () => {
    expect(createWikiLink('Kubernetes', 'K8s')).toBe('[[Kubernetes|K8s]]');
  });

  it('omits display when same as target', () => {
    expect(createWikiLink('Docker', 'Docker')).toBe('[[Docker]]');
  });
});

describe('hasWikiLinkTo', () => {
  it('returns true when link exists', () => {
    expect(hasWikiLinkTo('See [[Kubernetes]].', 'Kubernetes')).toBe(true);
  });

  it('returns false when link does not exist', () => {
    expect(hasWikiLinkTo('See [[Docker]].', 'Kubernetes')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(hasWikiLinkTo('See [[kubernetes]].', 'Kubernetes')).toBe(true);
    expect(hasWikiLinkTo('See [[KUBERNETES]].', 'kubernetes')).toBe(true);
  });
});

describe('getUniqueTargets', () => {
  it('returns unique targets', () => {
    const targets = getUniqueTargets('[[A]] and [[B]] and [[A]] again.');
    expect(targets).toHaveLength(2);
    expect(targets).toContain('A');
    expect(targets).toContain('B');
  });

  it('returns empty for no links', () => {
    expect(getUniqueTargets('No links.')).toHaveLength(0);
  });
});

describe('formatRelatedLinks', () => {
  it('wraps targets in wiki-link syntax', () => {
    const result = formatRelatedLinks(['Kubernetes', 'Docker']);
    expect(result).toEqual(['[[Kubernetes]]', '[[Docker]]']);
  });

  it('handles empty array', () => {
    expect(formatRelatedLinks([])).toEqual([]);
  });
});

describe('isInsideCodeOrLink', () => {
  it('detects position inside code block', () => {
    const content = 'Before ```code block``` after';
    // Position inside the code block (the 'c' in 'code')
    const codeStart = content.indexOf('code block');
    expect(isInsideCodeOrLink(content, codeStart)).toBe(true);
  });

  it('returns false for position outside code block', () => {
    const content = 'Before ```code``` after';
    const afterPos = content.indexOf('after');
    expect(isInsideCodeOrLink(content, afterPos)).toBe(false);
  });

  it('detects position inside inline code', () => {
    const content = 'Text `inline code` more text';
    const inlinePos = content.indexOf('inline');
    expect(isInsideCodeOrLink(content, inlinePos)).toBe(true);
  });

  it('returns false for position outside inline code', () => {
    const content = 'Text `inline` more text';
    const morePos = content.indexOf('more');
    expect(isInsideCodeOrLink(content, morePos)).toBe(false);
  });

  it('detects position inside wiki-link', () => {
    const content = 'See [[Kubernetes]] for more';
    const k8sPos = content.indexOf('Kubernetes');
    expect(isInsideCodeOrLink(content, k8sPos)).toBe(true);
  });

  it('returns false for position outside wiki-link', () => {
    const content = 'See [[Kubernetes]] for more';
    const forPos = content.indexOf('for more');
    expect(isInsideCodeOrLink(content, forPos)).toBe(false);
  });

  it('returns false at start of plain content', () => {
    expect(isInsideCodeOrLink('plain text', 0)).toBe(false);
  });
});
