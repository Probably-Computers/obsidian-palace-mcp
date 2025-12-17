/**
 * Content splitter for atomic note system
 *
 * Splits large content into hub + children structure while preserving links.
 *
 * Phase 018: Uses title-style filenames (Obsidian-native)
 * - Hub filename = sanitized title (e.g., "Green Peppers.md")
 * - Child filename = sanitized section title (e.g., "Climate Requirements.md")
 */

import { join, basename } from 'path';
import type {
  ContentAnalysis,
  SectionInfo,
  SplitResult,
  SplitOptions,
  HubContent,
  ChildContent,
  HubFrontmatter,
  ChildFrontmatter,
  LinkUpdate,
} from '../../types/atomic.js';
import { analyzeContent, buildCodeBlockLineSet } from './analyzer.js';
import { shouldSplit } from './decision.js';
import { titleToFilename } from '../../utils/slugify.js';
import { stripWikiLinks } from '../../utils/markdown.js';

/**
 * Phase 022: Check if a section should stay in hub (not be split out)
 * A section stays in hub if:
 * - It has <!-- palace:keep --> annotation
 * - It contains template/example content
 * - Its title matches a hub_sections pattern (case-insensitive)
 */
function shouldKeepInHub(section: SectionInfo, hubSections: string[] = []): boolean {
  // Check for keep annotation
  if (section.annotation === 'keep') {
    return true;
  }

  // Check for template content
  if (section.isTemplateContent) {
    return true;
  }

  // Check against hub_sections config (case-insensitive match)
  const sectionTitleLower = section.title.toLowerCase();
  for (const hubSection of hubSections) {
    if (sectionTitleLower.includes(hubSection.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Split content based on the recommended strategy
 */
export function splitContent(
  content: string,
  options: SplitOptions
): SplitResult {
  const decision = shouldSplit(content);
  const analysis = analyzeContent(content);

  // Choose the appropriate split function
  switch (options.strategy ?? decision.suggestedStrategy) {
    case 'by_sections':
      return splitBySections(content, analysis, options);
    case 'by_large_sections':
      return splitByLargeSections(content, analysis, options);
    case 'by_sub_concepts':
      return splitBySubConcepts(content, analysis, options);
    case 'hierarchical':
      return splitHierarchical(content, analysis, options);
    default:
      return splitBySections(content, analysis, options);
  }
}

/**
 * Split content by H2 sections
 * Phase 018: Uses title-style filenames for hub and children
 * Phase 022: Code-block aware intro extraction, respects annotations and hub_sections
 */
export function splitBySections(
  content: string,
  analysis: ContentAnalysis,
  options: SplitOptions
): SplitResult {
  const lines = stripFrontmatter(content).split('\n');
  const { title, targetDir, hubSections = [] } = options;

  // Clean the title for use in filenames
  const cleanTitle = stripWikiLinks(title);
  const hubFilename = titleToFilename(cleanTitle);

  // Build set of lines inside code blocks (Phase 022)
  const codeBlockLines = buildCodeBlockLineSet(lines);

  // Extract introduction (content before first real H2, not in code blocks)
  const introLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check if this is a real H2 (not in a code block)
    if (!codeBlockLines.has(i) && line.startsWith('## ') && !line.startsWith('### ')) {
      break;
    }
    // Skip the H1 title if present at line 0
    if (line.startsWith('# ') && !line.startsWith('## ') && i === 0) {
      continue;
    }
    introLines.push(line);
  }

  // Phase 022: Separate sections into "keep in hub" and "extract to children"
  const sectionsToKeep: SectionInfo[] = [];
  const sectionsToExtract: SectionInfo[] = [];

  for (const section of analysis.sections) {
    if (shouldKeepInHub(section, hubSections)) {
      sectionsToKeep.push(section);
    } else {
      sectionsToExtract.push(section);
    }
  }

  // Build hub content with kept sections included
  const keptSectionsContent = sectionsToKeep.map(section => {
    const sectionLines = lines.slice(section.startLine, section.endLine + 1);
    return sectionLines.join('\n');
  }).join('\n\n');

  // Combine intro and kept sections for hub
  const hubIntroContent = introLines.join('\n').trim();
  const fullHubContent = keptSectionsContent
    ? `${hubIntroContent}\n\n${keptSectionsContent}`
    : hubIntroContent;

  // Build hub content (pass only extracted sections for the Knowledge Map)
  const hub = buildHubContent(
    cleanTitle,
    fullHubContent,
    sectionsToExtract,
    targetDir,
    hubFilename,
    options
  );

  // Build children from sections to extract
  const children: ChildContent[] = [];
  const linksUpdated: LinkUpdate[] = [];
  const hubPath = join(targetDir, hubFilename);

  for (const section of sectionsToExtract) {
    const sectionLines = lines.slice(section.startLine, section.endLine + 1);
    const sectionContent = sectionLines.join('\n');

    // Create child note with title-style filename
    const cleanSectionTitle = stripWikiLinks(section.title);
    const childFilename = titleToFilename(cleanSectionTitle);
    const childPath = join(targetDir, childFilename);

    const child = buildChildContent(
      cleanSectionTitle,
      sectionContent,
      childPath,
      hubPath,
      cleanSectionTitle,
      options
    );

    children.push(child);

    // Track link updates
    linksUpdated.push({
      fromPath: hubPath,
      originalTarget: cleanTitle,
      newTarget: childPath,
    });
  }

  // Update hub with children links
  hub.content = updateHubWithChildren(hub.content, children);

  return { hub, children, linksUpdated };
}

/**
 * Split by extracting large sections only
 * Phase 018: Uses title-style filenames for hub and children
 * Phase 022: Respects annotations and hub_sections
 */
export function splitByLargeSections(
  content: string,
  analysis: ContentAnalysis,
  options: SplitOptions
): SplitResult {
  const lines = stripFrontmatter(content).split('\n');
  const { title, targetDir, hubSections = [] } = options;

  // Clean the title for use in filenames
  const cleanTitle = stripWikiLinks(title);
  const hubFilename = titleToFilename(cleanTitle);

  // Find sections to extract (only large ones that aren't marked to keep)
  const largeSectionTitles = new Set(analysis.largeSections);
  const sectionsToExtract = analysis.sections.filter((s) =>
    largeSectionTitles.has(s.title) && !shouldKeepInHub(s, hubSections)
  );
  const sectionsToKeep = analysis.sections.filter(
    (s) => !largeSectionTitles.has(s.title) || shouldKeepInHub(s, hubSections)
  );

  // Build retained content
  const retainedLines: string[] = [];

  // Add intro (before first section)
  const firstSectionStart = analysis.sections[0]?.startLine ?? lines.length;
  for (let i = 0; i < firstSectionStart; i++) {
    const line = lines[i] ?? '';
    if (!line.startsWith('# ')) {
      retainedLines.push(line);
    }
  }

  // Add kept sections
  for (const section of sectionsToKeep) {
    const sectionLines = lines.slice(section.startLine, section.endLine + 1);
    retainedLines.push('', ...sectionLines);
  }

  // Build hub
  const hub = buildHubContent(
    cleanTitle,
    retainedLines.join('\n').trim(),
    sectionsToExtract,
    targetDir,
    hubFilename,
    options
  );

  // Build children from extracted sections
  const children: ChildContent[] = [];
  const linksUpdated: LinkUpdate[] = [];
  const hubPath = join(targetDir, hubFilename);

  for (const section of sectionsToExtract) {
    const sectionLines = lines.slice(section.startLine, section.endLine + 1);
    const sectionContent = sectionLines.join('\n');

    // Create child note with title-style filename
    const cleanSectionTitle = stripWikiLinks(section.title);
    const childFilename = titleToFilename(cleanSectionTitle);
    const childPath = join(targetDir, childFilename);

    const child = buildChildContent(
      cleanSectionTitle,
      sectionContent,
      childPath,
      hubPath,
      cleanSectionTitle,
      options
    );

    children.push(child);
  }

  // Update hub with children links
  hub.content = updateHubWithChildren(hub.content, children);

  return { hub, children, linksUpdated };
}

/**
 * Split by sub-concepts (H3+ headings)
 * Phase 018: Uses title-style filenames for hub and children
 */
export function splitBySubConcepts(
  content: string,
  analysis: ContentAnalysis,
  options: SplitOptions
): SplitResult {
  const lines = stripFrontmatter(content).split('\n');
  const { title, targetDir } = options;

  // Clean the title for use in filenames
  const cleanTitle = stripWikiLinks(title);
  const hubFilename = titleToFilename(cleanTitle);

  // Group sub-concepts by parent section
  const groupedConcepts = new Map<string, typeof analysis.subConcepts>();

  for (const subConcept of analysis.subConcepts) {
    const parent = subConcept.parentSection ?? 'Overview';
    const existing = groupedConcepts.get(parent) ?? [];
    existing.push(subConcept);
    groupedConcepts.set(parent, existing);
  }

  // Build hub with section summaries
  const hubLines: string[] = [`# ${cleanTitle}`, ''];

  // Add intro (before first section)
  const firstSectionStart = analysis.sections[0]?.startLine ?? lines.length;
  for (let i = 0; i < firstSectionStart; i++) {
    const line = lines[i] ?? '';
    if (!line.startsWith('# ')) {
      hubLines.push(line);
    }
  }

  const children: ChildContent[] = [];
  const linksUpdated: LinkUpdate[] = [];
  const hubPath = join(targetDir, hubFilename);

  // Process each sub-concept
  for (const subConcept of analysis.subConcepts) {
    const subConceptLines = lines.slice(subConcept.startLine, subConcept.endLine + 1);
    const subConceptContent = subConceptLines.join('\n');

    // Create child note with title-style filename
    const cleanSubConceptTitle = stripWikiLinks(subConcept.title);
    const childFilename = titleToFilename(cleanSubConceptTitle);
    const childPath = join(targetDir, childFilename);

    // Promote heading to H2 for child note
    const promotedContent = subConceptContent.replace(
      /^#{3,6}\s+/,
      '## '
    );

    const child = buildChildContent(
      cleanSubConceptTitle,
      promotedContent,
      childPath,
      hubPath,
      cleanSubConceptTitle,
      options
    );

    children.push(child);
  }

  const now = new Date().toISOString();
  const hubFrontmatter: HubFrontmatter = {
    type: `${options.originalFrontmatter?.type ?? 'research'}_hub`,
    title: cleanTitle,
    status: 'active',
    children_count: children.length,
    domain: options.domain,
    created: (options.originalFrontmatter?.created as string) ?? now,
    modified: now,
    palace: {
      version: 1,
      ...(options.layer ? { layer: options.layer } : {}),
    },
  };

  const hub: HubContent = {
    title: cleanTitle,
    relativePath: join(targetDir, hubFilename),
    content: hubLines.join('\n'),
    frontmatter: hubFrontmatter,
  };

  // Update hub with children links
  hub.content = updateHubWithChildren(hub.content, children);

  return { hub, children, linksUpdated };
}

/**
 * Create hierarchical structure with sub-hubs
 */
export function splitHierarchical(
  content: string,
  analysis: ContentAnalysis,
  options: SplitOptions
): SplitResult {
  // For now, delegate to section-based split
  // In future, this could create nested hub structures
  return splitBySections(content, analysis, options);
}

/**
 * Build hub content structure
 */
function buildHubContent(
  title: string,
  introContent: string,
  sections: SectionInfo[],
  targetDir: string,
  hubFilename: string,
  options: SplitOptions
): HubContent {
  const now = new Date().toISOString();

  const frontmatter: HubFrontmatter = {
    type: `${options.originalFrontmatter?.type ?? 'research'}_hub`,
    title,
    status: 'active',
    children_count: sections.length,
    domain: options.domain,
    created: (options.originalFrontmatter?.created as string) ?? now,
    modified: now,
    palace: {
      version: 1,
      ...(options.layer ? { layer: options.layer } : {}),
    },
  };

  // Preserve additional original frontmatter
  if (options.originalFrontmatter) {
    const preserve = ['tags', 'aliases', 'source', 'confidence'];
    for (const key of preserve) {
      if (options.originalFrontmatter[key] !== undefined) {
        frontmatter[key] = options.originalFrontmatter[key];
      }
    }
  }

  // Strip wiki-links from title to prevent heading corruption
  const cleanTitle = stripWikiLinks(title);

  const hubContent = `# ${cleanTitle}

${introContent}

## Knowledge Map

`;

  return {
    title: cleanTitle,
    relativePath: join(targetDir, hubFilename),
    content: hubContent,
    frontmatter,
  };
}

/**
 * Build child content structure
 * Phase 018: No parent field in frontmatter - use inline links instead (Zettelkasten style)
 */
function buildChildContent(
  title: string,
  sectionContent: string,
  childPath: string,
  hubPath: string,
  fromSection: string,
  options: SplitOptions
): ChildContent {
  const now = new Date().toISOString();

  // Strip wiki-links from title to prevent heading corruption
  const cleanTitle = stripWikiLinks(title);

  // Convert section heading to H1 and strip any wiki-links from it
  let processedContent = sectionContent;
  if (sectionContent.startsWith('## ')) {
    const lines = sectionContent.split('\n');
    // Replace ## with # and strip any wiki-links from the heading
    const headingText = (lines[0] ?? '').replace(/^##\s+/, '');
    lines[0] = `# ${stripWikiLinks(headingText)}`;
    processedContent = lines.join('\n');
  }

  // Phase 018: No parent field - use inline links instead (Zettelkasten style)
  const frontmatter: ChildFrontmatter = {
    type: (options.originalFrontmatter?.type as string) ?? 'research',
    title: cleanTitle,
    status: 'active',
    domain: options.domain,
    created: (options.originalFrontmatter?.created as string) ?? now,
    modified: now,
    palace: {
      version: 1,
      ...(options.layer ? { layer: options.layer } : {}),
    },
  };

  return {
    title: cleanTitle,
    relativePath: childPath,
    content: processedContent,
    frontmatter,
    fromSection,
  };
}

/**
 * Update hub content with links to children
 * Phase 018: With title-style filenames, we can use title directly as link
 */
function updateHubWithChildren(
  hubContent: string,
  children: ChildContent[]
): string {
  const childLinks = children.map((child) => {
    // With title-style filenames, the filename (without .md) IS the title
    // So [[Climate Requirements]] links to "Climate Requirements.md"
    return `- [[${child.title}]]`;
  });

  return `${hubContent}
${childLinks.join('\n')}

## Related

`;
}

/**
 * Strip frontmatter from content
 */
function stripFrontmatter(content: string): string {
  const lines = content.split('\n');

  if (lines[0] !== '---') {
    return content;
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return content;
  }

  return lines.slice(endIndex + 1).join('\n').trim();
}

/**
 * Update wiki-links in content to point to new locations
 */
export function updateLinksInContent(
  content: string,
  linkUpdates: LinkUpdate[]
): string {
  let updated = content;

  for (const update of linkUpdates) {
    // Update [[target]] and [[target|display]] formats
    const escapedTarget = update.originalTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(
      `\\[\\[${escapedTarget}(\\|[^\\]]+)?\\]\\]`,
      'g'
    );

    updated = updated.replace(linkRegex, (match, display) => {
      const newTarget = basename(update.newTarget, '.md');
      return display ? `[[${newTarget}${display}]]` : `[[${newTarget}]]`;
    });
  }

  return updated;
}

/**
 * Check if splitting would result in valid atomic notes
 */
export function validateSplitResult(result: SplitResult, maxLines: number = 200): boolean {
  // Check hub
  const hubLines = result.hub.content.split('\n').length;
  if (hubLines > 150) {
    return false;
  }

  // Check children
  for (const child of result.children) {
    const childLines = child.content.split('\n').length;
    if (childLines > maxLines) {
      return false;
    }
  }

  return true;
}
