/**
 * palace_check - Check for existing knowledge before creating new
 *
 * Part of the "check-before-store" pattern. AI should call this before
 * creating new notes to avoid duplicates and enable stub expansion.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type {
  PalaceCheckOutput,
  CheckMatch,
  CheckSuggestions,
  CheckRecommendation,
  IntentKnowledgeType,
} from '../types/intent.js';
import { palaceCheckInputSchema } from '../types/intent.js';
import { searchNotesInVault, queryNotesInVault } from '../services/index/query.js';
import { getIndexManager } from '../services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';
import { slugify } from '../utils/slugify.js';

// Tool definition
export const checkTool: Tool = {
  name: 'palace_check',
  description:
    'Check for existing knowledge before creating new notes. Returns matches, stub candidates, and a recommendation (create_new, expand_stub, improve_existing, reference_existing). Always call this before palace_store to avoid duplicates.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query - the topic or title you want to check for',
      },
      knowledge_type: {
        type: 'string',
        enum: [
          'technology',
          'command',
          'reference',
          'standard',
          'pattern',
          'research',
          'decision',
          'configuration',
          'troubleshooting',
          'note',
        ],
        description: 'Optional: filter by knowledge type',
      },
      domain: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: filter by domain (e.g., ["kubernetes", "networking"])',
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
export async function checkHandler(args: Record<string, unknown>): Promise<ToolResult<PalaceCheckOutput>> {
  // Validate input
  const parseResult = palaceCheckInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { query, knowledge_type, domain, include_stubs = true, vault: vaultParam } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Perform full-text search
    const searchOptions: { query: string; type?: string; tags?: string[]; limit: number } = {
      query,
      limit: 20,
    };
    if (knowledge_type) {
      searchOptions.type = mapKnowledgeType(knowledge_type);
    }
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
      const status = fm.status === 'stub' ? 'stub' as const : 'active' as const;
      if (!include_stubs && status === 'stub') continue;

      allResults.set(result.note.path, {
        path: result.note.path,
        vault: vault.alias,
        title: result.note.title,
        status,
        confidence: result.note.frontmatter.confidence ?? 0.5,
        relevance: result.score,
        summary: extractSummary(fm),
        last_modified: result.note.frontmatter.modified,
      });
    }

    for (const note of titleResults) {
      if (!allResults.has(note.path)) {
        const fm = note.frontmatter as unknown as Record<string, unknown>;
        const status = fm.status === 'stub' ? 'stub' as const : 'active' as const;
        if (!include_stubs && status === 'stub') continue;

        // Calculate title relevance score
        const titleScore = calculateTitleRelevance(query, note.title);

        allResults.set(note.path, {
          path: note.path,
          vault: vault.alias,
          title: note.title,
          status,
          confidence: note.frontmatter.confidence ?? 0.5,
          relevance: titleScore,
          summary: extractSummary(fm),
          last_modified: note.frontmatter.modified,
        });
      }
    }

    // Sort by relevance
    const matches = [...allResults.values()].sort((a, b) => b.relevance - a.relevance);

    // Get all note titles for missing technology detection
    const allNotes = queryNotesInVault(db, { limit: 1000 });
    const allTitles = allNotes.map((n) => n.title);

    // Build suggestions
    const suggestions = buildSuggestions(query, matches, allTitles);

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
 * Extract summary from frontmatter
 */
function extractSummary(frontmatter: Record<string, unknown>): string {
  const type = frontmatter.type as string;
  const tags = frontmatter.tags as string[] | undefined;
  const confidence = frontmatter.confidence as number | undefined;

  const parts = [type];
  if (tags && tags.length > 0) {
    parts.push(`tags: ${tags.slice(0, 3).join(', ')}`);
  }
  if (confidence !== undefined) {
    parts.push(`confidence: ${Math.round(confidence * 100)}%`);
  }

  return parts.join(' | ');
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

  return overlap / maxWords * 0.7;
}

/**
 * Build suggestions based on matches
 */
function buildSuggestions(query: string, matches: CheckMatch[], allTitles: string[]): CheckSuggestions {
  const stubs = matches.filter((m) => m.status === 'stub');
  const similarTitles = matches
    .filter((m) => m.relevance >= 0.7)
    .map((m) => m.title)
    .slice(0, 5);

  // Find potential technology terms in query that don't have notes
  const missingTechnologies = findMissingTechnologies(query, allTitles);

  return {
    should_expand_stub: stubs.length > 0 && stubs[0]!.relevance >= 0.8,
    stub_path: stubs.length > 0 ? stubs[0]!.path : undefined,
    missing_technologies: missingTechnologies,
    similar_titles: similarTitles,
  };
}

/**
 * Extract potential technology terms from query and find ones without notes
 */
function findMissingTechnologies(query: string, existingTitles: string[]): string[] {
  // Common technology-related words to look for
  const techPatterns = [
    /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g, // CamelCase (e.g., TypeScript, JavaScript)
    /\b([a-z]+(?:-[a-z]+)+)\b/g, // kebab-case (e.g., docker-compose)
    /\b([a-z]+(?:_[a-z]+)+)\b/g, // snake_case (e.g., some_tool)
  ];

  // Known technology terms to check (multi-word won't match patterns above)
  const knownTechWords = new Set([
    'docker', 'kubernetes', 'k8s', 'nginx', 'redis', 'postgres', 'postgresql',
    'mongodb', 'mysql', 'sqlite', 'graphql', 'rest', 'api', 'grpc',
    'react', 'vue', 'angular', 'svelte', 'node', 'nodejs', 'deno', 'bun',
    'python', 'rust', 'golang', 'java', 'typescript', 'javascript',
    'aws', 'azure', 'gcp', 'terraform', 'ansible', 'helm', 'istio',
    'git', 'github', 'gitlab', 'jenkins', 'circleci', 'travis',
    'linux', 'ubuntu', 'debian', 'centos', 'alpine', 'bash', 'zsh',
    'vim', 'neovim', 'vscode', 'emacs', 'obsidian',
  ]);

  const candidates = new Set<string>();

  // Extract CamelCase, kebab-case, snake_case terms
  for (const pattern of techPatterns) {
    const matches = query.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length >= 3) {
        candidates.add(match[1].toLowerCase());
      }
    }
  }

  // Check for known tech words
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9-_]/g, '');
    if (knownTechWords.has(cleanWord)) {
      candidates.add(cleanWord);
    }
  }

  // Filter out terms that already have notes
  const existingLower = new Set(existingTitles.map(t => t.toLowerCase()));
  const existingSlugs = new Set(existingTitles.map(t => slugify(t)));

  const missing: string[] = [];
  for (const term of candidates) {
    const termSlug = slugify(term);
    // Check if a note exists with this title or slug
    const exists = existingLower.has(term) ||
                   existingSlugs.has(termSlug) ||
                   existingTitles.some(t =>
                     t.toLowerCase().includes(term) ||
                     slugify(t).includes(termSlug)
                   );
    if (!exists) {
      missing.push(term);
    }
  }

  return missing.slice(0, 5); // Limit to 5 suggestions
}

/**
 * Determine the recommendation based on matches
 */
function determineRecommendation(
  query: string,
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

/**
 * Map intent knowledge types to existing types for query
 */
function mapKnowledgeType(intentType: IntentKnowledgeType): string {
  const typeMap: Record<string, string> = {
    technology: 'research',
    command: 'command',
    reference: 'research',
    standard: 'pattern',
    pattern: 'pattern',
    research: 'research',
    decision: 'project',
    configuration: 'infrastructure',
    troubleshooting: 'troubleshooting',
    note: 'research',
  };
  return typeMap[intentType] ?? 'research';
}
