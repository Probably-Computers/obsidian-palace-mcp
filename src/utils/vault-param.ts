/**
 * Vault Parameter Utilities
 * Shared utilities for resolving vault parameters in tools
 */

import { resolve, sep } from 'path';
import { z } from 'zod';
import { getVaultRegistry } from '../services/vault/registry.js';
import type { ResolvedVault } from '../types/index.js';

/**
 * Common vault parameter schema for tools
 */
export const vaultParamSchema = z.object({
  vault: z
    .string()
    .optional()
    .describe('Vault alias or path. Defaults to the default vault.'),
});

/**
 * Resolve a vault parameter to a ResolvedVault
 * Handles alias lookup, path lookup, and defaults
 */
export function resolveVaultParam(vault?: string): ResolvedVault {
  const registry = getVaultRegistry();

  if (!vault) {
    return registry.getDefaultVault();
  }

  // Try alias first
  const byAlias = registry.getVault(vault);
  if (byAlias) {
    return byAlias;
  }

  // Try path match
  for (const v of registry.listVaults()) {
    if (v.path === vault) {
      return v;
    }
  }

  throw new Error(`Vault not found: ${vault}`);
}

/**
 * Enforce write access on a vault
 * Throws if vault is read-only
 */
export function enforceWriteAccess(vault: ResolvedVault): void {
  if (vault.mode === 'ro') {
    throw new Error(`Vault '${vault.alias}' is read-only`);
  }
}

/**
 * Parse cross-vault path format: vault:alias/path/to/note.md
 * Returns { vaultAlias, notePath } or null if not cross-vault format
 */
export function parseCrossVaultPath(
  fullPath: string
): { vaultAlias: string; notePath: string } | null {
  // Check for vault: prefix
  const match = fullPath.match(/^vault:([^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }

  return {
    vaultAlias: match[1]!,
    notePath: match[2]!,
  };
}

/**
 * Resolve a path that may be cross-vault format or regular path
 * Returns the resolved vault and the note path within that vault
 */
export function resolvePathWithVault(
  path: string,
  explicitVault?: string
): { vault: ResolvedVault; notePath: string } {
  // Check for cross-vault path format first
  const crossVault = parseCrossVaultPath(path);
  if (crossVault) {
    const vault = resolveVaultParam(crossVault.vaultAlias);
    return { vault, notePath: crossVault.notePath };
  }

  // Use explicit vault parameter or default
  const vault = resolveVaultParam(explicitVault);
  return { vault, notePath: path };
}

/**
 * Format a path with vault prefix for cross-vault reference
 */
export function formatCrossVaultPath(vaultAlias: string, notePath: string): string {
  return `vault:${vaultAlias}/${notePath}`;
}

/**
 * Validate that a relative note path stays within the vault root.
 * Prevents path traversal attacks via ../ sequences or absolute paths.
 * Throws if the path would escape the vault.
 */
export function validateNotePath(notePath: string, vaultPath: string): void {
  // Reject absolute paths
  if (notePath.startsWith('/') || notePath.startsWith('\\')) {
    throw new Error(`Absolute paths are not allowed: ${notePath}`);
  }

  // Resolve to absolute and verify containment
  const resolvedVault = resolve(vaultPath);
  const resolvedNote = resolve(vaultPath, notePath);

  if (!resolvedNote.startsWith(resolvedVault + sep) && resolvedNote !== resolvedVault) {
    throw new Error(`Path traversal detected: ${notePath}`);
  }
}

/**
 * Get vault info for inclusion in tool results
 */
export function getVaultResultInfo(vault: ResolvedVault): {
  vault: string;
  vault_path: string;
  vault_mode: 'rw' | 'ro';
} {
  return {
    vault: vault.alias,
    vault_path: vault.path,
    vault_mode: vault.mode,
  };
}
