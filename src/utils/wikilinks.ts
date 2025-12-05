/**
 * Wiki-link parsing and creation
 */

import type { WikiLink } from '../types/index.js';

// Regex to match [[wiki-links]] with optional display text
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Extract all wiki-links from content
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  let match;

  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    links.push({
      target: match[1]!.trim(),
      display: match[2]?.trim(),
      raw: match[0],
    });
  }

  return links;
}

/**
 * Create a wiki-link string
 */
export function createWikiLink(target: string, display?: string): string {
  if (display && display !== target) {
    return `[[${target}|${display}]]`;
  }
  return `[[${target}]]`;
}

/**
 * Check if text contains a wiki-link to a specific target
 */
export function hasWikiLinkTo(content: string, target: string): boolean {
  const links = extractWikiLinks(content);
  const normalizedTarget = target.toLowerCase();
  return links.some((link) => link.target.toLowerCase() === normalizedTarget);
}

/**
 * Get unique wiki-link targets from content
 */
export function getUniqueTargets(content: string): string[] {
  const links = extractWikiLinks(content);
  const targets = new Set(links.map((link) => link.target));
  return Array.from(targets);
}

/**
 * Format a list of targets as related frontmatter entries
 */
export function formatRelatedLinks(targets: string[]): string[] {
  return targets.map((target) => `[[${target}]]`);
}

/**
 * Check if position in content is inside a code block or existing link
 */
export function isInsideCodeOrLink(
  content: string,
  position: number
): boolean {
  // Check for code blocks (``` ... ```)
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (position >= match.index && position < match.index + match[0].length) {
      return true;
    }
  }

  // Check for inline code (` ... `)
  const inlineCodeRegex = /`[^`]+`/g;
  while ((match = inlineCodeRegex.exec(content)) !== null) {
    if (position >= match.index && position < match.index + match[0].length) {
      return true;
    }
  }

  // Check if inside existing wiki-link
  const wikiLinkRegex = /\[\[[^\]]+\]\]/g;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    if (position >= match.index && position < match.index + match[0].length) {
      return true;
    }
  }

  return false;
}
