/**
 * Content analyzer for atomic note system
 *
 * Analyzes markdown content to determine if it exceeds atomic note limits.
 * Extracts sections, detects sub-concepts, and provides metrics.
 */

import type { AtomicConfig } from '../../types/index.js';
import type { ContentAnalysis, SectionInfo, SubConcept, PalaceAnnotation } from '../../types/atomic.js';
import { stripWikiLinks } from '../../utils/markdown.js';

/**
 * Default atomic configuration limits
 * Phase 018: Removed hub_filename - hub names are now derived from title
 */
const DEFAULT_LIMITS: AtomicConfig = {
  max_lines: 200,
  max_sections: 6,
  section_max_lines: 50,
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
 * Build a set of line numbers that are inside code blocks
 * This is used to skip headers inside code blocks during analysis
 */
function buildCodeBlockLineSet(lines: string[]): Set<number> {
  const codeBlockLines = new Set<number>();
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check for fenced code block markers (``` or ~~~)
    if (line.startsWith('```') || line.startsWith('~~~')) {
      codeBlockLines.add(i);
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.add(i);
    }
  }

  return codeBlockLines;
}

/**
 * Phase 022: Detect palace annotation in content following a section header
 * Looks for <!-- palace:keep --> or <!-- palace:split --> comments
 */
function detectAnnotation(lines: string[], sectionStartLine: number): PalaceAnnotation {
  // Check the next few lines after the section header for annotations
  for (let i = sectionStartLine + 1; i < Math.min(sectionStartLine + 5, lines.length); i++) {
    const line = lines[i]?.trim() ?? '';

    // Skip empty lines
    if (line === '') continue;

    // Check for palace annotations
    if (line.includes('<!-- palace:keep -->')) {
      return 'keep';
    }
    if (line.includes('<!-- palace:split -->')) {
      return 'split';
    }

    // Stop searching if we hit actual content (non-empty, non-annotation line)
    if (!line.startsWith('<!--')) {
      break;
    }
  }

  return null;
}

/**
 * Phase 022: Detect if a section contains template/example content
 * Template content patterns:
 * - Section titles containing "Example", "Template", "Sample"
 * - Content within <!-- template --> markers
 * - Sections that are primarily blockquotes (example content)
 */
function isTemplateSection(sectionTitle: string, lines: string[], startLine: number, endLine: number): boolean {
  // Check title for template indicators
  const templateTitlePatterns = [
    /example/i,
    /template/i,
    /sample/i,
    /placeholder/i,
    /demo/i,
  ];

  if (templateTitlePatterns.some(pattern => pattern.test(sectionTitle))) {
    return true;
  }

  // Check content for template markers
  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.includes('<!-- template') || line.includes('<!-- example')) {
      return true;
    }
  }

  // Check if content is primarily blockquotes (often used for examples)
  let blockquoteLines = 0;
  let totalContentLines = 0;

  for (let i = startLine + 1; i <= endLine && i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (line.length > 0) {
      totalContentLines++;
      if (line.startsWith('>')) {
        blockquoteLines++;
      }
    }
  }

  // If more than 70% is blockquotes, consider it template content
  if (totalContentLines > 3 && blockquoteLines / totalContentLines > 0.7) {
    return true;
  }

  return false;
}

/**
 * Extract H2 sections from content
 * Phase 022: Now code-block aware - ignores H2 headers inside code blocks
 * Phase 022: Now detects annotations and template content
 */
function extractSections(lines: string[]): SectionInfo[] {
  const sections: SectionInfo[] = [];
  let currentSection: SectionInfo | null = null;

  // Build set of lines inside code blocks to skip
  const codeBlockLines = buildCodeBlockLineSet(lines);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Skip lines inside code blocks - they're not real headers
    if (codeBlockLines.has(i)) {
      continue;
    }

    if (line.startsWith('## ') && !line.startsWith('### ')) {
      // End previous section and detect template content
      if (currentSection) {
        currentSection.endLine = i - 1;
        currentSection.lineCount = currentSection.endLine - currentSection.startLine + 1;
        // Phase 022: Detect template content for the completed section
        currentSection.isTemplateContent = isTemplateSection(
          currentSection.title,
          lines,
          currentSection.startLine,
          currentSection.endLine
        );
        sections.push(currentSection);
      }

      // Start new section (strip wiki-links from title)
      const title = stripWikiLinks(line.replace(/^##\s+/, '').trim());
      currentSection = {
        title,
        startLine: i,
        endLine: lines.length - 1,
        lineCount: 0,
        level: 2,
        // Phase 022: Detect annotation for this section
        annotation: detectAnnotation(lines, i),
      };
    }
  }

  // Close last section and detect template content
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    currentSection.lineCount = currentSection.endLine - currentSection.startLine + 1;
    // Phase 022: Detect template content for the last section
    currentSection.isTemplateContent = isTemplateSection(
      currentSection.title,
      lines,
      currentSection.startLine,
      currentSection.endLine
    );
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Detect sub-concepts within sections (H3+ headings with content)
 * Phase 022: Now code-block aware - ignores H3+ headers inside code blocks
 */
function detectSubConcepts(lines: string[], sections: SectionInfo[]): SubConcept[] {
  const subConcepts: SubConcept[] = [];
  const minContentLines = 5; // Minimum lines to be considered a sub-concept

  // Build set of lines inside code blocks to skip
  const codeBlockLines = buildCodeBlockLineSet(lines);

  let currentSubConcept: SubConcept | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Skip lines inside code blocks - they're not real headers
    if (codeBlockLines.has(i)) {
      continue;
    }

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

      // Start new sub-concept (strip wiki-links from title)
      currentSubConcept = {
        title: stripWikiLinks(headingMatch[2]?.trim() ?? ''),
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
 * Export the code block line set builder for use in splitter
 * Phase 022: Needed for code-block aware splitting
 */
export { buildCodeBlockLineSet };

/**
 * Check if content is primarily code
 */
export function isCodeHeavy(analysis: ContentAnalysis): boolean {
  const codeLines = analysis.codeBlocks.reduce((sum, cb) => sum + cb.lineCount, 0);
  return codeLines > analysis.lineCount * 0.5;
}

/**
 * Get the title from content (first H1 heading)
 * Strips wiki-link syntax from the extracted title
 */
export function extractTitle(content: string): string | null {
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      const rawTitle = line.replace(/^#\s+/, '').trim();
      return stripWikiLinks(rawTitle);
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
