/**
 * Standards loader for atomic note system
 *
 * Finds and loads notes with ai_binding frontmatter.
 */

import { readNote, listNotes } from '../vault/reader.js';
import { getVaultRegistry } from '../vault/registry.js';
import { logger } from '../../utils/logger.js';
import type {
  LoadedStandard,
  StandardsLoaderOptions,
  StandardsCacheEntry,
  BindingLevel,
  StandardFrontmatter,
} from '../../types/standards.js';
import type { ResolvedVault } from '../../types/index.js';

// Cache for loaded standards (per vault)
const standardsCache = new Map<string, StandardsCacheEntry>();

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Check if frontmatter indicates this is a standard note
 */
function isStandardNote(frontmatter: Record<string, unknown>): boolean {
  return (
    frontmatter.type === 'standard' &&
    typeof frontmatter.ai_binding === 'string' &&
    ['required', 'recommended', 'optional'].includes(frontmatter.ai_binding)
  );
}

/**
 * Extract a summary from content (first paragraph after title)
 */
function extractSummary(content: string, maxLength = 200): string {
  const lines = content.split('\n');
  let summary = '';
  let foundContent = false;

  for (const line of lines) {
    // Skip title and empty lines at start
    if (line.startsWith('#') || (!foundContent && line.trim() === '')) {
      continue;
    }

    foundContent = true;

    // Stop at next heading or empty line after content
    if (line.startsWith('#') || (summary.length > 0 && line.trim() === '')) {
      break;
    }

    summary += (summary ? ' ' : '') + line.trim();

    if (summary.length >= maxLength) {
      break;
    }
  }

  if (summary.length > maxLength) {
    return summary.slice(0, maxLength - 3) + '...';
  }

  return summary;
}

/**
 * Load all standards from a vault
 */
async function loadStandardsFromVault(vault: ResolvedVault): Promise<LoadedStandard[]> {
  const standards: LoadedStandard[] = [];

  try {
    // Get all notes recursively
    const notes = await listNotes('', true, {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    });

    // Filter for standard notes and load full content
    for (const meta of notes) {
      const fm = meta.frontmatter as unknown as Record<string, unknown>;

      if (!isStandardNote(fm)) {
        continue;
      }

      // Load full note content
      const note = await readNote(meta.path, {
        vaultPath: vault.path,
        ignoreConfig: vault.config.ignore,
      });

      if (!note) {
        continue;
      }

      const frontmatter = note.frontmatter as unknown as StandardFrontmatter;

      standards.push({
        path: note.path,
        vault: vault.alias,
        title: note.title,
        binding: frontmatter.ai_binding,
        applies_to: Array.isArray(frontmatter.applies_to)
          ? frontmatter.applies_to
          : ['all'],
        domain: Array.isArray(frontmatter.domain) ? frontmatter.domain : [],
        content: note.content,
        summary: extractSummary(note.content),
        frontmatter,
      });
    }

    logger.debug(`Loaded ${standards.length} standards from vault: ${vault.alias}`);
  } catch (error) {
    logger.error(`Failed to load standards from vault ${vault.alias}:`, error);
  }

  return standards;
}

/**
 * Get cached standards or load fresh
 */
async function getCachedStandards(vault: ResolvedVault): Promise<LoadedStandard[]> {
  const cached = standardsCache.get(vault.alias);
  const now = Date.now();

  if (cached && now - cached.loadedAt < CACHE_TTL) {
    logger.debug(`Using cached standards for vault: ${vault.alias}`);
    return cached.standards;
  }

  const standards = await loadStandardsFromVault(vault);

  standardsCache.set(vault.alias, {
    standards,
    loadedAt: now,
    vaultAlias: vault.alias,
  });

  return standards;
}

/**
 * Clear standards cache (for testing or refresh)
 */
export function clearStandardsCache(): void {
  standardsCache.clear();
}

/**
 * Filter standards by options
 */
function filterStandards(
  standards: LoadedStandard[],
  options: StandardsLoaderOptions
): LoadedStandard[] {
  let filtered = [...standards];

  // Filter by binding level
  if (options.binding && options.binding !== 'all') {
    filtered = filtered.filter((s) => s.binding === options.binding);
  }

  // Filter by domain
  if (options.domain && options.domain.length > 0) {
    filtered = filtered.filter((s) =>
      options.domain!.some((d) => s.domain.includes(d))
    );
  }

  // Filter by applies_to
  if (options.applies_to) {
    const target = options.applies_to.toLowerCase();
    filtered = filtered.filter((s) =>
      s.applies_to.some((a) => a === 'all' || a.toLowerCase() === target)
    );
  }

  // Sort by binding priority (required first, then recommended, then optional)
  const bindingOrder: Record<BindingLevel, number> = {
    required: 0,
    recommended: 1,
    optional: 2,
  };

  filtered.sort((a, b) => bindingOrder[a.binding] - bindingOrder[b.binding]);

  return filtered;
}

/**
 * Load standards based on options
 */
export async function loadStandards(
  options: StandardsLoaderOptions = {}
): Promise<LoadedStandard[]> {
  const registry = getVaultRegistry();
  let standards: LoadedStandard[] = [];

  // Determine which vault(s) to load from
  if (options.vault) {
    // Load from specific vault
    const vault = registry.getVault(options.vault);
    if (!vault) {
      logger.warn(`Vault not found: ${options.vault}`);
      return [];
    }
    standards = await getCachedStandards(vault);
  } else {
    // Check for standards_source vault first
    const standardsVault = registry.getStandardsSourceVault();
    if (standardsVault) {
      standards = await getCachedStandards(standardsVault);
    }

    // If no standards_source or no standards found, load from default vault
    if (standards.length === 0) {
      const defaultVault = registry.getDefaultVault();
      standards = await getCachedStandards(defaultVault);
    }

    // If cross-vault search is enabled and no standards found, search all vaults
    if (standards.length === 0 && registry.isCrossVaultSearchEnabled()) {
      const vaults = registry.listVaults();
      for (const vault of vaults) {
        const vaultStandards = await getCachedStandards(vault);
        standards.push(...vaultStandards);
      }
    }
  }

  // Apply filters
  return filterStandards(standards, options);
}

/**
 * Load required standards only (convenience function)
 */
export async function loadRequiredStandards(
  options: Omit<StandardsLoaderOptions, 'binding'> = {}
): Promise<LoadedStandard[]> {
  return loadStandards({ ...options, binding: 'required' });
}

/**
 * Check if any required standards exist
 */
export async function hasRequiredStandards(
  options: Omit<StandardsLoaderOptions, 'binding'> = {}
): Promise<boolean> {
  const standards = await loadRequiredStandards(options);
  return standards.length > 0;
}

/**
 * Get standards by path
 */
export async function getStandardByPath(
  path: string,
  vaultAlias?: string
): Promise<LoadedStandard | null> {
  const standards = await loadStandards({ vault: vaultAlias });
  return standards.find((s) => s.path === path) ?? null;
}
