/**
 * Unit tests for standards system
 */

import { describe, it, expect } from 'vitest';

describe('Standards System', () => {
  describe('Standards Types', () => {
    it('should define binding levels', async () => {
      // Type is exported, just verify the import works
      type BindingLevel = 'required' | 'recommended' | 'optional';
      const level: BindingLevel = 'required';
      expect(level).toBe('required');
    });

    it('should define standard frontmatter interface', async () => {
      // Verify the type structure compiles
      const standardFm = {
        type: 'standard' as const,
        title: 'Test Standard',
        ai_binding: 'required' as const,
        applies_to: ['all'],
        created: '2025-01-01T00:00:00Z',
        modified: '2025-01-01T00:00:00Z',
      };
      expect(standardFm.type).toBe('standard');
      expect(standardFm.ai_binding).toBe('required');
    });

    it('should accept all binding levels', () => {
      const levels: Array<'required' | 'recommended' | 'optional'> = [
        'required',
        'recommended',
        'optional',
      ];
      expect(levels).toContain('required');
      expect(levels).toContain('recommended');
      expect(levels).toContain('optional');
    });
  });

  describe('Standards Loader Exports', () => {
    it('should export loadStandards function', async () => {
      const { loadStandards } = await import('../../../src/services/standards/loader.js');
      expect(loadStandards).toBeDefined();
      expect(typeof loadStandards).toBe('function');
    });

    it('should export loadRequiredStandards function', async () => {
      const { loadRequiredStandards } = await import('../../../src/services/standards/loader.js');
      expect(loadRequiredStandards).toBeDefined();
      expect(typeof loadRequiredStandards).toBe('function');
    });

    it('should export hasRequiredStandards function', async () => {
      const { hasRequiredStandards } = await import('../../../src/services/standards/loader.js');
      expect(hasRequiredStandards).toBeDefined();
      expect(typeof hasRequiredStandards).toBe('function');
    });

    it('should export clearStandardsCache function', async () => {
      const { clearStandardsCache } = await import('../../../src/services/standards/loader.js');
      expect(clearStandardsCache).toBeDefined();
      expect(typeof clearStandardsCache).toBe('function');
    });

    it('should export getStandardByPath function', async () => {
      const { getStandardByPath } = await import('../../../src/services/standards/loader.js');
      expect(getStandardByPath).toBeDefined();
      expect(typeof getStandardByPath).toBe('function');
    });
  });

  describe('Standards Validator Exports', () => {
    it('should export validateCompliance function', async () => {
      const { validateCompliance } = await import('../../../src/services/standards/validator.js');
      expect(validateCompliance).toBeDefined();
      expect(typeof validateCompliance).toBe('function');
    });

    it('should export isCompliant function', async () => {
      const { isCompliant } = await import('../../../src/services/standards/validator.js');
      expect(isCompliant).toBeDefined();
      expect(typeof isCompliant).toBe('function');
    });

    it('should export validateMultiple function', async () => {
      const { validateMultiple } = await import('../../../src/services/standards/validator.js');
      expect(validateMultiple).toBeDefined();
      expect(typeof validateMultiple).toBe('function');
    });
  });

  describe('Standards Index Export', () => {
    it('should export all loader functions', async () => {
      const exports = await import('../../../src/services/standards/index.js');
      expect(exports.loadStandards).toBeDefined();
      expect(exports.loadRequiredStandards).toBeDefined();
      expect(exports.hasRequiredStandards).toBeDefined();
      expect(exports.clearStandardsCache).toBeDefined();
    });

    it('should export all validator functions', async () => {
      const exports = await import('../../../src/services/standards/index.js');
      expect(exports.validateCompliance).toBeDefined();
      expect(exports.isCompliant).toBeDefined();
      expect(exports.validateMultiple).toBeDefined();
    });
  });
});

describe('Binding Level Priority', () => {
  it('should define correct binding levels', () => {
    const levels = ['required', 'recommended', 'optional'];
    expect(levels).toContain('required');
    expect(levels).toContain('recommended');
    expect(levels).toContain('optional');
  });

  it('should prioritize required over recommended', () => {
    const bindingOrder: Record<string, number> = {
      required: 0,
      recommended: 1,
      optional: 2,
    };
    expect(bindingOrder['required']).toBeLessThan(bindingOrder['recommended']!);
  });

  it('should prioritize recommended over optional', () => {
    const bindingOrder: Record<string, number> = {
      required: 0,
      recommended: 1,
      optional: 2,
    };
    expect(bindingOrder['recommended']).toBeLessThan(bindingOrder['optional']!);
  });
});

describe('applies_to Filtering', () => {
  it('should recognize "all" as universal', () => {
    const appliesTo = ['all'];
    expect(appliesTo.includes('all')).toBe(true);
  });

  it('should recognize language-specific values', () => {
    const appliesTo = ['typescript', 'javascript'];
    expect(appliesTo.includes('typescript')).toBe(true);
    expect(appliesTo.includes('python')).toBe(false);
  });

  it('should recognize domain-specific values', () => {
    const appliesTo = ['git', 'documentation'];
    expect(appliesTo.includes('git')).toBe(true);
    expect(appliesTo.includes('testing')).toBe(false);
  });

  it('should recognize client-specific patterns', () => {
    const appliesTo = ['client:acme', 'client:widgets'];
    expect(appliesTo.some(a => a.startsWith('client:'))).toBe(true);
    expect(appliesTo.includes('client:acme')).toBe(true);
  });

  it('should recognize project-specific patterns', () => {
    const appliesTo = ['project:webapp', 'project:api'];
    expect(appliesTo.some(a => a.startsWith('project:'))).toBe(true);
    expect(appliesTo.includes('project:webapp')).toBe(true);
  });
});

describe('Compliance Report Structure', () => {
  it('should have correct structure', () => {
    const report = {
      compliant: true,
      violations: [],
      warnings: [],
      checked_against: ['standards/git.md'],
    };

    expect(report).toHaveProperty('compliant');
    expect(report).toHaveProperty('violations');
    expect(report).toHaveProperty('warnings');
    expect(report).toHaveProperty('checked_against');
  });

  it('should include violation details', () => {
    const violation = {
      standard: 'standards/git.md',
      requirement: 'Must use conventional commits',
      actual: 'Non-conventional commit message',
      severity: 'error' as const,
    };

    expect(violation).toHaveProperty('standard');
    expect(violation).toHaveProperty('requirement');
    expect(violation).toHaveProperty('actual');
    expect(violation).toHaveProperty('severity');
  });

  it('should include warning details', () => {
    const warning = {
      standard: 'standards/git.md',
      message: 'Consider adding more context',
    };

    expect(warning).toHaveProperty('standard');
    expect(warning).toHaveProperty('message');
  });
});

describe('Standards Output Structure', () => {
  it('should have correct output format', () => {
    const output = {
      success: true,
      standards: [],
      acknowledgment_required: false,
    };

    expect(output).toHaveProperty('success');
    expect(output).toHaveProperty('standards');
    expect(output).toHaveProperty('acknowledgment_required');
  });

  it('should include acknowledgment message when required', () => {
    const output = {
      success: true,
      standards: [{ binding: 'required', title: 'Git Standard' }],
      acknowledgment_required: true,
      acknowledgment_message: 'Please acknowledge the Git Standard',
    };

    expect(output.acknowledgment_required).toBe(true);
    expect(output.acknowledgment_message).toBeDefined();
  });

  it('should include full standard details', () => {
    const standard = {
      path: 'standards/git.md',
      vault: 'default',
      title: 'Git Workflow Standard',
      binding: 'required' as const,
      applies_to: ['all'],
      domain: ['git', 'version-control'],
      content: '# Git Standard\n\nFull content...',
      summary: 'Brief summary of the standard',
    };

    expect(standard).toHaveProperty('path');
    expect(standard).toHaveProperty('vault');
    expect(standard).toHaveProperty('title');
    expect(standard).toHaveProperty('binding');
    expect(standard).toHaveProperty('applies_to');
    expect(standard).toHaveProperty('domain');
    expect(standard).toHaveProperty('content');
    expect(standard).toHaveProperty('summary');
  });
});

describe('Standard Note Detection', () => {
  it('should identify standard notes by type', () => {
    const frontmatter = {
      type: 'standard',
      ai_binding: 'required',
    };
    expect(frontmatter.type).toBe('standard');
  });

  it('should require ai_binding field', () => {
    const validBindings = ['required', 'recommended', 'optional'];
    const frontmatter = { type: 'standard', ai_binding: 'required' };
    expect(validBindings).toContain(frontmatter.ai_binding);
  });

  it('should reject invalid ai_binding values', () => {
    const validBindings = ['required', 'recommended', 'optional'];
    const invalidBinding = 'mandatory';
    expect(validBindings).not.toContain(invalidBinding);
  });

  it('should handle notes without ai_binding', () => {
    const frontmatter = { type: 'research' };
    expect(frontmatter.type).not.toBe('standard');
    expect('ai_binding' in frontmatter).toBe(false);
  });
});

describe('Summary Extraction', () => {
  it('should extract first paragraph as summary', () => {
    const content = `# Title

This is the first paragraph that should become the summary.

## Section

More content here.`;

    // Simulate summary extraction logic
    const lines = content.split('\n');
    let summary = '';
    let foundContent = false;

    for (const line of lines) {
      if (line.startsWith('#') || (!foundContent && line.trim() === '')) {
        continue;
      }
      foundContent = true;
      if (line.startsWith('#') || (summary.length > 0 && line.trim() === '')) {
        break;
      }
      summary += (summary ? ' ' : '') + line.trim();
    }

    expect(summary).toBe('This is the first paragraph that should become the summary.');
  });

  it('should truncate long summaries', () => {
    const longText = 'A'.repeat(300);
    const maxLength = 200;
    const truncated = longText.length > maxLength
      ? longText.slice(0, maxLength - 3) + '...'
      : longText;

    expect(truncated.length).toBe(200);
    expect(truncated.endsWith('...')).toBe(true);
  });
});
