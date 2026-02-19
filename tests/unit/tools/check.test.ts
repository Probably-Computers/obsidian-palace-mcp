import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must come before handler import
vi.mock('fs', () => ({
  readdirSync: vi.fn(() => []),
}));

vi.mock('../../../src/services/index/query.js', () => ({
  searchNotesInVault: vi.fn(),
  queryNotesInVault: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/services/vault/resolver.js', () => ({
  extractDomainFromPath: vi.fn(() => []),
  isSpecialFolder: vi.fn(() => false),
}));

import { checkHandler, buildSemanticDomainPath, buildDomainPathFromVault } from '../../../src/tools/check.js';
import { searchNotesInVault, queryNotesInVault } from '../../../src/services/index/query.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';
import { extractDomainFromPath } from '../../../src/services/vault/resolver.js';

describe('buildSemanticDomainPath (legacy - no vault context)', () => {
  describe('stop word filtering', () => {
    it('should filter out common stop words', () => {
      const result = buildSemanticDomainPath(['the', 'quick', 'brown', 'fox']);
      expect(result).not.toContain('the');
      expect(result).toContain('quick');
      expect(result).toContain('brown');
    });

    it('should filter out prepositions', () => {
      const result = buildSemanticDomainPath(['running', 'in', 'the', 'park']);
      expect(result).not.toContain('in');
      expect(result).not.toContain('the');
      expect(result).toContain('running');
      expect(result).toContain('park');
    });

    it('should filter out pronouns', () => {
      const result = buildSemanticDomainPath(['my', 'awesome', 'project']);
      expect(result).not.toContain('my');
      expect(result).toContain('awesome');
      expect(result).toContain('project');
    });
  });

  describe('word length filtering', () => {
    it('should filter out very short words', () => {
      const result = buildSemanticDomainPath(['a', 'go', 'run', 'sprint']);
      expect(result).not.toContain('a');
      expect(result).not.toContain('go');
      expect(result).toContain('run');
      expect(result).toContain('sprint');
    });
  });

  describe('sorting by significance', () => {
    it('should prioritize longer words as more specific', () => {
      const result = buildSemanticDomainPath(['cat', 'elephant', 'dog']);
      // Longer words come first
      expect(result[0]).toBe('elephant');
    });

    it('should limit to 3 path segments', () => {
      const result = buildSemanticDomainPath([
        'gardening', 'vegetables', 'tomatoes', 'cherry', 'organic'
      ]);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('real queries', () => {
    it('should handle "green peppers growing"', () => {
      const result = buildSemanticDomainPath(['green', 'peppers', 'growing']);
      // Should return meaningful words sorted by length
      expect(result).toContain('peppers');
      expect(result).toContain('growing');
      expect(result).toContain('green');
    });

    it('should handle query with stop words', () => {
      const result = buildSemanticDomainPath([
        'how', 'to', 'grow', 'tomatoes', 'in', 'containers'
      ]);
      expect(result).not.toContain('how');
      expect(result).not.toContain('to');
      expect(result).not.toContain('in');
      expect(result).toContain('containers');
      expect(result).toContain('tomatoes');
    });
  });
});

describe('buildDomainPathFromVault (dynamic - with vault context)', () => {
  // Simulate a vault with existing domains
  const mockVaultDomains = new Map([
    ['gardening', { noteCount: 15, level: 1 }],
    ['gardening/vegetables', { noteCount: 10, level: 2 }],
    ['gardening/vegetables/peppers', { noteCount: 5, level: 3 }],
    ['infrastructure', { noteCount: 20, level: 1 }],
    ['infrastructure/containers', { noteCount: 12, level: 2 }],
    ['infrastructure/networking', { noteCount: 8, level: 2 }],
    ['programming', { noteCount: 25, level: 1 }],
    ['programming/languages', { noteCount: 15, level: 2 }],
  ]);

  describe('exact domain matching', () => {
    it('should match query word to existing domain', () => {
      const result = buildDomainPathFromVault(
        ['gardening', 'tips'],
        mockVaultDomains
      );
      expect(result[0]).toBe('gardening');
    });

    it('should match to deeper domain when word matches', () => {
      const result = buildDomainPathFromVault(
        ['vegetables', 'growing'],
        mockVaultDomains
      );
      // Should match gardening/vegetables
      expect(result).toContain('gardening');
      expect(result).toContain('vegetables');
    });

    it('should match peppers to gardening/vegetables/peppers', () => {
      const result = buildDomainPathFromVault(
        ['peppers', 'seeds', 'starting'],
        mockVaultDomains
      );
      expect(result).toContain('gardening');
      expect(result).toContain('vegetables');
      expect(result).toContain('peppers');
    });
  });

  describe('partial matching', () => {
    it('should match partial word to domain', () => {
      const result = buildDomainPathFromVault(
        ['container', 'orchestration'],
        mockVaultDomains
      );
      // 'container' should match 'containers' domain
      expect(result).toContain('infrastructure');
      expect(result).toContain('containers');
    });

    it('should match networking-related queries', () => {
      const result = buildDomainPathFromVault(
        ['network', 'protocols'],
        mockVaultDomains
      );
      expect(result).toContain('infrastructure');
      expect(result).toContain('networking');
    });
  });

  describe('no match fallback', () => {
    it('should return meaningful words when no domain match', () => {
      const result = buildDomainPathFromVault(
        ['astronomy', 'telescope', 'stars'],
        mockVaultDomains
      );
      // No matching domain, should return query words sorted by length
      expect(result.length).toBeGreaterThan(0);
      // Should contain all meaningful words (astronomy and telescope are same length)
      expect(result).toContain('astronomy');
      expect(result).toContain('telescope');
    });
  });

  describe('stop word filtering', () => {
    it('should filter stop words even with vault context', () => {
      const result = buildDomainPathFromVault(
        ['the', 'gardening', 'is', 'fun'],
        mockVaultDomains
      );
      expect(result).not.toContain('the');
      expect(result).not.toContain('is');
      expect(result).toContain('gardening');
    });
  });

  describe('adding specificity', () => {
    it('should add remaining words as sub-path', () => {
      const result = buildDomainPathFromVault(
        ['gardening', 'tomatoes'],
        mockVaultDomains
      );
      // Should match gardening and add tomatoes
      expect(result[0]).toBe('gardening');
      expect(result).toContain('tomatoes');
    });
  });

  describe('empty vault', () => {
    it('should work with empty vault', () => {
      const emptyVault = new Map<string, { noteCount: number; level: number }>();
      const result = buildDomainPathFromVault(
        ['kubernetes', 'deployment'],
        emptyVault
      );
      // Should return meaningful words
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('kubernetes');
      expect(result).toContain('deployment');
    });
  });
});

// --- Handler tests (mocked) ---

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

describe('checkHandler', () => {
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
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (queryNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (extractDomainFromPath as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  it('returns validation error when query is missing', async () => {
    const result = await checkHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns create_new when no matches found', async () => {
    const result = await checkHandler({ query: 'Kubernetes Networking' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.found).toBe(false);
    expect(result.data.matches).toHaveLength(0);
    expect(result.data.recommendation).toBe('create_new');
  });

  it('returns improve_existing for high-relevance active matches', async () => {
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        note: {
          path: 'infra/k8s/networking.md',
          title: 'Kubernetes Networking',
          frontmatter: { confidence: 0.8, modified: '2025-01-01' },
        },
        score: 0.85,
      },
    ]);

    const result = await checkHandler({ query: 'Kubernetes Networking' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.found).toBe(true);
    expect(result.data.recommendation).toBe('improve_existing');
  });

  it('returns reference_existing for very high relevance', async () => {
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        note: {
          path: 'research/topic.md',
          title: 'Topic',
          frontmatter: { confidence: 0.9, modified: '2025-01-01' },
        },
        score: 0.96,
      },
    ]);

    const result = await checkHandler({ query: 'Topic' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.recommendation).toBe('reference_existing');
  });

  it('returns expand_stub for stub matches', async () => {
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        note: {
          path: 'stubs/docker.md',
          title: 'Docker',
          frontmatter: { status: 'stub', confidence: 0.5, modified: '2025-01-01' },
        },
        score: 0.9,
      },
    ]);

    const result = await checkHandler({ query: 'Docker' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.recommendation).toBe('expand_stub');
  });

  it('filters stubs when include_stubs is false', async () => {
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        note: {
          path: 'stubs/docker.md',
          title: 'Docker',
          frontmatter: { status: 'stub', modified: '2025-01-01' },
        },
        score: 0.8,
      },
    ]);

    const result = await checkHandler({ query: 'Docker', include_stubs: false });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matches).toHaveLength(0);
  });

  it('applies path_filter to results', async () => {
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        note: {
          path: 'infrastructure/k8s/networking.md',
          title: 'Kubernetes',
          frontmatter: { confidence: 0.8, modified: '2025-01-01' },
        },
        score: 0.8,
      },
      {
        note: {
          path: 'gardening/containers.md',
          title: 'Container Gardening',
          frontmatter: { confidence: 0.7, modified: '2025-01-01' },
        },
        score: 0.6,
      },
    ]);

    const result = await checkHandler({ query: 'containers', path_filter: 'infrastructure' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matches).toHaveLength(1);
    expect(result.data.matches[0].path).toBe('infrastructure/k8s/networking.md');
  });

  it('deduplicates search and title results', async () => {
    const note = {
      path: 'research/docker.md',
      title: 'Docker',
      frontmatter: { confidence: 0.8, modified: '2025-01-01' },
    };
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
      { note, score: 0.9 },
    ]);
    (queryNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([note]);

    const result = await checkHandler({ query: 'Docker' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Should not have duplicates
    expect(result.data.matches).toHaveLength(1);
  });

  it('passes domain tags to search', async () => {
    await checkHandler({ query: 'test', domain: ['kubernetes', 'networking'] });
    expect(searchNotesInVault).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ tags: ['kubernetes', 'networking'] })
    );
  });

  it('includes domain suggestions', async () => {
    const result = await checkHandler({ query: 'Kubernetes Networking' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.suggestions).toBeDefined();
    expect(result.data.suggestions.suggested_domains).toBeDefined();
  });

  it('handles errors gracefully', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Vault error');
    });

    const result = await checkHandler({ query: 'test' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('CHECK_ERROR');
  });
});
