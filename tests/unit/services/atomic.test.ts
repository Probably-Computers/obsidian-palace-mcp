/**
 * Unit tests for atomic note system
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeContent,
  isCodeHeavy,
  extractTitle,
  extractWikiLinks,
} from '../../../src/services/atomic/analyzer.js';
import {
  shouldSplit,
  needsSplit,
  analyzeForSplit,
} from '../../../src/services/atomic/decision.js';

describe('Content Analyzer', () => {
  describe('analyzeContent', () => {
    it('should count lines correctly', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const analysis = analyzeContent(content);
      expect(analysis.lineCount).toBe(3);
    });

    it('should handle frontmatter separately', () => {
      const content = `---
title: Test
---

# Test

Content here`;
      const analysis = analyzeContent(content);
      expect(analysis.frontmatterLines).toBe(3);
    });

    it('should extract H2 sections', () => {
      const content = `# Title

## Section 1

Content 1

## Section 2

Content 2`;
      const analysis = analyzeContent(content);
      expect(analysis.sectionCount).toBe(2);
      expect(analysis.sections[0]?.title).toBe('Section 1');
      expect(analysis.sections[1]?.title).toBe('Section 2');
    });

    it('should identify large sections', () => {
      const largeSection = Array(60).fill('Line').join('\n');
      const content = `# Title

## Small Section

Small content

## Large Section

${largeSection}`;
      const analysis = analyzeContent(content, { section_max_lines: 50 });
      expect(analysis.largeSections).toContain('Large Section');
      expect(analysis.largeSections).not.toContain('Small Section');
    });

    it('should detect sub-concepts', () => {
      const content = `# Title

## Section

### Sub-concept 1

Content here
More content
Even more content
Line 4
Line 5

### Sub-concept 2

Different content
More lines
Additional text
Another line
Final line`;
      const analysis = analyzeContent(content);
      expect(analysis.subConcepts.length).toBe(2);
      expect(analysis.subConcepts[0]?.title).toBe('Sub-concept 1');
    });

    it('should count words excluding code blocks', () => {
      const content = `Here are some words.

\`\`\`javascript
const code = 'should not count';
\`\`\`

More words here.`;
      const analysis = analyzeContent(content);
      // "Here are some words." = 4 words, "More words here." = 3 words
      expect(analysis.wordCount).toBe(7);
    });

    it('should extract code blocks', () => {
      const content = `# Title

\`\`\`javascript
const x = 1;
const y = 2;
\`\`\`

\`\`\`python
print("hello")
\`\`\``;
      const analysis = analyzeContent(content);
      expect(analysis.codeBlocks.length).toBe(2);
      expect(analysis.codeBlocks[0]?.language).toBe('javascript');
      expect(analysis.codeBlocks[1]?.language).toBe('python');
    });
  });

  describe('isCodeHeavy', () => {
    it('should return true for code-heavy content', () => {
      const content = `# Code Example

\`\`\`javascript
${Array(60).fill('const x = 1;').join('\n')}
\`\`\`

Brief explanation.`;
      const analysis = analyzeContent(content);
      expect(isCodeHeavy(analysis)).toBe(true);
    });

    it('should return false for text-heavy content', () => {
      const content = `# Documentation

This is a lot of text content without much code.
${Array(50).fill('Lorem ipsum dolor sit amet.').join('\n')}

\`\`\`javascript
const x = 1;
\`\`\``;
      const analysis = analyzeContent(content);
      expect(isCodeHeavy(analysis)).toBe(false);
    });
  });

  describe('extractTitle', () => {
    it('should extract H1 title', () => {
      const content = `# My Title

Content here`;
      expect(extractTitle(content)).toBe('My Title');
    });

    it('should return null if no H1 found', () => {
      const content = `## Section

Content`;
      expect(extractTitle(content)).toBeNull();
    });
  });

  describe('extractWikiLinks', () => {
    it('should extract wiki links', () => {
      const content = `Reference to [[Note 1]] and [[Note 2|Display]].`;
      const links = extractWikiLinks(content);
      expect(links).toContain('Note 1');
      expect(links).toContain('Note 2');
    });

    it('should deduplicate links', () => {
      const content = `[[Note]] appears twice: [[Note]]`;
      const links = extractWikiLinks(content);
      expect(links.length).toBe(1);
    });
  });
});

describe('Split Decision Engine', () => {
  describe('shouldSplit', () => {
    it('should not split small content', () => {
      const content = `# Small Note

## Section 1

Brief content.

## Section 2

More content.`;
      const decision = shouldSplit(content);
      expect(decision.shouldSplit).toBe(false);
      expect(decision.reason).toContain('within atomic limits');
    });

    it('should recommend split for content exceeding line limit', () => {
      const longContent = Array(250).fill('Line of content here.').join('\n');
      const content = `# Long Note

${longContent}`;
      const decision = shouldSplit(content);
      expect(decision.shouldSplit).toBe(true);
      expect(decision.violations.some((v) => v.type === 'lines')).toBe(true);
    });

    it('should recommend split for too many sections', () => {
      const sections = Array(8)
        .fill(null)
        .map((_, i) => `## Section ${i + 1}\n\nContent ${i + 1}`)
        .join('\n\n');
      const content = `# Many Sections

${sections}`;
      const decision = shouldSplit(content);
      expect(decision.shouldSplit).toBe(true);
      expect(decision.violations.some((v) => v.type === 'sections')).toBe(true);
    });

    it('should adjust limits for code-heavy content', () => {
      const codeContent = `\`\`\`javascript
${Array(180).fill('const x = 1;').join('\n')}
\`\`\``;
      const content = `# Code Documentation

${codeContent}

Brief explanation.`;
      // With code-heavy multiplier of 1.5, limit becomes 300 lines
      // 180 + some overhead < 300, so should not split
      const decision = shouldSplit(content);
      expect(decision.shouldSplit).toBe(false);
    });

    it('should recommend by_sections strategy for many sections', () => {
      const sections = Array(8)
        .fill(null)
        .map((_, i) => `## Section ${i + 1}\n\nContent ${i + 1}`)
        .join('\n\n');
      const content = `# Many Sections

${sections}`;
      const decision = shouldSplit(content);
      expect(decision.suggestedStrategy).toBe('by_sections');
    });
  });

  describe('needsSplit', () => {
    it('should return false for small content', () => {
      const content = '# Small\n\nBrief content.';
      expect(needsSplit(content)).toBe(false);
    });

    it('should return true for large content', () => {
      const content = `# Large\n\n${Array(250).fill('Line').join('\n')}`;
      expect(needsSplit(content)).toBe(true);
    });
  });

  describe('analyzeForSplit', () => {
    it('should return both analysis and decision', () => {
      const content = '# Test\n\n## Section\n\nContent';
      const result = analyzeForSplit(content);
      expect(result.analysis).toBeDefined();
      expect(result.decision).toBeDefined();
      expect(result.analysis.sectionCount).toBe(1);
      expect(result.decision.shouldSplit).toBe(false);
    });
  });
});

describe('Content Splitter', () => {
  // Note: We can't easily test splitContent without mocking filesystem
  // These tests focus on the exported helper functions

  it('should be importable', async () => {
    const { splitContent, validateSplitResult, updateLinksInContent } = await import(
      '../../../src/services/atomic/splitter.js'
    );
    expect(splitContent).toBeDefined();
    expect(validateSplitResult).toBeDefined();
    expect(updateLinksInContent).toBeDefined();
  });
});

describe('Hub Manager', () => {
  // Note: Hub manager tests require filesystem access
  // These tests focus on the exported helper functions

  it('should be importable', async () => {
    const { isHubPath, getHubPath } = await import(
      '../../../src/services/atomic/hub-manager.js'
    );
    expect(isHubPath).toBeDefined();
    expect(getHubPath).toBeDefined();
  });

  it('should identify hub paths via frontmatter type (Phase 018)', async () => {
    const { isHubPath } = await import('../../../src/services/atomic/hub-manager.js');
    // Phase 018: isHubPath now returns false by default - hub detection
    // should be done via frontmatter type check (type ending in '_hub')
    expect(isHubPath('folder/Kubernetes.md')).toBe(false);
    expect(isHubPath('folder/note.md')).toBe(false);
    // With explicit hubFilename parameter for backward compatibility
    expect(isHubPath('folder/custom-hub.md', 'custom-hub.md')).toBe(true);
  });

  it('should build hub paths from title (Phase 018)', async () => {
    const { getHubPath } = await import('../../../src/services/atomic/hub-manager.js');
    // Phase 018: getHubPath now requires a title parameter
    expect(getHubPath('technologies/kubernetes', 'Kubernetes')).toBe('technologies/kubernetes/Kubernetes.md');
    expect(getHubPath('folder', 'My Hub')).toBe('folder/My Hub.md');
  });
});

// Phase 022: Content-Aware Split Detection Tests
describe('Phase 022: Content-Aware Split Detection', () => {
  describe('Code block awareness', () => {
    it('should ignore H2 headers inside code blocks', () => {
      const content = `# Documentation

## Introduction

Some intro text.

\`\`\`markdown
## This Header Inside Code Block Should Not Create A Section

Example content in code block
\`\`\`

## Real Section

This is a real section.`;
      const analysis = analyzeContent(content);
      // Should only detect 2 real sections, not the one inside code block
      expect(analysis.sectionCount).toBe(2);
      expect(analysis.sections.map(s => s.title)).toEqual(['Introduction', 'Real Section']);
    });

    it('should handle tilde code blocks', () => {
      const content = `# Doc

## First

~~~markdown
## Fake Header
~~~

## Second`;
      const analysis = analyzeContent(content);
      expect(analysis.sectionCount).toBe(2);
    });
  });

  describe('Annotation detection', () => {
    it('should detect palace:keep annotation', () => {
      const content = `# Title

## Quick Reference
<!-- palace:keep -->
This should stay in hub.

## Details
This can be split out.`;
      const analysis = analyzeContent(content);
      expect(analysis.sections.length).toBe(2);
      expect(analysis.sections[0]?.annotation).toBe('keep');
      expect(analysis.sections[1]?.annotation).toBeNull();
    });

    it('should detect palace:split annotation', () => {
      const content = `# Title

## Overview

General info.

## Deep Dive
<!-- palace:split -->
This should definitely be split.`;
      const analysis = analyzeContent(content);
      expect(analysis.sections[1]?.annotation).toBe('split');
    });

    it('should handle annotation with empty lines before it', () => {
      const content = `# Title

## Section

<!-- palace:keep -->

Content after annotation.`;
      const analysis = analyzeContent(content);
      expect(analysis.sections[0]?.annotation).toBe('keep');
    });
  });

  describe('Template content detection', () => {
    it('should detect sections with Example in title', () => {
      const content = `# PR Template

## Description

Fill in description.

## Example Usage

> Example: Your PR description goes here`;
      const analysis = analyzeContent(content);
      expect(analysis.sections.find(s => s.title === 'Example Usage')?.isTemplateContent).toBe(true);
    });

    it('should detect sections with Template in title', () => {
      const content = `# Standard

## Requirements

List requirements.

## Template Response

> Your response format...`;
      const analysis = analyzeContent(content);
      expect(analysis.sections.find(s => s.title === 'Template Response')?.isTemplateContent).toBe(true);
    });

    it('should detect sections that are primarily blockquotes', () => {
      const content = `# Guide

## Format

> Line 1
> Line 2
> Line 3
> Line 4
> Line 5`;
      const analysis = analyzeContent(content);
      // More than 70% blockquotes with more than 3 content lines
      expect(analysis.sections[0]?.isTemplateContent).toBe(true);
    });

    it('should detect template markers in content', () => {
      const content = `# Doc

## Section

<!-- template-start -->
Example template content here
<!-- template-end -->`;
      const analysis = analyzeContent(content);
      expect(analysis.sections[0]?.isTemplateContent).toBe(true);
    });
  });
});

describe('Phase 022: Content Splitter Integration', () => {
  it('should keep sections with palace:keep annotation in hub', async () => {
    const { splitBySections } = await import('../../../src/services/atomic/splitter.js');

    const content = `# My Document

Intro content.

## Quick Reference
<!-- palace:keep -->
This stays in hub.

## Details

Details that can be split.

## More Details

More content.`;

    const analysis = analyzeContent(content);
    const result = splitBySections(content, analysis, {
      targetDir: 'test',
      title: 'My Document',
    });

    // Quick Reference should be in hub, not as a child
    expect(result.children.length).toBe(2); // Only Details and More Details
    expect(result.children.map(c => c.title)).toContain('My Document - Details');
    expect(result.children.map(c => c.title)).toContain('My Document - More Details');
    expect(result.children.map(c => c.title)).not.toContain('Quick Reference');

    // Hub content should include Quick Reference section
    expect(result.hub.content).toContain('## Quick Reference');
  });

  it('should keep template sections in hub', async () => {
    const { splitBySections } = await import('../../../src/services/atomic/splitter.js');

    const content = `# Template Doc

## Overview

Overview content here.

## Example Format

> Sample format line 1
> Sample format line 2
> Sample format line 3
> Sample format line 4
> Sample format line 5

## Implementation

Implementation details.`;

    const analysis = analyzeContent(content);
    const result = splitBySections(content, analysis, {
      targetDir: 'test',
      title: 'Template Doc',
    });

    // Example Format (template content) should stay in hub
    expect(result.children.map(c => c.title)).not.toContain('Template Doc - Example Format');
    expect(result.hub.content).toContain('## Example Format');
  });

  it('should respect hub_sections configuration', async () => {
    const { splitBySections } = await import('../../../src/services/atomic/splitter.js');

    const content = `# Standard

## Summary

Brief summary.

## Requirements

Detailed requirements.

## Implementation

Implementation guide.`;

    const analysis = analyzeContent(content);
    const result = splitBySections(content, analysis, {
      targetDir: 'test',
      title: 'Standard',
      hubSections: ['Summary'], // Keep Summary in hub
    });

    // Summary should stay in hub
    expect(result.children.map(c => c.title)).not.toContain('Standard - Summary');
    expect(result.hub.content).toContain('## Summary');

    // Requirements and Implementation should be children
    expect(result.children.map(c => c.title)).toContain('Standard - Requirements');
    expect(result.children.map(c => c.title)).toContain('Standard - Implementation');
  });

  it('should use parent-prefixed child filenames and Knowledge Map links', async () => {
    const { splitBySections } = await import('../../../src/services/atomic/splitter.js');

    const content = `# Kubernetes

Overview of Kubernetes.

## Architecture

Control plane and nodes.

## Networking

Pod networking and services.`;

    const analysis = analyzeContent(content);
    const result = splitBySections(content, analysis, {
      targetDir: 'infrastructure/kubernetes',
      title: 'Kubernetes',
    });

    // Children should have prefixed titles
    expect(result.children.length).toBe(2);
    expect(result.children[0]?.title).toBe('Kubernetes - Architecture');
    expect(result.children[1]?.title).toBe('Kubernetes - Networking');

    // Children should have prefixed filenames in relativePath
    expect(result.children[0]?.relativePath).toBe('infrastructure/kubernetes/Kubernetes - Architecture.md');
    expect(result.children[1]?.relativePath).toBe('infrastructure/kubernetes/Kubernetes - Networking.md');

    // Knowledge Map links should use prefixed titles
    expect(result.hub.content).toContain('[[Kubernetes - Architecture]]');
    expect(result.hub.content).toContain('[[Kubernetes - Networking]]');
  });

  it('should handle multiple hub_sections patterns', async () => {
    const { splitBySections } = await import('../../../src/services/atomic/splitter.js');

    const content = `# Doc

## Quick Reference

Quick ref content.

## Overview

Overview content.

## Details

Details here.`;

    const analysis = analyzeContent(content);
    const result = splitBySections(content, analysis, {
      targetDir: 'test',
      title: 'Doc',
      hubSections: ['Quick Reference', 'Overview'],
    });

    // Both should stay in hub
    expect(result.children.length).toBe(1);
    expect(result.children[0]?.title).toBe('Doc - Details');
  });
});
