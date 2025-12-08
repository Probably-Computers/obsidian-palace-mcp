/**
 * Content splitter for atomic note system
 *
 * Splits large content into hub + children structure while preserving links.
 */

import { join, dirname, basename } from 'path';
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
import { analyzeContent } from './analyzer.js';
import { shouldSplit } from './decision.js';
import { slugify } from '../../utils/slugify.js';

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
 */
export function splitBySections(
  content: string,
  analysis: ContentAnalysis,
  options: SplitOptions
): SplitResult {
  const lines = stripFrontmatter(content).split('\n');
  const { title, targetDir, hubFilename = '_index.md' } = options;

  // Extract introduction (content before first H2)
  const introLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      break;
    }
    // Skip the H1 title if present
    if (!line.startsWith('# ') || i > 0) {
      introLines.push(line);
    }
  }

  // Build hub content
  const hub = buildHubContent(
    title,
    introLines.join('\n').trim(),
    analysis.sections,
    targetDir,
    hubFilename,
    options
  );

  // Build children from sections
  const children: ChildContent[] = [];
  const linksUpdated: LinkUpdate[] = [];

  for (const section of analysis.sections) {
    const sectionLines = lines.slice(section.startLine, section.endLine + 1);
    const sectionContent = sectionLines.join('\n');

    // Create child note
    const childSlug = slugify(section.title);
    const childPath = join(targetDir, `${childSlug}.md`);
    const hubPath = join(targetDir, hubFilename);

    const child = buildChildContent(
      section.title,
      sectionContent,
      childPath,
      hubPath,
      section.title,
      options
    );

    children.push(child);

    // Track link updates
    linksUpdated.push({
      fromPath: hubPath,
      originalTarget: title,
      newTarget: childPath,
    });
  }

  // Update hub with children links
  hub.content = updateHubWithChildren(hub.content, children);

  return { hub, children, linksUpdated };
}

/**
 * Split by extracting large sections only
 */
export function splitByLargeSections(
  content: string,
  analysis: ContentAnalysis,
  options: SplitOptions
): SplitResult {
  const lines = stripFrontmatter(content).split('\n');
  const { title, targetDir, hubFilename = '_index.md' } = options;

  // Find sections to extract (only large ones)
  const largeSectionTitles = new Set(analysis.largeSections);
  const sectionsToExtract = analysis.sections.filter((s) =>
    largeSectionTitles.has(s.title)
  );
  const sectionsToKeep = analysis.sections.filter(
    (s) => !largeSectionTitles.has(s.title)
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
    title,
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

    const childSlug = slugify(section.title);
    const childPath = join(targetDir, `${childSlug}.md`);

    const child = buildChildContent(
      section.title,
      sectionContent,
      childPath,
      hubPath,
      section.title,
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
 */
export function splitBySubConcepts(
  content: string,
  analysis: ContentAnalysis,
  options: SplitOptions
): SplitResult {
  const lines = stripFrontmatter(content).split('\n');
  const { title, targetDir, hubFilename = '_index.md' } = options;

  // Group sub-concepts by parent section
  const groupedConcepts = new Map<string, typeof analysis.subConcepts>();

  for (const subConcept of analysis.subConcepts) {
    const parent = subConcept.parentSection ?? 'Overview';
    const existing = groupedConcepts.get(parent) ?? [];
    existing.push(subConcept);
    groupedConcepts.set(parent, existing);
  }

  // Build hub with section summaries
  const hubLines: string[] = [`# ${title}`, ''];

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

    const childSlug = slugify(subConcept.title);
    const childPath = join(targetDir, `${childSlug}.md`);

    // Promote heading to H2 for child note
    const promotedContent = subConceptContent.replace(
      /^#{3,6}\s+/,
      '## '
    );

    const child = buildChildContent(
      subConcept.title,
      promotedContent,
      childPath,
      hubPath,
      subConcept.title,
      options
    );

    children.push(child);
  }

  const now = new Date().toISOString();
  const hubFrontmatter: HubFrontmatter = {
    type: `${options.originalFrontmatter?.type ?? 'research'}_hub`,
    title,
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
    title,
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

  const hubContent = `# ${title}

${introContent}

## Knowledge Map

`;

  return {
    title,
    relativePath: join(targetDir, hubFilename),
    content: hubContent,
    frontmatter,
  };
}

/**
 * Build child content structure
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

  // Convert section heading to H1
  let processedContent = sectionContent;
  if (sectionContent.startsWith('## ')) {
    const lines = sectionContent.split('\n');
    lines[0] = (lines[0] ?? '').replace(/^##\s+/, '# ');
    processedContent = lines.join('\n');
  }

  const frontmatter: ChildFrontmatter = {
    type: (options.originalFrontmatter?.type as string) ?? 'research',
    title,
    parent: `[[${basename(dirname(hubPath))}/${basename(hubPath, '.md')}]]`,
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
    title,
    relativePath: childPath,
    content: processedContent,
    frontmatter,
    fromSection,
  };
}

/**
 * Update hub content with links to children
 */
function updateHubWithChildren(
  hubContent: string,
  children: ChildContent[]
): string {
  const childLinks = children.map((child) => {
    const relativePath = basename(child.relativePath, '.md');
    return `- [[${relativePath}|${child.title}]]`;
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
