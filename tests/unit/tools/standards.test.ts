/**
 * Tests for palace_standards and palace_standards_validate tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/standards/index.js', () => ({
  loadStandards: vi.fn(),
}));

vi.mock('../../../src/services/standards/validator.js', () => ({
  validateCompliance: vi.fn(),
}));

import { standardsHandler, standardsValidateHandler } from '../../../src/tools/standards.js';
import { loadStandards } from '../../../src/services/standards/index.js';

describe('palace_standards tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all standards with defaults', async () => {
    (loadStandards as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        path: 'standards/git.md',
        vault: 'test',
        title: 'Git Workflow',
        binding: 'required',
        applies_to: ['all'],
        domain: ['git'],
        content: '# Git Workflow\n\nFollow conventional commits.',
        summary: 'Git workflow standard',
      },
    ]);

    const result = await standardsHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.standards).toHaveLength(1);
    expect(result.data.standards[0].title).toBe('Git Workflow');
    expect(result.data.acknowledgment_required).toBe(true);
    expect(result.data.acknowledgment_message).toContain('Git Workflow');
  });

  it('no acknowledgment when no required standards', async () => {
    (loadStandards as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        path: 'standards/tips.md',
        vault: 'test',
        title: 'Coding Tips',
        binding: 'optional',
        applies_to: ['all'],
        domain: ['code'],
        content: '# Tips',
        summary: 'Coding tips',
      },
    ]);

    const result = await standardsHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.acknowledgment_required).toBe(false);
    expect(result.data.acknowledgment_message).toBeUndefined();
  });

  it('passes filters to loadStandards', async () => {
    (loadStandards as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await standardsHandler({
      domain: ['git'],
      applies_to: 'typescript',
      binding: 'required',
      vault: 'myVault',
    });

    expect(loadStandards).toHaveBeenCalledWith({
      binding: 'required',
      domain: ['git'],
      applies_to: 'typescript',
      vault: 'myVault',
    });
  });

  it('handles errors gracefully', async () => {
    (loadStandards as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed to load'));

    const result = await standardsHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('STANDARDS_ERROR');
  });
});

describe('palace_standards_validate tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns validation error when path is missing', async () => {
    const result = await standardsValidateHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns compliant result', async () => {
    // The validator is dynamically imported, so we mock the module
    const { validateCompliance } = await import('../../../src/services/standards/validator.js');
    (validateCompliance as ReturnType<typeof vi.fn>).mockResolvedValue({
      compliant: true,
      violations: [],
      warnings: [],
      checked_against: ['standards/git.md'],
    });

    const result = await standardsValidateHandler({ path: 'research/note.md' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.compliant).toBe(true);
    expect(result.data.violations).toHaveLength(0);
    expect(result.data.message).toContain('compliant');
  });

  it('returns violations', async () => {
    const { validateCompliance } = await import('../../../src/services/standards/validator.js');
    (validateCompliance as ReturnType<typeof vi.fn>).mockResolvedValue({
      compliant: false,
      violations: [
        { standard: 'standards/git.md', requirement: 'Must use conventional commits', actual: 'No commit format' },
      ],
      warnings: [{ standard: 'standards/style.md', message: 'Consider adding tags' }],
      checked_against: ['standards/git.md', 'standards/style.md'],
    });

    const result = await standardsValidateHandler({ path: 'research/note.md' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.compliant).toBe(false);
    expect(result.data.violations).toHaveLength(1);
    expect(result.data.warnings).toHaveLength(1);
    expect(result.data.message).toContain('1 violation');
  });
});
