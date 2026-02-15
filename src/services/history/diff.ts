/**
 * Diff generation service (Phase 028)
 *
 * Generates readable text diffs between note versions.
 * Uses a simple line-based diff algorithm without external dependencies.
 */

import { parseFrontmatter } from '../../utils/frontmatter.js';

/**
 * Diff line type
 */
export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'context';

/**
 * A single line in a diff
 */
export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number | undefined;
  newLineNumber?: number | undefined;
}

/**
 * A hunk of changes (group of related changes with context)
 */
export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

/**
 * Full diff result
 */
export interface DiffResult {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  hasChanges: boolean;
}

/**
 * Frontmatter diff for specific field changes
 */
export interface FrontmatterDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'changed';
}

/**
 * Generate a line-based diff between two strings
 */
export function generateDiff(
  oldContent: string,
  newContent: string,
  contextLines = 3
): DiffResult {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Use Longest Common Subsequence to find differences
  const lcs = computeLCS(oldLines, newLines);

  // Build diff from LCS
  const diffLines = buildDiffFromLCS(oldLines, newLines, lcs);

  // Group into hunks with context
  const hunks = groupIntoHunks(diffLines, contextLines);

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;
  for (const line of diffLines) {
    if (line.type === 'added') additions++;
    if (line.type === 'removed') deletions++;
  }

  return {
    hunks,
    additions,
    deletions,
    hasChanges: additions > 0 || deletions > 0,
  };
}

/**
 * Compute Longest Common Subsequence between two arrays
 * Returns the LCS as array of [oldIndex, newIndex] pairs
 */
function computeLCS(oldLines: string[], newLines: string[]): [number, number][] {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      dp[i]![j] = 0;
    }
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const oldLine = oldLines[i - 1];
      const newLine = newLines[j - 1];
      const prevDiag = dp[i - 1]?.[j - 1] ?? 0;
      const prevUp = dp[i - 1]?.[j] ?? 0;
      const prevLeft = dp[i]?.[j - 1] ?? 0;

      if (oldLine === newLine) {
        dp[i]![j] = prevDiag + 1;
      } else {
        dp[i]![j] = Math.max(prevUp, prevLeft);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: [number, number][] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    const oldLine = oldLines[i - 1];
    const newLine = newLines[j - 1];
    const prevUp = dp[i - 1]?.[j] ?? 0;
    const prevLeft = dp[i]?.[j - 1] ?? 0;

    if (oldLine === newLine) {
      lcs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (prevUp >= prevLeft) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Build diff lines from LCS
 */
function buildDiffFromLCS(
  oldLines: string[],
  newLines: string[],
  lcs: [number, number][]
): DiffLine[] {
  const result: DiffLine[] = [];

  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const lcsMatch = lcs[lcsIdx];

    if (lcsMatch && oldIdx === lcsMatch[0] && newIdx === lcsMatch[1]) {
      // Matched line (unchanged)
      const oldLine = oldLines[oldIdx];
      result.push({
        type: 'unchanged',
        content: oldLine ?? '',
        oldLineNumber: oldIdx + 1,
        newLineNumber: newIdx + 1,
      });
      oldIdx++;
      newIdx++;
      lcsIdx++;
    } else if (oldIdx < oldLines.length && (lcsMatch === undefined || oldIdx < lcsMatch[0])) {
      // Removed from old
      const oldLine = oldLines[oldIdx];
      result.push({
        type: 'removed',
        content: oldLine ?? '',
        oldLineNumber: oldIdx + 1,
      });
      oldIdx++;
    } else if (newIdx < newLines.length) {
      // Added in new
      const newLine = newLines[newIdx];
      result.push({
        type: 'added',
        content: newLine ?? '',
        newLineNumber: newIdx + 1,
      });
      newIdx++;
    } else {
      // Safety fallback - should never reach here, but prevents infinite loop
      break;
    }
  }

  return result;
}

/**
 * Group diff lines into hunks with context
 */
function groupIntoHunks(diffLines: DiffLine[], contextLines: number): DiffHunk[] {
  const hunks: DiffHunk[] = [];

  // Find change ranges (groups of consecutive changed lines)
  const changeRanges: { start: number; end: number }[] = [];
  let inChange = false;
  let changeStart = 0;

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    if (!line) continue;

    const isChange = line.type === 'added' || line.type === 'removed';

    if (isChange && !inChange) {
      changeStart = i;
      inChange = true;
    } else if (!isChange && inChange) {
      changeRanges.push({ start: changeStart, end: i - 1 });
      inChange = false;
    }
  }

  if (inChange) {
    changeRanges.push({ start: changeStart, end: diffLines.length - 1 });
  }

  if (changeRanges.length === 0) {
    return [];
  }

  // Merge overlapping ranges with context
  const mergedRanges: { start: number; end: number }[] = [];

  for (const range of changeRanges) {
    const contextStart = Math.max(0, range.start - contextLines);
    const contextEnd = Math.min(diffLines.length - 1, range.end + contextLines);

    const lastMerged = mergedRanges[mergedRanges.length - 1];

    if (lastMerged && contextStart <= lastMerged.end + 1) {
      // Merge with previous range
      lastMerged.end = contextEnd;
    } else {
      mergedRanges.push({ start: contextStart, end: contextEnd });
    }
  }

  // Build hunks from merged ranges
  for (const range of mergedRanges) {
    const hunkLines: DiffLine[] = [];
    let oldStart = 0;
    let oldCount = 0;
    let newStart = 0;
    let newCount = 0;

    for (let i = range.start; i <= range.end; i++) {
      const line = diffLines[i];
      if (!line) continue;

      // Mark context lines
      const hunkLine: DiffLine = {
        type: line.type === 'unchanged' ? 'context' : line.type,
        content: line.content,
        oldLineNumber: line.oldLineNumber,
        newLineNumber: line.newLineNumber,
      };

      hunkLines.push(hunkLine);

      // Track line numbers for hunk header
      if (line.type !== 'added') {
        if (oldStart === 0 && line.oldLineNumber !== undefined) {
          oldStart = line.oldLineNumber;
        }
        oldCount++;
      }

      if (line.type !== 'removed') {
        if (newStart === 0 && line.newLineNumber !== undefined) {
          newStart = line.newLineNumber;
        }
        newCount++;
      }
    }

    hunks.push({
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: hunkLines,
    });
  }

  return hunks;
}

/**
 * Format diff as a unified diff string (like git diff)
 */
export function formatUnifiedDiff(
  diff: DiffResult,
  oldPath = 'a/note.md',
  newPath = 'b/note.md'
): string {
  if (!diff.hasChanges) {
    return '(no changes)';
  }

  const lines: string[] = [];

  // Header
  lines.push(`--- ${oldPath}`);
  lines.push(`+++ ${newPath}`);

  // Hunks
  for (const hunk of diff.hunks) {
    // Hunk header
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`
    );

    // Hunk lines
    for (const line of hunk.lines) {
      const prefix =
        line.type === 'added'
          ? '+'
          : line.type === 'removed'
            ? '-'
            : ' ';
      lines.push(`${prefix}${line.content}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a frontmatter-specific diff
 */
export function generateFrontmatterDiff(
  oldContent: string,
  newContent: string
): FrontmatterDiff[] {
  const { frontmatter: oldFm } = parseFrontmatter(oldContent);
  const { frontmatter: newFm } = parseFrontmatter(newContent);

  const diffs: FrontmatterDiff[] = [];
  const allKeys = Array.from(new Set([...Object.keys(oldFm), ...Object.keys(newFm)]));

  for (const key of allKeys) {
    // Skip palace_version metadata
    if (key === 'palace_version') continue;

    const oldValue = oldFm[key];
    const newValue = newFm[key];

    if (oldValue === undefined && newValue !== undefined) {
      diffs.push({ field: key, oldValue, newValue, type: 'added' });
    } else if (oldValue !== undefined && newValue === undefined) {
      diffs.push({ field: key, oldValue, newValue, type: 'removed' });
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diffs.push({ field: key, oldValue, newValue, type: 'changed' });
    }
  }

  return diffs;
}

/**
 * Format frontmatter diff as readable text
 */
export function formatFrontmatterDiff(diffs: FrontmatterDiff[]): string {
  if (diffs.length === 0) {
    return '(no frontmatter changes)';
  }

  const lines: string[] = ['Frontmatter changes:'];

  for (const diff of diffs) {
    const formatValue = (v: unknown): string =>
      v === undefined ? '(not set)' : JSON.stringify(v);

    if (diff.type === 'added') {
      lines.push(`  + ${diff.field}: ${formatValue(diff.newValue)}`);
    } else if (diff.type === 'removed') {
      lines.push(`  - ${diff.field}: ${formatValue(diff.oldValue)}`);
    } else {
      lines.push(`  ~ ${diff.field}:`);
      lines.push(`    - ${formatValue(diff.oldValue)}`);
      lines.push(`    + ${formatValue(diff.newValue)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a summary of changes between versions
 */
export function generateChangeSummary(
  oldContent: string,
  newContent: string
): string {
  const contentDiff = generateDiff(oldContent, newContent);
  const fmDiff = generateFrontmatterDiff(oldContent, newContent);

  const parts: string[] = [];

  if (contentDiff.hasChanges) {
    parts.push(`${contentDiff.additions} additions, ${contentDiff.deletions} deletions`);
  }

  if (fmDiff.length > 0) {
    const added = fmDiff.filter((d) => d.type === 'added').length;
    const removed = fmDiff.filter((d) => d.type === 'removed').length;
    const changed = fmDiff.filter((d) => d.type === 'changed').length;

    const fmParts: string[] = [];
    if (added > 0) fmParts.push(`${added} added`);
    if (removed > 0) fmParts.push(`${removed} removed`);
    if (changed > 0) fmParts.push(`${changed} changed`);

    if (fmParts.length > 0) {
      parts.push(`frontmatter: ${fmParts.join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join('; ') : 'no changes detected';
}
