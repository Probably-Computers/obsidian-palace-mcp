/**
 * Domain Analyzer (Phase 025)
 *
 * Analyzes domain tags across the vault:
 * - Finds orphaned domains (used by only one note)
 * - Detects similar domains that could be consolidated
 * - Provides domain usage statistics
 */

import type Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

/**
 * Domain usage information
 */
export interface DomainUsage {
  domain: string;
  noteCount: number;
  notes: string[];
}

/**
 * Domain similarity suggestion
 */
export interface DomainSimilarity {
  domain1: string;
  domain2: string;
  similarity: number;
  suggestion: string;
}

/**
 * Domain analysis result
 */
export interface DomainAnalysisResult {
  totalDomains: number;
  totalNotes: number;
  orphanedDomains: DomainUsage[];
  similarDomains: DomainSimilarity[];
  topDomains: DomainUsage[];
  domainUsage: Map<string, DomainUsage>;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function similarityRatio(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

/**
 * Parse a stored domain value into an array of normalized domain strings
 */
function parseDomainValue(domainStr: string): string[] {
  let domains: string[];
  try {
    if (domainStr.startsWith('[')) {
      domains = JSON.parse(domainStr);
    } else {
      domains = domainStr.split(',').map((d) => d.trim());
    }
  } catch {
    domains = [domainStr];
  }
  return domains
    .map((d) => d.toLowerCase().trim())
    .filter((d) => d.length > 0);
}

/**
 * Build domain usage map from note rows
 */
function buildDomainUsageMap(
  notes: Array<{ path: string; domain: string }>
): Map<string, DomainUsage> {
  const domainUsage = new Map<string, DomainUsage>();

  for (const note of notes) {
    for (const domain of parseDomainValue(note.domain)) {
      let usage = domainUsage.get(domain);
      if (!usage) {
        usage = { domain, noteCount: 0, notes: [] };
        domainUsage.set(domain, usage);
      }
      usage.noteCount++;
      usage.notes.push(note.path);
    }
  }

  return domainUsage;
}

/**
 * Find domain pairs with high similarity
 */
function findSimilarDomainPairs(
  domainUsage: Map<string, DomainUsage>,
  threshold = 0.8
): DomainSimilarity[] {
  const pairs: DomainSimilarity[] = [];
  const domainList = Array.from(domainUsage.keys());

  for (let i = 0; i < domainList.length; i++) {
    for (let j = i + 1; j < domainList.length; j++) {
      const d1 = domainList[i]!;
      const d2 = domainList[j]!;
      if (d1 === d2) continue;

      const similarity = similarityRatio(d1, d2);
      if (similarity < threshold) continue;

      const count1 = domainUsage.get(d1)?.noteCount ?? 0;
      const count2 = domainUsage.get(d2)?.noteCount ?? 0;
      const preferred = count1 >= count2 ? d1 : d2;
      const deprecated = count1 >= count2 ? d2 : d1;

      pairs.push({
        domain1: d1,
        domain2: d2,
        similarity,
        suggestion: `Consider consolidating '${deprecated}' into '${preferred}' (${Math.round(similarity * 100)}% similar)`,
      });
    }
  }

  return pairs.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Analyze domains across the vault
 */
export function analyzeDomains(db: Database.Database): DomainAnalysisResult {
  const notes = db
    .prepare('SELECT path, domain FROM notes WHERE domain IS NOT NULL AND domain != \'\'')
    .all() as Array<{ path: string; domain: string }>;

  const domainUsage = buildDomainUsageMap(notes);

  const orphanedDomains = Array.from(domainUsage.values())
    .filter((usage) => usage.noteCount === 1);

  const similarDomains = findSimilarDomainPairs(domainUsage);

  const topDomains = Array.from(domainUsage.values())
    .sort((a, b) => b.noteCount - a.noteCount)
    .slice(0, 20);

  logger.debug(
    `Domain analysis: ${domainUsage.size} domains, ${orphanedDomains.length} orphaned, ${similarDomains.length} similar pairs`
  );

  return {
    totalDomains: domainUsage.size,
    totalNotes: notes.length,
    orphanedDomains,
    similarDomains,
    topDomains,
    domainUsage,
  };
}

/**
 * Find notes that could be consolidated into existing domains
 */
export function suggestDomainConsolidation(
  analysis: DomainAnalysisResult,
  threshold = 0.75
): Array<{
  orphanedDomain: string;
  suggestedDomain: string;
  similarity: number;
  notePath: string;
}> {
  const suggestions: Array<{
    orphanedDomain: string;
    suggestedDomain: string;
    similarity: number;
    notePath: string;
  }> = [];

  // For each orphaned domain, find similar non-orphaned domains
  for (const orphan of analysis.orphanedDomains) {
    for (const [domain, usage] of analysis.domainUsage.entries()) {
      // Skip orphaned domains as suggestions
      if (usage.noteCount <= 1) continue;
      if (domain === orphan.domain) continue;

      const similarity = similarityRatio(orphan.domain, domain);
      if (similarity >= threshold) {
        suggestions.push({
          orphanedDomain: orphan.domain,
          suggestedDomain: domain,
          similarity,
          notePath: orphan.notes[0] ?? '',
        });
      }
    }
  }

  // Sort by similarity
  suggestions.sort((a, b) => b.similarity - a.similarity);

  return suggestions;
}

/**
 * Get domain statistics
 */
export function getDomainStats(analysis: DomainAnalysisResult): {
  totalDomains: number;
  totalNotes: number;
  orphanedCount: number;
  orphanedPercent: number;
  averageNotesPerDomain: number;
  maxNotesPerDomain: number;
  topDomain: string | null;
} {
  const maxUsage = analysis.topDomains[0];

  return {
    totalDomains: analysis.totalDomains,
    totalNotes: analysis.totalNotes,
    orphanedCount: analysis.orphanedDomains.length,
    orphanedPercent:
      analysis.totalDomains > 0
        ? (analysis.orphanedDomains.length / analysis.totalDomains) * 100
        : 0,
    averageNotesPerDomain:
      analysis.totalDomains > 0
        ? analysis.totalNotes / analysis.totalDomains
        : 0,
    maxNotesPerDomain: maxUsage?.noteCount ?? 0,
    topDomain: maxUsage?.domain ?? null,
  };
}
