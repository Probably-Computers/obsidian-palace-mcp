/**
 * Autolink linker - inserts wiki-links into content
 */

import type { AutolinkMatch } from './scanner.js';
import { createWikiLink } from '../../utils/wikilinks.js';

/**
 * Skip zone - region of content that should not be auto-linked
 */
interface SkipZone {
  start: number;
  end: number;
  type: 'code_block' | 'inline_code' | 'wiki_link' | 'markdown_link' | 'url' | 'heading' | 'frontmatter';
}

/**
 * Result of auto-linking operation
 */
export interface AutolinkResult {
  originalContent: string;
  linkedContent: string;
  linksAdded: AutolinkMatch[];
  skipped: Array<{ match: AutolinkMatch; reason: string }>;
}

/**
 * Find all skip zones in content where auto-linking should not occur
 */
export function findSkipZones(content: string): SkipZone[] {
  const zones: SkipZone[] = [];

  // Frontmatter (--- ... ---)
  const frontmatterRegex = /^---\n[\s\S]*?\n---/;
  const fmMatch = content.match(frontmatterRegex);
  if (fmMatch) {
    zones.push({
      start: 0,
      end: fmMatch[0].length,
      type: 'frontmatter',
    });
  }

  // Fenced code blocks (``` ... ```)
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    zones.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'code_block',
    });
  }

  // Inline code (` ... `)
  const inlineCodeRegex = /`[^`\n]+`/g;
  while ((match = inlineCodeRegex.exec(content)) !== null) {
    zones.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'inline_code',
    });
  }

  // Existing wiki-links ([[...]])
  const wikiLinkRegex = /\[\[[^\]]+\]\]/g;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    zones.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'wiki_link',
    });
  }

  // Markdown links ([text](url))
  const mdLinkRegex = /\[([^\]]*)\]\([^)]+\)/g;
  while ((match = mdLinkRegex.exec(content)) !== null) {
    zones.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'markdown_link',
    });
  }

  // URLs (http:// or https://)
  const urlRegex = /https?:\/\/[^\s)>\]]+/g;
  while ((match = urlRegex.exec(content)) !== null) {
    zones.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'url',
    });
  }

  // Headings (# Title) - only the line itself
  const headingRegex = /^#{1,6}\s+.*$/gm;
  while ((match = headingRegex.exec(content)) !== null) {
    zones.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'heading',
    });
  }

  return zones;
}

/**
 * Check if a position falls within any skip zone
 */
export function isInSkipZone(position: number, end: number, zones: SkipZone[]): SkipZone | null {
  for (const zone of zones) {
    // Check if match overlaps with zone
    if (position < zone.end && end > zone.start) {
      return zone;
    }
  }
  return null;
}

/**
 * Insert wiki-links into content at match positions
 * Processes matches in reverse order to maintain position integrity
 */
export function insertLinks(
  content: string,
  matches: AutolinkMatch[],
  skipZones?: SkipZone[],
): AutolinkResult {
  const zones = skipZones ?? findSkipZones(content);
  const linksAdded: AutolinkMatch[] = [];
  const skipped: Array<{ match: AutolinkMatch; reason: string }> = [];

  // Process in reverse order to maintain position integrity
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);

  let result = content;

  for (const match of sortedMatches) {
    // Check if match is in a skip zone
    const zone = isInSkipZone(match.start, match.end, zones);
    if (zone) {
      skipped.push({ match, reason: `inside ${zone.type}` });
      continue;
    }

    // Skip creating links to hub filenames or other invalid targets
    const targetLower = match.target.toLowerCase();
    if (targetLower === '_index' || targetLower === 'index' || targetLower === 'readme') {
      skipped.push({ match, reason: 'invalid target (hub filename)' });
      continue;
    }

    // Create wiki-link preserving original case
    const wikiLink = createWikiLink(match.target, match.matchedText !== match.target ? match.matchedText : undefined);

    // Replace the matched text with wiki-link
    result = result.slice(0, match.start) + wikiLink + result.slice(match.end);
    linksAdded.push(match);
  }

  return {
    originalContent: content,
    linkedContent: result,
    linksAdded: linksAdded.reverse(), // Return in original order
    skipped,
  };
}

/**
 * Auto-link content in a single operation
 * This is the main entry point for auto-linking
 */
export function autolinkContent(
  content: string,
  matches: AutolinkMatch[],
): AutolinkResult {
  const skipZones = findSkipZones(content);
  return insertLinks(content, matches, skipZones);
}
