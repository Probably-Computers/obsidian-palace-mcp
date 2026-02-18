/**
 * Work item parser (Phase 031)
 *
 * Extracts checklist work items from markdown content,
 * including wiki-links and annotation metadata.
 */

export interface WorkItem {
  checked: boolean;
  title: string;
  linked_note?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  due?: string;
  blocked_by?: string;
  category?: string;
  raw: string;
}

export interface WorkItemSummary {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  items: WorkItem[];
}

const CHECKLIST_RE = /^(\s*)- \[([ xX])\] (.+)$/gm;
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/;
const ANNOTATION_RE = /\[(\w+):([^\]]+)\]/g;

/**
 * Parse work items from markdown content
 */
export function parseWorkItems(content: string): WorkItem[] {
  const items: WorkItem[] = [];

  let match: RegExpExecArray | null;
  CHECKLIST_RE.lastIndex = 0;

  while ((match = CHECKLIST_RE.exec(content)) !== null) {
    const checked = match[2] !== ' ';
    const rawText = match[3]!;
    const raw = match[0]!;

    // Extract wiki-link
    const linkMatch = rawText.match(WIKILINK_RE);
    const linked_note = linkMatch ? linkMatch[1] : undefined;

    // Extract annotations
    const annotations: Record<string, string> = {};
    let textWithoutAnnotations = rawText;
    ANNOTATION_RE.lastIndex = 0;
    let annoMatch: RegExpExecArray | null;
    while ((annoMatch = ANNOTATION_RE.exec(rawText)) !== null) {
      annotations[annoMatch[1]!.toLowerCase()] = annoMatch[2]!.trim();
    }
    // Remove annotations from text
    textWithoutAnnotations = textWithoutAnnotations.replace(ANNOTATION_RE, '').trim();

    // Remove wiki-link markup from title (keep display text)
    textWithoutAnnotations = textWithoutAnnotations
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/, '$2')
      .replace(/\[\[([^\]|]+)\]\]/, '$1');

    // Clean up separator between wiki-link and description
    const title = textWithoutAnnotations.replace(/\s+-\s+/, ' - ').replace(/\s{2,}/g, ' ').trim();

    const item: WorkItem = { checked, title, raw };
    if (linked_note) item.linked_note = linked_note;
    const priority = annotations.priority;
    if (priority === 'critical' || priority === 'high' || priority === 'medium' || priority === 'low') {
      item.priority = priority;
    }
    if (annotations.due) item.due = annotations.due;
    if (annotations.blocked_by) item.blocked_by = annotations.blocked_by;
    if (annotations.category) item.category = annotations.category;

    items.push(item);
  }

  return items;
}

/**
 * Summarize work items into counts
 */
export function summarizeWorkItems(items: WorkItem[]): WorkItemSummary {
  const done = items.filter((i) => i.checked).length;
  const blocked = items.filter((i) => !i.checked && i.blocked_by).length;
  const in_progress = items.length - done - blocked;

  return {
    total: items.length,
    done,
    in_progress,
    blocked,
    items,
  };
}
