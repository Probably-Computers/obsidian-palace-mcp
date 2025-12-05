/**
 * Tool registration and dispatch
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';

// Import tool handlers
import { rememberTool, rememberHandler } from './remember.js';
import { readTool, readHandler } from './read.js';
import { recallTool, recallHandler } from './recall.js';
import { listTool, listHandler } from './list.js';
import { structureTool, structureHandler } from './structure.js';

// Tool registry
const tools: Map<string, Tool> = new Map();
const handlers: Map<string, (args: Record<string, unknown>) => Promise<ToolResult>> = new Map();

/**
 * Register all tools
 */
export function registerTools(): void {
  // Core tools
  tools.set('palace_remember', rememberTool);
  handlers.set('palace_remember', rememberHandler);

  tools.set('palace_read', readTool);
  handlers.set('palace_read', readHandler);

  tools.set('palace_recall', recallTool);
  handlers.set('palace_recall', recallHandler);

  tools.set('palace_list', listTool);
  handlers.set('palace_list', listHandler);

  tools.set('palace_structure', structureTool);
  handlers.set('palace_structure', structureHandler);

  // TODO: Add more tools as implemented
  // - palace_update
  // - palace_links
  // - palace_orphans
  // - palace_related
  // - palace_autolink
  // - palace_dataview
  // - palace_query
  // - palace_session_start
  // - palace_session_log
}

/**
 * Get all tool definitions
 */
export function getToolDefinitions(): Tool[] {
  if (tools.size === 0) {
    registerTools();
  }
  return Array.from(tools.values());
}

/**
 * Handle a tool call
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  if (handlers.size === 0) {
    registerTools();
  }

  const handler = handlers.get(name);
  if (!handler) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
      code: 'UNKNOWN_TOOL',
    };
  }

  return handler(args);
}
