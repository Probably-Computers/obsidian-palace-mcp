/**
 * DQL result formatter
 * Formats execution results in various output formats
 */

import type { ExecutionResult, ResultRow } from './executor.js';

/**
 * Output format types
 */
export type OutputFormat = 'table' | 'list' | 'task' | 'json';

/**
 * Formatted output result
 */
export interface FormattedResult {
  format: OutputFormat;
  output: string;
  data: ExecutionResult;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'boolean') {
    return value ? '✓' : '✗';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'number') {
    // Format confidence as percentage
    if (value >= 0 && value <= 1) {
      return `${Math.round(value * 100)}%`;
    }
    return String(value);
  }
  return String(value);
}

/**
 * Escape markdown table cell content
 */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Calculate column widths for table formatting
 */
function calculateColumnWidths(
  headers: string[],
  rows: ResultRow[]
): number[] {
  const widths = headers.map((h) => h.length);

  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const field = headers[i]!;
      const value = formatValue(row[field]);
      widths[i] = Math.max(widths[i]!, value.length);
    }
  }

  return widths;
}

/**
 * Pad a string to a given width
 */
function padString(str: string, width: number): string {
  return str + ' '.repeat(Math.max(0, width - str.length));
}

/**
 * Format results as markdown table
 */
export function formatAsTable(result: ExecutionResult): string {
  if (result.rows.length === 0) {
    return '*No results*';
  }

  const headers = result.fields;
  const widths = calculateColumnWidths(headers, result.rows);

  const lines: string[] = [];

  // Header row
  const headerCells = headers.map((h, i) => padString(h, widths[i]!));
  lines.push(`| ${headerCells.join(' | ')} |`);

  // Separator row
  const separators = widths.map((w) => '-'.repeat(w));
  lines.push(`| ${separators.join(' | ')} |`);

  // Data rows
  for (const row of result.rows) {
    const cells = headers.map((field, i) => {
      const value = formatValue(row[field]);
      return padString(escapeCell(value), widths[i]!);
    });
    lines.push(`| ${cells.join(' | ')} |`);
  }

  return lines.join('\n');
}

/**
 * Format results as bullet list
 */
export function formatAsList(result: ExecutionResult): string {
  if (result.rows.length === 0) {
    return '*No results*';
  }

  const lines: string[] = [];

  for (const row of result.rows) {
    // Create wiki-link for the note
    const link = `[[${row.path.replace(/\.md$/, '')}|${row.title}]]`;
    lines.push(`- ${link}`);
  }

  return lines.join('\n');
}

/**
 * Format results as task list
 */
export function formatAsTask(result: ExecutionResult): string {
  if (result.rows.length === 0) {
    return '*No tasks*';
  }

  const lines: string[] = [];

  for (const row of result.rows) {
    // Check if note has a "completed" or "done" field
    const completed = row.completed === true || row.done === true;
    const checkbox = completed ? '[x]' : '[ ]';
    const link = `[[${row.path.replace(/\.md$/, '')}|${row.title}]]`;
    lines.push(`- ${checkbox} ${link}`);
  }

  return lines.join('\n');
}

/**
 * Format results as JSON
 */
export function formatAsJson(result: ExecutionResult): string {
  return JSON.stringify(
    {
      type: result.type,
      fields: result.fields,
      total: result.total,
      rows: result.rows,
    },
    null,
    2
  );
}

/**
 * Format execution result in the specified format
 */
export function formatResult(
  result: ExecutionResult,
  format: OutputFormat
): FormattedResult {
  let output: string;

  switch (format) {
    case 'table':
      output = formatAsTable(result);
      break;
    case 'list':
      output = formatAsList(result);
      break;
    case 'task':
      output = formatAsTask(result);
      break;
    case 'json':
    default:
      output = formatAsJson(result);
      break;
  }

  return {
    format,
    output,
    data: result,
  };
}
