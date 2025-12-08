/**
 * Content analyzer for atomic note system
 *
 * Analyzes markdown content to determine if it exceeds atomic note limits.
 * Extracts sections, detects sub-concepts, and provides metrics.
 */

import type { AtomicConfig } from '../../types/index.js';
import type { ContentAnalysis, SectionInfo, SubConcept } from '../../types/atomic.js';

/**
 * Default atomic configuration limits
 */
const DEFAULT_LIMITS: AtomicConfig = {
  max_lines: 200,
  max_sections: 6,
  section_max_lines: 50,
  hub_filename: '_index.md',
  auto_split: true,
};

/**
 * Analyze markdown content for atomic note metrics
 */
export function analyzeContent(
  content: string,
  config: Partial<AtomicConfig> = {}
): ContentAnalysis {
  const limits = { ...DEFAULT_LIMITS, ...config };

  // Separate frontmatter from body
  const { body, frontmatterLines } = separateFrontmatter(content);

  const lines = body.split('\n');
  const lineCount = lines.length;
  const wordCount = countWords(body);

  // Extract sections
  const sections = extractSections(lines);
  const sectionCount = sections.length;

  // Find large sections
  const largeSections = sections.filter(
    (s) => s.lineCount > (limits.section_max_lines ?? 50)
  );

  // Detect sub-concepts (H3+ with substantial content)
  const subConcepts = detectSubConcepts(lines, sections);

  // Identify code blocks
  const codeBlocks = extractCodeBlocks(lines);
  const codeBlockLines = codeBlocks.reduce((sum, cb) => sum + cb.lineCount, 0);

  // Calculate content-only lines (excluding code blocks)
  const contentLines = lineCount - codeBlockLines;

  return {
    lineCount,
    sectionCount,
    wordCount,
    contentLines,
    frontmatterLines,
    sections,
    largeSections: largeSections.map((s) => s.title),
    subConcepts,
    codeBlocks: codeBlocks.map((cb) => ({
      language: cb.language,
      lineCount: cb.lineCount,
      startLine: cb.startLine,
    })),
    limits,
  };
}

/**
 * Separate YAML frontmatter from markdown body
 */
function separateFrontmatter(content: string): { body: string; frontmatterLines: number } {
  const lines = content.split('\n');

  if (lines[0] !== '---') {
    return { body: content, frontmatterLines: 0 };
  }

  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { body: content, frontmatterLines: 0 };
  }

  const frontmatterLines = endIndex + 1;
  const body = lines.slice(endIndex + 1).join('\n').trim();

  return { body, frontmatterLines };
}

/**
 * Count words in content (excluding code blocks and links)
 */
function countWords(content: string): number {
  // Remove code blocks
  let text = content.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  text = text.replace(/`[^`]+`/g, '');
  // Remove wiki-links but keep display text
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
  // Remove markdown links
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Count words
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

/**
 * Extract H2 sections from content
 */
function extractSections(lines: string[]): SectionInfo[] {
  const sections: SectionInfo[] = [];
  let currentSection: SectionInfo | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.startsWith('## ') && !line.startsWith('### ')) {
      // End previous section
      if (currentSection) {
        currentSection.endLine = i - 1;
        currentSection.lineCount = currentSection.endLine - currentSection.startLine + 1;
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        title: line.replace(/^##\s+/, '').trim(),
        startLine: i,
        endLine: lines.length - 1,
        lineCount: 0,
        level: 2,
      };
    }
  }

  // Close last section
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    currentSection.lineCount = currentSection.endLine - currentSection.startLine + 1;
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Detect sub-concepts within sections (H3+ headings with content)
 */
function detectSubConcepts(lines: string[], sections: SectionInfo[]): SubConcept[] {
  const subConcepts: SubConcept[] = [];
  const minContentLines = 5; // Minimum lines to be considered a sub-concept

  let currentSubConcept: SubConcept | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check for H3+ headings
    const headingMatch = line.match(/^(#{3,6})\s+(.+)$/);

    if (headingMatch) {
      // End previous sub-concept
      if (currentSubConcept) {
        currentSubConcept.endLine = i - 1;
        currentSubConcept.lineCount = currentSubConcept.endLine - currentSubConcept.startLine + 1;

        if (currentSubConcept.lineCount >= minContentLines) {
          // Find parent section
          const parentSection = sections.find(
            (s) => s.startLine < currentSubConcept!.startLine && s.endLine >= currentSubConcept!.endLine
          );
          if (parentSection) {
            currentSubConcept.parentSection = parentSection.title;
          }
          subConcepts.push(currentSubConcept);
        }
      }

      // Start new sub-concept
      currentSubConcept = {
        title: headingMatch[2]?.trim() ?? '',
        level: headingMatch[1]?.length ?? 3,
        startLine: i,
        endLine: lines.length - 1,
        lineCount: 0,
      };
    }
  }

  // Close last sub-concept
  if (currentSubConcept) {
    currentSubConcept.endLine = lines.length - 1;
    currentSubConcept.lineCount = currentSubConcept.endLine - currentSubConcept.startLine + 1;

    if (currentSubConcept.lineCount >= minContentLines) {
      const parentSection = sections.find(
        (s) => s.startLine < currentSubConcept!.startLine && s.endLine >= currentSubConcept!.endLine
      );
      if (parentSection) {
        currentSubConcept.parentSection = parentSection.title;
      }
      subConcepts.push(currentSubConcept);
    }
  }

  return subConcepts;
}

/**
 * Extract code blocks with their sizes
 */
interface CodeBlockInfo {
  language: string;
  startLine: number;
  endLine: number;
  lineCount: number;
}

function extractCodeBlocks(lines: string[]): CodeBlockInfo[] {
  const codeBlocks: CodeBlockInfo[] = [];
  let inCodeBlock = false;
  let currentBlock: CodeBlockInfo | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Start code block
        inCodeBlock = true;
        const language = line.slice(3).trim();
        currentBlock = {
          language,
          startLine: i,
          endLine: -1,
          lineCount: 0,
        };
      } else {
        // End code block
        inCodeBlock = false;
        if (currentBlock) {
          currentBlock.endLine = i;
          currentBlock.lineCount = currentBlock.endLine - currentBlock.startLine + 1;
          codeBlocks.push(currentBlock);
          currentBlock = null;
        }
      }
    }
  }

  return codeBlocks;
}

/**
 * Check if content is primarily code
 */
export function isCodeHeavy(analysis: ContentAnalysis): boolean {
  const codeLines = analysis.codeBlocks.reduce((sum, cb) => sum + cb.lineCount, 0);
  return codeLines > analysis.lineCount * 0.5;
}

/**
 * Get the title from content (first H1 heading)
 */
export function extractTitle(content: string): string | null {
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      return line.replace(/^#\s+/, '').trim();
    }
  }

  return null;
}

/**
 * Extract all wiki-links from content
 */
export function extractWikiLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    if (match[1]) {
      links.push(match[1]);
    }
  }

  return [...new Set(links)];
}
