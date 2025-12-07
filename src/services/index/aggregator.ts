/**
 * Result Aggregator
 * Merges and ranks search results from multiple vaults
 */

import type { NoteMetadata, SearchResult } from '../../types/index.js';

/**
 * Search result with vault attribution
 */
export interface VaultSearchResult extends SearchResult {
  vault: string;
  vaultPath: string; // Original path within vault
  prefixedPath: string; // vault:alias/path format
}

/**
 * Query result with vault attribution
 */
export interface VaultQueryResult {
  vault: string;
  vaultPath: string;
  prefixedPath: string;
  note: NoteMetadata;
}

/**
 * Add vault attribution to a search result
 */
export function addVaultAttribution(
  result: SearchResult,
  vaultAlias: string
): VaultSearchResult {
  return {
    ...result,
    vault: vaultAlias,
    vaultPath: result.note.path,
    prefixedPath: `vault:${vaultAlias}/${result.note.path}`,
  };
}

/**
 * Add vault attribution to a note metadata
 */
export function addVaultAttributionToNote(
  note: NoteMetadata,
  vaultAlias: string
): VaultQueryResult {
  return {
    vault: vaultAlias,
    vaultPath: note.path,
    prefixedPath: `vault:${vaultAlias}/${note.path}`,
    note,
  };
}

/**
 * Aggregate search results from multiple vaults
 * Sorts by score descending and applies limit
 */
export function aggregateSearchResults(
  results: VaultSearchResult[],
  limit: number = 20
): VaultSearchResult[] {
  // Sort by score descending (higher score = more relevant)
  const sorted = results.sort((a, b) => b.score - a.score);

  // Apply limit
  return sorted.slice(0, limit);
}

/**
 * Aggregate query results from multiple vaults
 * Maintains order from each vault, interleaves results
 */
export function aggregateQueryResults(
  results: VaultQueryResult[],
  limit: number = 50
): VaultQueryResult[] {
  // For query results without scores, just apply limit
  return results.slice(0, limit);
}

/**
 * Merge results with deduplication by path
 * If the same path exists in multiple vaults (unlikely), keep first occurrence
 */
export function deduplicateResults<T extends { vaultPath: string; vault: string }>(
  results: T[]
): T[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.vault}:${result.vaultPath}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Filter results by vault aliases
 */
export function filterByVaults<T extends { vault: string }>(
  results: T[],
  includeVaults?: string[],
  excludeVaults?: string[]
): T[] {
  return results.filter((result) => {
    // If includeVaults specified, result must be in that list
    if (includeVaults && includeVaults.length > 0) {
      if (!includeVaults.includes(result.vault)) {
        return false;
      }
    }

    // If excludeVaults specified, result must not be in that list
    if (excludeVaults && excludeVaults.length > 0) {
      if (excludeVaults.includes(result.vault)) {
        return false;
      }
    }

    return true;
  });
}
