/**
 * palace_store - Topic-Based Knowledge Storage (Phase 017)
 *
 * AI expresses WHAT to store with domain/topic hierarchy.
 * The domain directly becomes the folder path - no type-to-folder mapping.
 *
 * Key principles:
 * - Only 3 capture types: source, knowledge, project
 * - Domain array IS the folder path
 * - AI observes vault structure and proposes paths
 * - System suggests, never dictates
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type { PalaceStoreOutput } from '../types/intent.js';
import { palaceStoreInputSchema } from '../types/intent.js';
import {
  resolveStorage,
  checkPathConflict,
  generateAlternativePath,
} from '../services/vault/resolver.js';
import {
  findStubByTitle,
  expandStub,
  createStubsForUnresolvedLinks,
} from '../services/vault/stub-manager.js';
import {
  findUnlinkedMentions,
  addRetroactiveLinks,
} from '../services/graph/retroactive.js';
import {
  buildCompleteIndex,
  scanForMatches,
  autolinkContent,
} from '../services/autolink/index.js';
import { processWikiLinks } from '../utils/markdown.js';
import { getIndexManager } from '../services/index/index.js';
import { getIndexedPaths, indexNote } from '../services/index/sync.js';
import { readNote } from '../services/vault/reader.js';
import {
  resolveVaultParam,
  enforceWriteAccess,
  getVaultResultInfo,
} from '../utils/vault-param.js';
import { stringifyFrontmatter } from '../utils/frontmatter.js';
import { logger } from '../utils/logger.js';
import {
  shouldSplit,
  splitContent,
  createHub,
  createChildNote,
} from '../services/atomic/index.js';
import {
  startOperation,
  trackFileCreated,
  trackFileModified,
} from '../services/operations/index.js';

// Tool definition with new topic-based schema
export const storeTool: Tool = {
  name: 'palace_store',
  description: `Store knowledge using topic-based resolution. Express WHAT to store with capture_type and domain.

**Capture Types:**
- 'source': Raw capture from a specific source (book, video, article) → sources/{type}/{title}/
- 'knowledge': Processed, reusable knowledge about a topic → {domain}/{subdomain}/
- 'project': Project or client specific context → projects/{project}/ or clients/{client}/

**Domain IS the path:** ['networking', 'wireless', 'lora'] → networking/wireless/lora/

**Options:** Set create_stubs: false to prevent auto-creating stub notes for [[wiki-links]]. Set auto_split: false to store as a single file without splitting. Set retroactive_link: false to skip updating existing notes with links back to this note.

**IMPORTANT:** Before storing, use palace_structure to observe the vault and palace_check to find existing knowledge.`,
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Note title',
      },
      content: {
        type: 'string',
        description: 'The knowledge to store (markdown format)',
      },
      intent: {
        type: 'object',
        description: 'Storage intent - capture type and domain classification',
        properties: {
          capture_type: {
            type: 'string',
            enum: ['source', 'knowledge', 'project'],
            description:
              "'source': from a book/video/article, 'knowledge': reusable knowledge, 'project': project-specific",
          },
          domain: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Topic hierarchy - THIS IS THE FOLDER PATH (e.g., ["gardening", "vegetables", "tomatoes"])',
          },
          source: {
            type: 'object',
            description:
              "Source information (required for capture_type='source')",
            properties: {
              type: {
                type: 'string',
                enum: [
                  'book',
                  'video',
                  'article',
                  'podcast',
                  'conversation',
                  'documentation',
                  'other',
                ],
              },
              title: { type: 'string', description: 'Source title' },
              author: { type: 'string', description: 'Author (optional)' },
              url: { type: 'string', description: 'URL (optional)' },
              date: { type: 'string', description: 'Date (optional)' },
            },
            required: ['type', 'title'],
          },
          project: {
            type: 'string',
            description:
              "Project name (required for capture_type='project' without client)",
          },
          client: {
            type: 'string',
            description:
              'Client name (optional, for client-specific projects)',
          },
          references: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit links to create to other notes',
          },
          note_type: {
            type: 'string',
            description:
              'Optional note type hint for frontmatter (not for path resolution)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization',
          },
        },
        required: ['capture_type', 'domain'],
      },
      options: {
        type: 'object',
        description: 'Storage options',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault alias to store in (defaults to default vault)',
          },
          create_stubs: {
            type: 'boolean',
            description:
              'Create stubs for unresolved [[links]] in content (default: true)',
          },
          retroactive_link: {
            type: 'boolean',
            description:
              'Update existing notes with links to this new note (default: true)',
          },
          dry_run: {
            type: 'boolean',
            description: 'Preview without saving (default: false)',
          },
          autolink: {
            type: 'boolean',
            description:
              'Automatically insert wiki-links for mentions of existing notes (default: true)',
          },
          auto_split: {
            type: 'boolean',
            description:
              'Enable auto-split when content exceeds atomic limits (default: true). Set to false to store as single file.',
          },
          force_atomic: {
            type: 'boolean',
            description:
              'DEPRECATED: Use auto_split: false instead. Skip atomic splitting (default: false)',
          },
          confirm_new_domain: {
            type: 'boolean',
            description:
              'Warn if creating a new top-level domain (default: true)',
          },
          split_thresholds: {
            type: 'object',
            description: 'Phase 022: Per-operation split threshold overrides',
            properties: {
              max_lines: { type: 'number', description: 'Override max lines limit' },
              max_sections: { type: 'number', description: 'Override max sections limit' },
              section_max_lines: { type: 'number', description: 'Override max lines per section' },
              min_section_lines: { type: 'number', description: 'Override minimum section lines' },
              max_children: { type: 'number', description: 'Override max children limit' },
            },
          },
          portable: {
            type: 'boolean',
            description:
              'Phase 026: Portable mode - store as single file with no splitting, no stubs, and wiki-links converted to plain text. Use for content meant to be shared outside the vault.',
          },
        },
      },
      source: {
        type: 'object',
        description: 'Knowledge provenance',
        properties: {
          origin: {
            type: 'string',
            description:
              'Where this knowledge came from (ai:research, ai:artifact, human, web:url)',
          },
          confidence: {
            type: 'number',
            description: 'Confidence level 0-1',
          },
        },
      },
    },
    required: ['title', 'content', 'intent'],
  },
};

// Tool handler
export async function storeHandler(
  args: Record<string, unknown>
): Promise<ToolResult<PalaceStoreOutput>> {
  // Validate input
  const parseResult = palaceStoreInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { title, content, intent, options, source } = parseResult.data;

  const vaultParam = options?.vault;
  const portable = options?.portable ?? false;
  // Phase 026: Portable mode overrides several options
  const create_stubs = portable ? false : (options?.create_stubs ?? true);
  const retroactive_link = portable ? false : (options?.retroactive_link ?? true);
  const dry_run = options?.dry_run ?? false;
  const autolink = portable ? false : (options?.autolink ?? true);
  // Phase 022: Support both auto_split (preferred) and force_atomic (deprecated) for backwards compatibility
  // auto_split: true means split, force_atomic: true means don't split (inverted)
  // Phase 026: Portable mode disables splitting
  const auto_split = portable ? false : (options?.auto_split ?? (options?.force_atomic !== undefined ? !options.force_atomic : true));
  const confirm_new_domain = options?.confirm_new_domain ?? true;
  // Phase 022: Per-operation split threshold overrides
  const split_thresholds = options?.split_thresholds;

  try {
    // Resolve and validate vault
    const vault = resolveVaultParam(vaultParam);
    enforceWriteAccess(vault);

    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Phase 023: Start operation tracking
    const operation = startOperation('store', vault.alias, {
      title,
      intent: intent.capture_type,
      domain: intent.domain,
    });

    // Check if a stub exists for this title and should be expanded
    const existingStub = findStubByTitle(db, title);
    if (existingStub) {
      if (!dry_run) {
        await expandStub(
          existingStub.path,
          content,
          vault,
          source ?? { origin: 'ai:research', confidence: 0.5 }
        );

        // Phase 023: Track stub expansion as modification
        trackFileModified(operation.id, existingStub.path);

        // Re-index the expanded note
        const updatedNote = await readNote(existingStub.path, {
          vaultPath: vault.path,
          ignoreConfig: vault.config.ignore,
        });
        if (updatedNote) {
          indexNote(db, updatedNote);
        }
      }

      const vaultInfo = getVaultResultInfo(vault);
      return {
        success: true,
        data: {
          success: true,
          vault: vaultInfo.vault,
          vaultPath: vaultInfo.vault_path,
          created: {
            path: existingStub.path,
            title,
            type: 'atomic',
          },
          domain: {
            path: dirname(existingStub.path),
            is_new: false,
            level: existingStub.path.split('/').length - 1,
          },
          operation_id: operation.id,
          message: `Expanded stub: ${existingStub.path}`,
        },
      };
    }

    // Resolve storage location
    const resolution = resolveStorage(intent, title, vault);

    // Check for new top-level domain
    if (resolution.isNewTopLevelDomain && confirm_new_domain) {
      logger.info(
        `Creating new top-level domain: ${intent.domain[0]}`
      );
    }

    // Check for path conflicts
    const existingPaths = getIndexedPaths(db);
    const conflict = checkPathConflict(resolution, existingPaths);
    let finalResolution = resolution;

    if (conflict) {
      // Generate alternative path
      let suffix = 2;
      while (checkPathConflict(finalResolution, existingPaths)) {
        finalResolution = generateAlternativePath(resolution, suffix++);
        if (suffix > 10) {
          return {
            success: false,
            error: `Unable to find non-conflicting path for: ${title}`,
            code: 'PATH_CONFLICT',
          };
        }
      }
    }

    // Process content
    let processedContent = content;
    let linksAdded = 0;

    // Auto-link content
    if (autolink) {
      try {
        const { index } = await buildCompleteIndex(db);
        const matches = scanForMatches(processedContent, index);
        if (matches.length > 0) {
          const result = autolinkContent(processedContent, matches);
          processedContent = result.linkedContent;
          linksAdded = result.linksAdded.length;
        }
      } catch (linkError) {
        logger.warn('Auto-linking failed, proceeding without', linkError);
      }
    }

    // Phase 026: Convert wiki-links to plain text for portable mode
    if (portable) {
      processedContent = processWikiLinks(processedContent, 'plain_text');
    }

    // Check if content should be split (atomic note system)
    // Phase 022: Use auto_split option directly (respects both auto_split and deprecated force_atomic)
    const atomicConfig = vault.config.atomic;
    const shouldAutoSplit = atomicConfig.auto_split && auto_split;

    // Phase 022: Merge per-operation threshold overrides with vault config
    // Filter out undefined values to avoid overwriting required properties
    const effectiveAtomicConfig = split_thresholds
      ? {
          ...atomicConfig,
          ...Object.fromEntries(
            Object.entries(split_thresholds).filter(([, v]) => v !== undefined)
          ),
        }
      : atomicConfig;

    // Phase 022: Track if content exceeds limits for warning
    let atomicWarning: string | undefined;

    if (shouldAutoSplit) {
      const splitDecision = shouldSplit(processedContent, effectiveAtomicConfig);

      if (splitDecision.shouldSplit) {
        // Content exceeds atomic limits - split into hub + children
        logger.info(`Content exceeds atomic limits: ${splitDecision.reason}`);

        // Phase 022: Get hub_sections from split_thresholds or vault config
        const hubSections = split_thresholds?.hub_sections ?? effectiveAtomicConfig.hub_sections;

        const splitResult = await handleAtomicSplit(
          title,
          processedContent,
          finalResolution,
          vault,
          intent,
          source,
          db,
          dry_run,
          create_stubs,
          retroactive_link,
          linksAdded,
          hubSections,
          operation.id // Phase 023: Pass operation ID for tracking
        );

        return splitResult;
      }
    } else {
      // Phase 022: Check if content would have been split and warn user
      const splitDecision = shouldSplit(processedContent, effectiveAtomicConfig);
      if (splitDecision.shouldSplit) {
        atomicWarning = `Content exceeds atomic limits (${splitDecision.metrics.lineCount} lines, ${splitDecision.metrics.sectionCount} sections). Set auto_split: true to auto-split.`;
        logger.info(`Atomic warning: ${atomicWarning}`);
      }
    }

    // Build frontmatter for single atomic note
    const now = new Date().toISOString();
    const frontmatter: Record<string, unknown> = {
      capture_type: intent.capture_type,
      domain: intent.domain,
      status: 'active',
      created: now,
      modified: now,
      source: source?.origin ?? 'ai:research',
      confidence: source?.confidence ?? 0.5,
      verified: false,
      tags: intent.tags ?? [],
      related: intent.references?.map((r) => `[[${r}]]`) ?? [],
      aliases: [],
    };

    // Add source capture metadata
    if (intent.capture_type === 'source' && intent.source) {
      frontmatter.source_type = intent.source.type;
      frontmatter.source_title = intent.source.title;
      if (intent.source.author) frontmatter.source_author = intent.source.author;
      if (intent.source.url) frontmatter.source_url = intent.source.url;
    }

    // Add project/client context
    if (intent.project) frontmatter.project = intent.project;
    if (intent.client) frontmatter.client = intent.client;

    // Add optional note type
    if (intent.note_type) frontmatter.note_type = intent.note_type;

    // Build full note content
    const body = `# ${title}\n\n${processedContent}`;
    const noteContent = stringifyFrontmatter(frontmatter, body);

    // Create stubs for unresolved [[wiki-links]]
    const stubsCreated: string[] = [];

    // Save the note
    if (!dry_run) {
      await mkdir(finalResolution.parentDir, { recursive: true });
      await writeFile(finalResolution.fullPath, noteContent, 'utf-8');

      // Phase 023: Track file creation
      trackFileCreated(operation.id, finalResolution.relativePath);

      // Index the new note
      const savedNote = await readNote(finalResolution.relativePath, {
        vaultPath: vault.path,
        ignoreConfig: vault.config.ignore,
      });
      if (savedNote) {
        indexNote(db, savedNote);
      }

      // Create stubs for unresolved [[wiki-links]] in content
      if (create_stubs) {
        try {
          const linkStubs = await createStubsForUnresolvedLinks(
            processedContent,
            finalResolution.relativePath,
            db,
            vault,
            intent.domain
          );
          stubsCreated.push(...linkStubs);

          // Phase 023: Track stub creations
          for (const stubPath of linkStubs) {
            trackFileCreated(operation.id, stubPath);
          }

          // Index the new link stubs
          for (const stubPath of linkStubs) {
            const stubNote = await readNote(stubPath, {
              vaultPath: vault.path,
              ignoreConfig: vault.config.ignore,
            });
            if (stubNote) {
              indexNote(db, stubNote);
            }
          }
        } catch (linkStubError) {
          logger.warn(
            'Failed to create stubs for unresolved links',
            linkStubError
          );
        }
      }
    }

    // Handle retroactive linking
    const linksFromExisting: string[] = [];

    if (retroactive_link && !dry_run) {
      // Build aliases from domain terms and any explicit aliases
      const aliases = buildRetroactiveAliases(title, intent.domain);

      const matches = findUnlinkedMentions(
        db,
        title,
        finalResolution.relativePath,
        aliases
      );
      if (matches.length > 0) {
        const result = await addRetroactiveLinks(
          title,
          finalResolution.relativePath,
          matches,
          vault
        );
        linksFromExisting.push(...result.notesUpdated);

        // Phase 023: Track retroactive link modifications
        for (const updatedPath of result.notesUpdated) {
          trackFileModified(operation.id, updatedPath);
        }
      }
    }

    // Calculate domain info
    const domainPath = intent.domain.join('/');
    const domainLevel = intent.domain.length;

    const vaultResultInfo = getVaultResultInfo(vault);
    return {
      success: true,
      data: {
        success: true,
        vault: vaultResultInfo.vault,
        vaultPath: vaultResultInfo.vault_path,
        created: {
          path: finalResolution.relativePath,
          title,
          type: 'atomic',
        },
        domain: {
          path: domainPath,
          is_new: resolution.isNewTopLevelDomain,
          level: domainLevel,
        },
        stubs_created: stubsCreated.length > 0 ? stubsCreated : undefined,
        links_added:
          linksAdded > 0 || linksFromExisting.length > 0
            ? {
                to_existing: [],
                from_existing: linksFromExisting,
              }
            : undefined,
        // Phase 022: Include warning if content exceeds limits but auto_split is disabled
        atomic_warning: atomicWarning,
        // Phase 023: Operation tracking
        operation_id: operation.id,
        message: buildSuccessMessage(
          finalResolution.relativePath,
          linksAdded,
          stubsCreated,
          linksFromExisting,
          dry_run
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'STORE_ERROR',
    };
  }
}

/**
 * Build aliases for retroactive linking from title and domain
 * This helps find mentions that don't match the exact title
 */
function buildRetroactiveAliases(_title: string, _domain: string[]): string[] {
  // Phase 029: Removed single-word alias generation.
  // Single words from titles/domains matched too broadly across the vault.
  // The full title with word boundary matching is sufficient for retroactive linking.
  // Explicit note aliases (from frontmatter) can be added here in the future.
  return [];
}

/**
 * Build success message
 */
function buildSuccessMessage(
  path: string,
  linksAdded: number,
  stubs: string[],
  retroactiveUpdates: string[],
  dryRun: boolean
): string {
  const parts = [dryRun ? `Would create: ${path}` : `Created: ${path}`];

  if (linksAdded > 0) {
    parts.push(`${linksAdded} auto-links added`);
  }

  if (stubs.length > 0) {
    parts.push(`${stubs.length} stub${stubs.length > 1 ? 's' : ''} created (use create_stubs: false to suppress)`);
  }

  if (retroactiveUpdates.length > 0) {
    parts.push(
      `${retroactiveUpdates.length} existing note${retroactiveUpdates.length > 1 ? 's' : ''} updated with links`
    );
  }

  return parts.join(' | ');
}

/**
 * Handle atomic splitting of large content
 * Phase 022: Added hubSections parameter for sections that stay in hub
 */
async function handleAtomicSplit(
  title: string,
  content: string,
  resolution: ReturnType<typeof resolveStorage>,
  vault: ReturnType<typeof resolveVaultParam>,
  intent: {
    capture_type: string;
    domain: string[];
    tags?: string[] | undefined;
    references?: string[] | undefined;
    project?: string | undefined;
    client?: string | undefined;
    source?: { type: string; title: string; author?: string | undefined; url?: string | undefined } | undefined;
  },
  source: { origin?: string | undefined; confidence?: number | undefined } | undefined,
  db: Awaited<ReturnType<ReturnType<typeof getIndexManager>['getIndex']>>,
  dryRun: boolean,
  createStubs: boolean,
  retroactiveLink: boolean,
  linksAdded: number,
  hubSections?: string[], // Phase 022: Sections that stay in hub
  operationId?: string // Phase 023: Operation tracking
): Promise<ToolResult<PalaceStoreOutput>> {
  const linksFromExisting: string[] = [];

  // Determine target directory for hub and children
  const targetDir = dirname(resolution.relativePath);

  // Split the content
  // Phase 018: hubFilename removed - derived from title automatically
  // Phase 022: Pass hubSections to splitter
  const splitOptions = {
    targetDir,
    title,
    originalFrontmatter: {
      capture_type: intent.capture_type,
      domain: intent.domain,
      source: source?.origin ?? 'ai:research',
      confidence: source?.confidence ?? 0.5,
    },
    domain: intent.domain,
    ...(hubSections && { hubSections }), // Phase 022: Sections that stay in hub (only if defined)
  };
  const splitResult = splitContent(content, splitOptions);

  const createdPaths: string[] = [];
  const stubsCreated: string[] = [];

  if (!dryRun) {
    // Phase 022: Extract intro/overview content from split result for hub preservation
    // The hub.content has format: "# Title\n\n{intro}\n\n## Knowledge Map\n..."
    // Extract the intro between title and Knowledge Map
    const hubContentLines = splitResult.hub.content.split('\n');
    const introLines: string[] = [];
    let foundTitle = false;
    for (const line of hubContentLines) {
      if (line.startsWith('# ') && !foundTitle) {
        foundTitle = true;
        continue;
      }
      if (line.startsWith('## Knowledge Map')) {
        break;
      }
      if (foundTitle) {
        introLines.push(line);
      }
    }
    const hubOverview = introLines.join('\n').trim();

    // Create hub note
    const hubResult = await createHub(
      vault.path,
      targetDir,
      title,
      splitResult.children.map((c) => {
        const child: { path: string; title: string; summary?: string } = {
          path: c.relativePath,
          title: c.title,
        };
        if (c.fromSection) {
          child.summary = c.fromSection;
        }
        return child;
      }),
      {
        domain: intent.domain,
        originalFrontmatter: {
          capture_type: intent.capture_type,
        },
        // Phase 022: Pass overview to preserve intro content
        overview: hubOverview,
      }
    );

    if (hubResult.success) {
      createdPaths.push(hubResult.path);

      // Phase 023: Track hub creation
      if (operationId) {
        trackFileCreated(operationId, hubResult.path);
      }

      // Index the hub
      const hubNote = await readNote(hubResult.path, {
        vaultPath: vault.path,
        ignoreConfig: vault.config.ignore,
      });
      if (hubNote) {
        indexNote(db, hubNote);
      }
    }

    // Create child notes
    for (const child of splitResult.children) {
      const childResult = await createChildNote(
        vault.path,
        child.relativePath,
        child.title,
        child.content,
        splitResult.hub.relativePath,
        {
          domain: intent.domain,
          originalFrontmatter: {
            capture_type: intent.capture_type,
          },
        }
      );

      if (childResult.success) {
        createdPaths.push(childResult.path);

        // Phase 023: Track child creation
        if (operationId) {
          trackFileCreated(operationId, childResult.path);
        }

        // Index the child
        const childNote = await readNote(childResult.path, {
          vaultPath: vault.path,
          ignoreConfig: vault.config.ignore,
        });
        if (childNote) {
          indexNote(db, childNote);
        }
      }
    }

    // Create stubs for unresolved [[wiki-links]]
    if (createStubs) {
      try {
        for (const childPath of createdPaths) {
          const linkStubs = await createStubsForUnresolvedLinks(
            content,
            childPath,
            db,
            vault,
            intent.domain
          );
          stubsCreated.push(...linkStubs);

          // Phase 023: Track stub creations
          if (operationId) {
            for (const stubPath of linkStubs) {
              trackFileCreated(operationId, stubPath);
            }
          }

          for (const stubPath of linkStubs) {
            const stubNote = await readNote(stubPath, {
              vaultPath: vault.path,
              ignoreConfig: vault.config.ignore,
            });
            if (stubNote) {
              indexNote(db, stubNote);
            }
          }
        }
      } catch (stubError) {
        logger.warn('Failed to create stubs', stubError);
      }
    }

    // Handle retroactive linking for the hub note
    if (retroactiveLink) {
      try {
        const aliases = buildRetroactiveAliases(title, intent.domain);
        const matches = findUnlinkedMentions(
          db,
          title,
          splitResult.hub.relativePath,
          aliases
        );
        if (matches.length > 0) {
          const result = await addRetroactiveLinks(
            title,
            splitResult.hub.relativePath,
            matches,
            vault
          );
          linksFromExisting.push(...result.notesUpdated);

          // Phase 023: Track retroactive link modifications
          if (operationId) {
            for (const updatedPath of result.notesUpdated) {
              trackFileModified(operationId, updatedPath);
            }
          }
        }
      } catch (retroError) {
        logger.warn('Retroactive linking failed', retroError);
      }
    }
  }

  const vaultResultInfo = getVaultResultInfo(vault);
  const childCount = splitResult.children.length;
  const domainPath = intent.domain.join('/');
  const domainLevel = intent.domain.length;

  return {
    success: true,
    data: {
      success: true,
      vault: vaultResultInfo.vault,
      vaultPath: vaultResultInfo.vault_path,
      created: {
        path: splitResult.hub.relativePath,
        title,
        type: 'hub',
      },
      domain: {
        path: domainPath,
        is_new: resolution.isNewTopLevelDomain,
        level: domainLevel,
      },
      split_result: {
        hub_path: splitResult.hub.relativePath,
        children_paths: splitResult.children.map((c) => c.relativePath),
        children_count: childCount,
      },
      stubs_created: stubsCreated.length > 0 ? stubsCreated : undefined,
      links_added:
        linksAdded > 0 || linksFromExisting.length > 0
          ? { to_existing: [], from_existing: linksFromExisting }
          : undefined,
      // Phase 023: Operation tracking
      operation_id: operationId,
      message: buildSuccessMessage(
        splitResult.hub.relativePath,
        linksAdded,
        stubsCreated,
        linksFromExisting,
        dryRun
      ),
    },
  };
}
