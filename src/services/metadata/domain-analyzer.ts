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
 * Analyze domains across the vault
 */
export function analyzeDomains(db: Database.Database): DomainAnalysisResult {
  // Get all notes with domain data
  const notes = db
    .prepare(
      `
    SELECT path, domain
    FROM notes
    WHERE domain IS NOT NULL AND domain != ''
  `
    )
    .all() as Array<{ path: string; domain: string }>;

  // Build domain usage map
  const domainUsage = new Map<string, DomainUsage>();

  for (const note of notes) {
    // Parse domain (stored as comma-separated or JSON array)
    let domains: string[] = [];
    try {
      // Try JSON parse first
      if (note.domain.startsWith('[')) {
        domains = JSON.parse(note.domain);
      } else {
        // Comma-separated
        domains = note.domain.split(',').map((d) => d.trim());
      }
    } catch {
      // Fallback to single domain
      domains = [note.domain];
    }

    for (const domain of domains) {
      const normalizedDomain = domain.toLowerCase().trim();
      if (!normalizedDomain) continue;

      let usage = domainUsage.get(normalizedDomain);
      if (!usage) {
        usage = {
          domain: normalizedDomain,
          noteCount: 0,
          notes: [],
        };
        domainUsage.set(normalizedDomain, usage);
      }
      usage.noteCount++;
      usage.notes.push(note.path);
    }
  }

  // Find orphaned domains (only 1 note)
  const orphanedDomains: DomainUsage[] = [];
  for (const usage of domainUsage.values()) {
    if (usage.noteCount === 1) {
      orphanedDomains.push(usage);
    }
  }

  // Find similar domains
  const similarDomains: DomainSimilarity[] = [];
  const domainList = Array.from(domainUsage.keys());

  for (let i = 0; i < domainList.length; i++) {
    for (let j = i + 1; j < domainList.length; j++) {
      const d1 = domainList[i]!;
      const d2 = domainList[j]!;

      // Skip if same domain
      if (d1 === d2) continue;

      const similarity = similarityRatio(d1, d2);

      // Only suggest if highly similar (>= 0.8)
      if (similarity >= 0.8) {
        // Prefer the one with more notes
        const count1 = domainUsage.get(d1)?.noteCount ?? 0;
        const count2 = domainUsage.get(d2)?.noteCount ?? 0;
        const preferred = count1 >= count2 ? d1 : d2;
        const deprecated = count1 >= count2 ? d2 : d1;

        similarDomains.push({
          domain1: d1,
          domain2: d2,
          similarity,
          suggestion: `Consider consolidating '${deprecated}' into '${preferred}' (${Math.round(similarity * 100)}% similar)`,
        });
      }
    }
  }

  // Sort similar domains by similarity
  similarDomains.sort((a, b) => b.similarity - a.similarity);

  // Get top domains by usage
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
