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

// Tool definition with new topic-based schema
export const storeTool: Tool = {
  name: 'palace_store',
  description: `Store knowledge using topic-based resolution. Express WHAT to store with capture_type and domain.

**Capture Types:**
- 'source': Raw capture from a specific source (book, video, article) → sources/{type}/{title}/
- 'knowledge': Processed, reusable knowledge about a topic → {domain}/{subdomain}/
- 'project': Project or client specific context → projects/{project}/ or clients/{client}/

**Domain IS the path:** ['networking', 'wireless', 'lora'] → networking/wireless/lora/

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
          force_atomic: {
            type: 'boolean',
            description:
              'Skip atomic splitting even if content exceeds limits (default: false)',
          },
          confirm_new_domain: {
            type: 'boolean',
            description:
              'Warn if creating a new top-level domain (default: true)',
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
  const create_stubs = options?.create_stubs ?? true;
  const retroactive_link = options?.retroactive_link ?? true;
  const dry_run = options?.dry_run ?? false;
  const autolink = options?.autolink ?? true;
  const force_atomic = options?.force_atomic ?? false;
  const confirm_new_domain = options?.confirm_new_domain ?? true;

  try {
    // Resolve and validate vault
    const vault = resolveVaultParam(vaultParam);
    enforceWriteAccess(vault);

    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

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

    // Check if content should be split (atomic note system)
    const atomicConfig = vault.config.atomic;
    const shouldAutoSplit = atomicConfig.auto_split && !force_atomic;

    if (shouldAutoSplit) {
      const splitDecision = shouldSplit(processedContent, atomicConfig);

      if (splitDecision.shouldSplit) {
        // Content exceeds atomic limits - split into hub + children
        logger.info(`Content exceeds atomic limits: ${splitDecision.reason}`);

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
          linksAdded
        );

        return splitResult;
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
function buildRetroactiveAliases(title: string, domain: string[]): string[] {
  const aliases: string[] = [];

  // Add the last domain term as an alias (e.g., "peppers" for gardening/vegetables/peppers)
  if (domain.length > 0) {
    const lastDomain = domain[domain.length - 1];
    if (lastDomain && lastDomain.toLowerCase() !== title.toLowerCase()) {
      aliases.push(lastDomain);
    }
  }

  // Add significant words from the title (words > 4 chars, not common words)
  const stopWords = new Set(['about', 'after', 'before', 'being', 'between', 'could', 'every', 'first', 'from', 'have', 'into', 'just', 'like', 'made', 'make', 'more', 'most', 'much', 'must', 'only', 'other', 'over', 'said', 'same', 'should', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'through', 'under', 'very', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your']);

  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.has(w));

  // Add individual significant words as aliases
  for (const word of titleWords) {
    if (!aliases.includes(word)) {
      aliases.push(word);
    }
  }

  return aliases;
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
    parts.push(`${stubs.length} stub${stubs.length > 1 ? 's' : ''} created`);
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
  linksAdded: number
): Promise<ToolResult<PalaceStoreOutput>> {
  const linksFromExisting: string[] = [];

  // Determine target directory for hub and children
  const targetDir = dirname(resolution.relativePath);

  // Split the content
  // Phase 018: hubFilename removed - derived from title automatically
  const splitResult = splitContent(content, {
    targetDir,
    title,
    originalFrontmatter: {
      capture_type: intent.capture_type,
      domain: intent.domain,
      source: source?.origin ?? 'ai:research',
      confidence: source?.confidence ?? 0.5,
    },
    domain: intent.domain,
  });

  const createdPaths: string[] = [];
  const stubsCreated: string[] = [];

  if (!dryRun) {
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
      }
    );

    if (hubResult.success) {
      createdPaths.push(hubResult.path);

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
