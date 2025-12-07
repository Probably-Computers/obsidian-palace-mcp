/**
 * palace_vaults - List and manage configured vaults
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { getVaultRegistry } from '../services/vault/registry.js';
import { countNotesInVault, getIndexManager } from '../services/index/index.js';

// Input schema
const inputSchema = z.object({
  include_counts: z.boolean().optional().default(false),
  include_config: z.boolean().optional().default(false),
});

// Tool definition
export const vaultsTool: Tool = {
  name: 'palace_vaults',
  description:
    'List all configured vaults with their aliases, paths, access modes, and optionally note counts.',
  inputSchema: {
    type: 'object',
    properties: {
      include_counts: {
        type: 'boolean',
        description: 'Include note counts for each vault (slower, default: false)',
      },
      include_config: {
        type: 'boolean',
        description: 'Include vault configuration details (default: false)',
      },
    },
  },
};

// Vault info for output
interface VaultOutputInfo {
  alias: string;
  path: string;
  mode: 'rw' | 'ro';
  is_default: boolean;
  description?: string | undefined;
  note_count?: number | undefined;
  config?: {
    atomic: {
      max_lines: number;
      max_sections: number;
      hub_filename: string;
      auto_split: boolean;
    };
    graph: {
      require_technology_links: boolean;
      retroactive_linking: boolean;
    };
    ignore_patterns: string[];
  } | undefined;
}

// Tool handler
export async function vaultsHandler(
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const input = parseResult.data;

  try {
    const registry = getVaultRegistry();
    const vaults = registry.listVaults();
    const globalConfig = registry.getGlobalConfig();
    const manager = getIndexManager();

    const vaultInfos: VaultOutputInfo[] = [];

    for (const vault of vaults) {
      const info: VaultOutputInfo = {
        alias: vault.alias,
        path: vault.path,
        mode: vault.mode,
        is_default: vault.isDefault,
        description: vault.description,
      };

      // Get note count if requested
      if (input.include_counts) {
        try {
          const db = await manager.getIndex(vault.alias);
          const count = countNotesInVault(db, {});
          info.note_count = count;
        } catch {
          info.note_count = -1; // Indicate error
        }
      }

      // Include config if requested
      if (input.include_config) {
        info.config = {
          atomic: {
            max_lines: vault.config.atomic.max_lines,
            max_sections: vault.config.atomic.max_sections,
            hub_filename: vault.config.atomic.hub_filename,
            auto_split: vault.config.atomic.auto_split,
          },
          graph: {
            require_technology_links: vault.config.graph.require_technology_links,
            retroactive_linking: vault.config.graph.retroactive_linking,
          },
          ignore_patterns: vault.config.ignore.patterns,
        };
      }

      vaultInfos.push(info);
    }

    return {
      success: true,
      data: {
        vault_count: vaultInfos.length,
        default_vault: registry.getDefaultVault().alias,
        cross_vault_search: globalConfig.cross_vault.search,
        standards_source: globalConfig.cross_vault.standards_source,
        vaults: vaultInfos,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'VAULTS_ERROR',
    };
  }
}
