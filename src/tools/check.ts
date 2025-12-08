/**
 * palace_check - Check for existing knowledge and discover domains (Phase 017)
 *
 * Part of the "check-before-store" pattern. AI should call this before
 * creating new notes to avoid duplicates, discover domain suggestions,
 * and enable stub expansion.
 *
 * Key features:
 * - Find existing knowledge matching query
 * - Suggest domains based on vault structure
 * - Recommend action: create_new, expand_stub, improve_existing, reference_existing
 */

import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type {
  PalaceCheckOutput,
  CheckMatch,
  CheckSuggestions,
  CheckRecommendation,
  DomainSuggestion,
} from '../types/intent.js';
import { palaceCheckInputSchema } from '../types/intent.js';
import {
  searchNotesInVault,
  queryNotesInVault,
} from '../services/index/query.js';
import { getIndexManager } from '../services/index/index.js';
import {
  resolveVaultParam,
  getVaultResultInfo,
} from '../utils/vault-param.js';
import { slugify } from '../utils/slugify.js';
import {
  extractDomainFromPath,
  isSpecialFolder,
} from '../services/vault/resolver.js';

// Tool definition with new domain discovery
export const checkTool: Tool = {
  name: 'palace_check',
  description: `Check for existing knowledge before creating new notes. Returns matches, domain suggestions, and a recommendation.

**ALWAYS call before palace_store** to:
1. Find existing knowledge on the topic
2. Get domain suggestions based on vault structure
3. Determine best action (create_new, expand_stub, improve_existing, reference_existing)

**Domain suggestions** help you choose the right path for new knowledge based on existing vault organization.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query - the topic or title you want to check for',
      },
      domain: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: filter by domain (e.g., ["networking", "wireless"])',
      },
      include_stubs: {
        type: 'boolean',
        description: 'Include stub notes in results (default: true)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias to search in (defaults to default vault)',
      },
    },
    required: ['query'],
  },
};

// Tool handler
export async function checkHandler(
  args: Record<string, unknown>
): Promise<ToolResult<PalaceCheckOutput>> {
  // Validate input
  const parseResult = palaceCheckInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const {
    query,
    domain,
    include_stubs = true,
    vault: vaultParam,
  } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Perform full-text search
    const searchOptions: {
      query: string;
      tags?: string[];
      limit: number;
    } = {
      query,
      limit: 20,
    };
    if (domain && domain.length > 0) {
      searchOptions.tags = domain;
    }
    const searchResults = searchNotesInVault(db, searchOptions);

    // Also search by title similarity
    const titleSlug = slugify(query);
    const filterOptions: { tags?: string[]; limit: number } = { limit: 20 };
    if (domain && domain.length > 0) {
      filterOptions.tags = domain;
    }
    const titleResults = queryNotesInVault(db, filterOptions).filter((note) => {
      const noteSlug = slugify(note.title);
      return (
        noteSlug.includes(titleSlug) ||
        titleSlug.includes(noteSlug) ||
        note.title.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(note.title.toLowerCase())
      );
    });

    // Combine and deduplicate results
    const allResults = new Map<string, CheckMatch>();

    for (const result of searchResults) {
      const fm = result.note.frontmatter as unknown as Record<string, unknown>;
      const status =
        fm.status === 'stub' ? ('stub' as const) : ('active' as const);
      if (!include_stubs && status === 'stub') continue;

      // Extract domain from path
      const noteDomain = extractDomainFromPath(result.note.path);

      allResults.set(result.note.path, {
        path: result.note.path,
        vault: vault.alias,
        title: result.note.title,
        status,
        confidence: result.note.frontmatter.confidence ?? 0.5,
        relevance: result.score,
        summary: extractSummary(fm),
        last_modified: result.note.frontmatter.modified,
        domain: noteDomain.length > 0 ? noteDomain : undefined,
      });
    }

    for (const note of titleResults) {
      if (!allResults.has(note.path)) {
        const fm = note.frontmatter as unknown as Record<string, unknown>;
        const status =
          fm.status === 'stub' ? ('stub' as const) : ('active' as const);
        if (!include_stubs && status === 'stub') continue;

        // Calculate title relevance score
        const titleScore = calculateTitleRelevance(query, note.title);

        // Extract domain from path
        const noteDomain = extractDomainFromPath(note.path);

        allResults.set(note.path, {
          path: note.path,
          vault: vault.alias,
          title: note.title,
          status,
          confidence: note.frontmatter.confidence ?? 0.5,
          relevance: titleScore,
          summary: extractSummary(fm),
          last_modified: note.frontmatter.modified,
          domain: noteDomain.length > 0 ? noteDomain : undefined,
        });
      }
    }

    // Sort by relevance
    const matches = [...allResults.values()].sort(
      (a, b) => b.relevance - a.relevance
    );

    // Get all note titles for suggestions
    const allNotes = queryNotesInVault(db, { limit: 1000 });
    const allTitles = allNotes.map((n) => n.title);

    // Discover domains in the vault
    const discoveredDomains = discoverDomains(vault.path);

    // Build suggestions with domain discovery
    const suggestions = buildSuggestions(
      query,
      matches,
      allTitles,
      discoveredDomains
    );

    // Determine recommendation
    const recommendation = determineRecommendation(query, matches, suggestions);

    const vaultInfo = getVaultResultInfo(vault);
    return {
      success: true,
      data: {
        found: matches.length > 0,
        vault: vaultInfo.vault,
        vaultPath: vaultInfo.vault_path,
        matches: matches.slice(0, 10), // Return top 10
        suggestions,
        recommendation,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'CHECK_ERROR',
    };
  }
}

/**
 * Discover existing domains in the vault by scanning directories
 */
function discoverDomains(
  vaultPath: string
): Map<string, { noteCount: number; level: number }> {
  const domains = new Map<string, { noteCount: number; level: number }>();

  function scanDirectory(
    dirPath: string,
    relativePath: string,
    level: number
  ): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      let noteCount = 0;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip special folders and hidden directories
          if (
            entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            isSpecialFolder(entry.name)
          ) {
            continue;
          }

          const childRelPath = relativePath
            ? `${relativePath}/${entry.name}`
            : entry.name;

          // Recursively scan subdirectories
          scanDirectory(join(dirPath, entry.name), childRelPath, level + 1);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          noteCount++;
        }
      }

      // Only add as domain if it has notes or is explicitly a topic folder
      if (noteCount > 0 && relativePath) {
        domains.set(relativePath, { noteCount, level });
      }
    } catch {
      // Directory not accessible, skip
    }
  }

  scanDirectory(vaultPath, '', 0);

  return domains;
}

/**
 * Extract summary from frontmatter
 */
function extractSummary(frontmatter: Record<string, unknown>): string {
  const captureType = frontmatter.capture_type as string | undefined;
  const domain = frontmatter.domain as string[] | undefined;
  const tags = frontmatter.tags as string[] | undefined;
  const confidence = frontmatter.confidence as number | undefined;

  const parts: string[] = [];

  if (captureType) {
    parts.push(captureType);
  }

  if (domain && domain.length > 0) {
    parts.push(`domain: ${domain.join('/')}`);
  } else if (tags && tags.length > 0) {
    parts.push(`tags: ${tags.slice(0, 3).join(', ')}`);
  }

  if (confidence !== undefined) {
    parts.push(`confidence: ${Math.round(confidence * 100)}%`);
  }

  return parts.join(' | ') || 'No metadata';
}

/**
 * Calculate title relevance score
 */
function calculateTitleRelevance(query: string, title: string): number {
  const queryLower = query.toLowerCase();
  const titleLower = title.toLowerCase();

  // Exact match
  if (queryLower === titleLower) return 1.0;

  // Title contains query
  if (titleLower.includes(queryLower)) return 0.9;

  // Query contains title
  if (queryLower.includes(titleLower)) return 0.85;

  // Slug match
  const querySlug = slugify(query);
  const titleSlug = slugify(title);

  if (querySlug === titleSlug) return 0.95;
  if (titleSlug.includes(querySlug)) return 0.8;
  if (querySlug.includes(titleSlug)) return 0.75;

  // Word overlap
  const queryWords = new Set(queryLower.split(/\s+/));
  const titleWords = new Set(titleLower.split(/\s+/));
  const overlap = [...queryWords].filter((w) => titleWords.has(w)).length;
  const maxWords = Math.max(queryWords.size, titleWords.size);

  return (overlap / maxWords) * 0.7;
}

/**
 * Build suggestions based on matches and discovered domains
 */
function buildSuggestions(
  query: string,
  matches: CheckMatch[],
  allTitles: string[],
  discoveredDomains: Map<string, { noteCount: number; level: number }>
): CheckSuggestions {
  const stubs = matches.filter((m) => m.status === 'stub');
  const similarTitles = matches
    .filter((m) => m.relevance >= 0.7)
    .map((m) => m.title)
    .slice(0, 5);

  // Generate domain suggestions
  const suggestedDomains = generateDomainSuggestions(
    query,
    matches,
    discoveredDomains
  );

  return {
    should_expand_stub: stubs.length > 0 && stubs[0]!.relevance >= 0.8,
    stub_path: stubs.length > 0 ? stubs[0]!.path : undefined,
    similar_titles: similarTitles,
    suggested_domains: suggestedDomains,
  };
}

/**
 * Generate domain suggestions based on query and existing vault structure
 */
function generateDomainSuggestions(
  query: string,
  matches: CheckMatch[],
  discoveredDomains: Map<string, { noteCount: number; level: number }>
): DomainSuggestion[] {
  const suggestions: DomainSuggestion[] = [];
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const querySlug = slugify(query);

  // 1. Look for domains that match query words
  for (const [domainPath, info] of discoveredDomains) {
    const domainParts = domainPath.toLowerCase().split('/');
    const lastPart = domainParts[domainParts.length - 1] || '';

    // Check if any query word matches a domain part
    for (const word of queryWords) {
      if (
        lastPart.includes(word) ||
        word.includes(lastPart) ||
        slugify(word) === slugify(lastPart)
      ) {
        suggestions.push({
          path: domainPath.split('/'),
          confidence: 0.8,
          reason: `Matches existing domain "${domainPath}" (${info.noteCount} notes)`,
          exists: true,
          note_count: info.noteCount,
        });
        break;
      }
    }
  }

  // 2. Look at domains of matching notes
  for (const match of matches.slice(0, 5)) {
    if (match.domain && match.domain.length > 0) {
      const domainKey = match.domain.join('/');
      // Don't add if we already have this domain
      if (!suggestions.some((s) => s.path.join('/') === domainKey)) {
        suggestions.push({
          path: match.domain,
          confidence: match.relevance * 0.9,
          reason: `Similar note "${match.title}" is in this domain`,
          exists: true,
          note_count:
            discoveredDomains.get(domainKey)?.noteCount || undefined,
        });
      }
    }
  }

  // 3. Suggest new domain based on query words if no good matches
  if (suggestions.length === 0 || suggestions[0]!.confidence < 0.5) {
    // Create a suggested domain from query words
    const suggestedPath = queryWords
      .filter((w) => w.length > 2)
      .slice(0, 3)
      .map(slugify);

    if (suggestedPath.length > 0) {
      suggestions.push({
        path: suggestedPath,
        confidence: 0.5,
        reason: 'Suggested based on query keywords',
        exists: false,
      });
    }
  }

  // Sort by confidence and deduplicate
  const seen = new Set<string>();
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .filter((s) => {
      const key = s.path.join('/');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

/**
 * Determine the recommendation based on matches
 */
function determineRecommendation(
  _query: string,
  matches: CheckMatch[],
  suggestions: CheckSuggestions
): CheckRecommendation {
  // No matches - create new
  if (matches.length === 0) {
    return 'create_new';
  }

  // High-relevance stub found - expand it
  if (suggestions.should_expand_stub && suggestions.stub_path) {
    return 'expand_stub';
  }

  const topMatch = matches[0]!;

  // Very high relevance active note - just reference it
  if (topMatch.status === 'active' && topMatch.relevance >= 0.95) {
    return 'reference_existing';
  }

  // High relevance active note - consider improving it
  if (topMatch.status === 'active' && topMatch.relevance >= 0.7) {
    return 'improve_existing';
  }

  // Lower relevance stub - might be related but not exact
  if (topMatch.status === 'stub' && topMatch.relevance >= 0.5) {
    return 'expand_stub';
  }

  // Default - create new but be aware of similar content
  return 'create_new';
}
