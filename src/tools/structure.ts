/**
 * palace_structure - Get the palace directory tree structure (Phase 017)
 *
 * Returns vault structure with domain pattern analysis for AI decision-making.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, DirectoryEntry } from '../types/index.js';
import { getDirectoryTree } from '../services/vault/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

// Special folders that are not knowledge domains
const SPECIAL_FOLDERS = ['sources', 'projects', 'clients', 'daily', 'standards', '.palace', '.obsidian'];

// Input schema
const inputSchema = z.object({
  depth: z.number().min(1).max(10).optional().default(3),
  path: z.string().optional().default(''),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const structureTool: Tool = {
  name: 'palace_structure',
  description:
    'Get the palace directory tree structure with domain pattern analysis. Essential for understanding vault organization before storing knowledge.',
  inputSchema: {
    type: 'object',
    properties: {
      depth: {
        type: 'number',
        description: 'Maximum depth to traverse (default: 3, max: 10)',
      },
      path: {
        type: 'string',
        description: 'Start from this subdirectory',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to show structure of (defaults to default vault)',
      },
    },
  },
};

/**
 * Domain pattern information
 */
interface DomainPattern {
  path: string;
  level: number;
  noteCount: number;
  hasHub: boolean;
  subdomains: string[];
}

/**
 * Extract domain patterns from directory tree
 */
function extractDomainPatterns(entries: DirectoryEntry[], parentPath = ''): DomainPattern[] {
  const patterns: DomainPattern[] = [];

  for (const entry of entries) {
    if (entry.type !== 'directory') continue;

    const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const isSpecial = SPECIAL_FOLDERS.includes(entry.name.toLowerCase());

    // Skip special folders for domain analysis
    if (isSpecial) continue;

    // Count notes in this directory
    const noteCount = entry.children?.filter((c) => c.type === 'file' && c.name.endsWith('.md')).length || 0;

    // Phase 018: Hub detection now based on frontmatter type, not filename
    // For structure view, we can't easily determine hub status without reading files
    const hasHub = false; // Deprecated - check frontmatter type instead

    // Get subdomain names
    const subdomains =
      entry.children?.filter((c) => c.type === 'directory' && !SPECIAL_FOLDERS.includes(c.name.toLowerCase())).map((c) => c.name) || [];

    // Calculate level (depth from root)
    const level = currentPath.split('/').length;

    patterns.push({
      path: currentPath,
      level,
      noteCount,
      hasHub,
      subdomains,
    });

    // Recursively process children
    if (entry.children) {
      const childPatterns = extractDomainPatterns(entry.children, currentPath);
      patterns.push(...childPatterns);
    }
  }

  return patterns;
}

/**
 * Get top-level domain summary
 */
function getTopLevelDomains(patterns: DomainPattern[]): Array<{ name: string; totalNotes: number; depth: number }> {
  const topLevel = patterns.filter((p) => p.level === 1);

  return topLevel.map((domain) => {
    // Count all notes in this domain and subdomains
    const domainPrefix = domain.path + '/';
    const relatedPatterns = patterns.filter((p) => p.path === domain.path || p.path.startsWith(domainPrefix));
    const totalNotes = relatedPatterns.reduce((sum, p) => sum + p.noteCount, 0);
    const maxDepth = Math.max(...relatedPatterns.map((p) => p.level));

    return {
      name: domain.path,
      totalNotes,
      depth: maxDepth,
    };
  });
}

/**
 * Format directory tree as readable text
 */
function formatTree(entries: DirectoryEntry[], prefix = ''): string {
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const icon = entry.type === 'directory' ? '📁 ' : '📄 ';

    lines.push(`${prefix}${connector}${icon}${entry.name}`);

    if (entry.children && entry.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(formatTree(entry.children, childPrefix));
    }
  }

  return lines.join('\n');
}

/**
 * Count files and directories
 */
function countEntries(entries: DirectoryEntry[]): { files: number; dirs: number } {
  let files = 0;
  let dirs = 0;

  for (const entry of entries) {
    if (entry.type === 'directory') {
      dirs++;
      if (entry.children) {
        const childCounts = countEntries(entry.children);
        files += childCounts.files;
        dirs += childCounts.dirs;
      }
    } else {
      files++;
    }
  }

  return { files, dirs };
}

/**
 * Check which special folders exist
 */
function getSpecialFolders(entries: DirectoryEntry[]): Record<string, boolean> {
  const specialFolderNames = ['sources', 'projects', 'clients', 'daily', 'standards'];
  const existing: Record<string, boolean> = {};

  for (const name of specialFolderNames) {
    existing[name] = entries.some((e) => e.type === 'directory' && e.name.toLowerCase() === name);
  }

  return existing;
}

// Tool handler
export async function structureHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const input = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(input.vault);

    const tree = await getDirectoryTree(input.path, input.depth, {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    });
    const counts = countEntries(tree);
    const formatted = formatTree(tree);

    // Extract domain patterns (Phase 017)
    const domainPatterns = extractDomainPatterns(tree);
    const topLevelDomains = getTopLevelDomains(domainPatterns);
    const specialFolders = getSpecialFolders(tree);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        path: input.path || '/',
        depth: input.depth,
        stats: {
          files: counts.files,
          directories: counts.dirs,
        },
        tree: formatted,
        entries: tree, // Raw structure for programmatic use

        // Phase 017: Domain pattern analysis
        domain_patterns: {
          top_level_domains: topLevelDomains,
          all_domains: domainPatterns.map((p) => ({
            path: p.path,
            level: p.level,
            note_count: p.noteCount,
            has_hub: p.hasHub,
            subdomains: p.subdomains,
          })),
          special_folders: specialFolders,
          suggestions: {
            existing_domains: topLevelDomains.map((d) => d.name),
            hint: 'Use existing domains when possible. Create new top-level domains only for truly distinct topics.',
          },
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'STRUCTURE_ERROR',
    };
  }
}
