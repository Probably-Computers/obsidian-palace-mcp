/**
 * palace_stubs - List and manage stub notes
 *
 * Lists all stub notes in a vault, showing which notes mentioned them
 * and allowing prioritization of stub expansion.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, NoteMetadata } from '../types/index.js';
import { findStubs } from '../services/vault/stub-manager.js';
import { getIndexManager } from '../services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';
import { z } from 'zod';

// Tool definition
export const stubsTool: Tool = {
  name: 'palace_stubs',
  description: `List all stub notes (placeholders) in a vault that need expansion.

**Use this tool to:**
1. Find stubs that need content
2. Prioritize which stubs to expand first
3. See which notes mention each stub

**Stubs are created automatically** when content contains [[wiki-links]] to non-existent notes.`,
  inputSchema: {
    type: 'object',
    properties: {
      path_filter: {
        type: 'string',
        description: 'Filter stubs by path prefix (e.g., "infrastructure")',
      },
      sort_by: {
        type: 'string',
        enum: ['created', 'mentions', 'title'],
        description: 'Sort order: created (newest first), mentions (most mentioned first), title (alphabetical)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of stubs to return (default: 50)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
      },
    },
  },
};

// Input schema
const stubsInputSchema = z.object({
  path_filter: z.string().optional(),
  sort_by: z.enum(['created', 'mentions', 'title']).optional().default('created'),
  limit: z.number().min(1).max(200).optional().default(50),
  vault: z.string().optional(),
});

// Output types
interface StubInfo {
  path: string;
  title: string;
  domain: string[];
  created: string;
  mentioned_in: string[];
  mention_count: number;
  stub_context?: string | undefined;
}

interface PalaceStubsOutput {
  vault: string;
  vaultPath: string;
  stub_count: number;
  stubs: StubInfo[];
  summary: {
    total_stubs: number;
    oldest_stub?: string | undefined;
    most_mentioned?: string | undefined;
    domains_with_stubs: string[];
  };
}

// Tool handler
export async function stubsHandler(
  args: Record<string, unknown>
): Promise<ToolResult<PalaceStubsOutput>> {
  // Validate input
  const parseResult = stubsInputSchema.safeParse(args);
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
    path_filter,
    sort_by = 'created',
    limit = 50,
    vault: vaultParam,
  } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Find all stubs
    const rawStubs = findStubs(db, { limit: 200 }); // Get more than limit to allow filtering

    // Transform and filter stubs
    let stubs: StubInfo[] = rawStubs
      .map((stub: NoteMetadata) => {
        const fm = stub.frontmatter as unknown as Record<string, unknown>;
        const domain = extractDomainFromPath(stub.path);
        const mentionedIn = (fm.mentioned_in as string[]) || [];

        return {
          path: stub.path,
          title: stub.title,
          domain,
          created: stub.frontmatter.created,
          mentioned_in: mentionedIn,
          mention_count: mentionedIn.length,
          stub_context: fm.stub_context as string | undefined,
        };
      });

    // Apply path filter
    if (path_filter) {
      const filterLower = path_filter.toLowerCase();
      stubs = stubs.filter((stub) => {
        const pathLower = stub.path.toLowerCase();
        return (
          pathLower.startsWith(filterLower) ||
          pathLower.startsWith(filterLower + '/') ||
          pathLower.includes('/' + filterLower + '/') ||
          pathLower.includes('/' + filterLower)
        );
      });
    }

    // Sort stubs
    switch (sort_by) {
      case 'mentions':
        stubs.sort((a, b) => b.mention_count - a.mention_count);
        break;
      case 'title':
        stubs.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'created':
      default:
        stubs.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        break;
    }

    // Apply limit
    const limitedStubs = stubs.slice(0, limit);

    // Build summary
    const allDomains = new Set<string>();
    for (const stub of stubs) {
      const firstDomain = stub.domain[0];
      if (firstDomain) {
        allDomains.add(firstDomain);
      }
    }

    const sortedByMentions = [...stubs].sort((a, b) => b.mention_count - a.mention_count);
    const sortedByAge = [...stubs].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );

    const topMentioned = sortedByMentions[0];
    const oldestStub = sortedByAge[0];

    const summary: PalaceStubsOutput['summary'] = {
      total_stubs: stubs.length,
      domains_with_stubs: [...allDomains].sort(),
    };
    if (oldestStub) {
      summary.oldest_stub = oldestStub.path;
    }
    if (topMentioned && topMentioned.mention_count > 0) {
      summary.most_mentioned = topMentioned.path;
    }

    const vaultInfo = getVaultResultInfo(vault);
    return {
      success: true,
      data: {
        vault: vaultInfo.vault,
        vaultPath: vaultInfo.vault_path,
        stub_count: limitedStubs.length,
        stubs: limitedStubs,
        summary,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'STUBS_ERROR',
    };
  }
}

/**
 * Extract domain from path
 */
function extractDomainFromPath(path: string): string[] {
  const parts = path.split('/');
  // Remove filename
  parts.pop();
  return parts;
}
