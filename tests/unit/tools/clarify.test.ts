/**
 * Tests for palace_clarify tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/services/ai-support/index.js', () => ({
  detectContext: vi.fn(),
  identifyMissing: vi.fn(),
  prioritizeMissing: vi.fn(),
  generateQuestions: vi.fn(),
  generateSuggestions: vi.fn(),
  calculateConfidence: vi.fn(),
  generateSummaryMessage: vi.fn(),
}));

import { clarifyHandler } from '../../../src/tools/clarify.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';
import {
  detectContext,
  identifyMissing,
  prioritizeMissing,
  generateQuestions,
  generateSuggestions,
  calculateConfidence,
  generateSummaryMessage,
} from '../../../src/services/ai-support/index.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

describe('palace_clarify tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getVaultResultInfo as ReturnType<typeof vi.fn>).mockReturnValue({
      vault: 'test',
      vault_path: '/tmp/vault',
      vault_mode: 'rw',
    });
    (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue({
      getIndex: vi.fn().mockResolvedValue(mockDb),
    });
    (detectContext as ReturnType<typeof vi.fn>).mockReturnValue({
      capture_type: { likely: 'knowledge', confidence: 0.8 },
      domains: [{ name: 'kubernetes', confidence: 0.9, exists_in_vault: true }],
      projects: [],
      clients: [],
    });
    (identifyMissing as ReturnType<typeof vi.fn>).mockReturnValue({
      missing: [],
      partial: [],
      reasons: {},
    });
    (prioritizeMissing as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (generateQuestions as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (generateSuggestions as ReturnType<typeof vi.fn>).mockReturnValue({});
    (calculateConfidence as ReturnType<typeof vi.fn>).mockReturnValue({
      overall: 0.85,
    });
    (generateSummaryMessage as ReturnType<typeof vi.fn>).mockReturnValue('All context detected.');
  });

  it('returns validation error when context is missing', async () => {
    const result = await clarifyHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error when title is missing from context', async () => {
    const result = await clarifyHandler({
      context: { content_preview: 'test' },
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('detects context and returns suggestions', async () => {
    const result = await clarifyHandler({
      context: {
        title: 'Kubernetes Networking',
        content_preview: 'Kubernetes uses CNI plugins for networking.',
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.detected).toBeDefined();
    expect(result.data.confidence.overall).toBe(0.85);
    expect(detectContext).toHaveBeenCalled();
  });

  it('merges AI-provided domains with detected ones', async () => {
    await clarifyHandler({
      context: {
        title: 'Networking',
        content_preview: 'Test content',
        detected_domains: ['custom-domain'],
      },
    });

    // detectContext is called first, then detected_domains are merged
    expect(detectContext).toHaveBeenCalled();
  });

  it('merges AI-provided project and client hints', async () => {
    await clarifyHandler({
      context: {
        title: 'Project Notes',
        content_preview: 'Test content',
        detected_context: {
          possible_projects: ['MyProject'],
          possible_clients: ['ClientA'],
        },
      },
    });
    expect(detectContext).toHaveBeenCalled();
  });

  it('passes missing fields from input', async () => {
    await clarifyHandler({
      context: {
        title: 'Test',
        content_preview: 'Test content',
      },
      missing: ['capture_type', 'domain'],
    });
    expect(identifyMissing).toHaveBeenCalled();
  });

  it('handles errors gracefully', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Vault error');
    });

    const result = await clarifyHandler({
      context: { title: 'Test', content_preview: 'content' },
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('CLARIFY_ERROR');
  });
});
