/**
 * Tests for palace_autolink tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/index.js', () => ({
  readNote: vi.fn(),
  listNotes: vi.fn(),
}));

vi.mock('../../../src/services/vault/writer.js', () => ({
  updateNote: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
  indexNote: vi.fn(),
}));

vi.mock('../../../src/services/autolink/index.js', () => ({
  buildCompleteIndex: vi.fn(),
  buildLinkableIndex: vi.fn(),
  scanForMatches: vi.fn(),
  autolinkContent: vi.fn(),
  filterByLinkMode: vi.fn(),
  filterByStopWords: vi.fn(),
  filterByDomainScope: vi.fn(),
  filterByLinkDensity: vi.fn(),
  analyzeLinkDensity: vi.fn(),
  DEFAULT_MIN_TITLE_LENGTH: 3,
  DEFAULT_STOP_WORDS: ['overview', 'documentation'],
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  enforceWriteAccess: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { autolinkHandler } from '../../../src/tools/autolink.js';
import { readNote, listNotes } from '../../../src/services/vault/index.js';
import {
  buildCompleteIndex,
  buildLinkableIndex,
  scanForMatches,
  autolinkContent,
  filterByLinkMode,
  filterByStopWords,
  filterByDomainScope,
} from '../../../src/services/autolink/index.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: {
    ignore: { patterns: [] },
    autolink: {
      link_mode: 'first_per_section',
      domain_scope: 'any',
      min_title_length: 3,
    },
  },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

describe('palace_autolink tool', () => {
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
    (buildCompleteIndex as ReturnType<typeof vi.fn>).mockResolvedValue({
      index: new Map([['docker', { title: 'Docker', path: 'tech/docker.md' }]]),
      conflicts: [],
    });
    (buildLinkableIndex as ReturnType<typeof vi.fn>).mockReturnValue(
      new Map([['docker', { title: 'Docker', path: 'tech/docker.md' }]])
    );
    (scanForMatches as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (filterByStopWords as ReturnType<typeof vi.fn>).mockImplementation((matches) => matches);
    (filterByDomainScope as ReturnType<typeof vi.fn>).mockImplementation((matches) => matches);
    (filterByLinkMode as ReturnType<typeof vi.fn>).mockImplementation((matches) => matches);
  });

  it('processes a single note with no matches', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'research/note.md',
      content: 'Content with no linkable terms.',
    });

    const result = await autolinkHandler({ path: 'research/note.md' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.notes_processed).toBe(1);
    expect(result.data.notes_modified).toBe(0);
    expect(result.data.total_links_added).toBe(0);
  });

  it('processes notes with matches and links', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'research/note.md',
      content: 'Using Docker for containers.',
    });
    (scanForMatches as ReturnType<typeof vi.fn>).mockReturnValue([
      { title: 'Docker', position: 6, length: 6, target: 'tech/docker.md' },
    ]);
    (autolinkContent as ReturnType<typeof vi.fn>).mockReturnValue({
      linkedContent: 'Using [[Docker]] for containers.',
      linksAdded: [{ matchedText: 'Docker', target: 'tech/docker.md' }],
    });

    const result = await autolinkHandler({ path: 'research/note.md' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.notes_modified).toBe(1);
    expect(result.data.total_links_added).toBe(1);
    expect(result.data.dry_run).toBe(true);
  });

  it('uses buildLinkableIndex when include_aliases is false', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'note.md',
      content: 'Test content',
    });

    await autolinkHandler({ path: 'note.md', include_aliases: false });
    expect(buildLinkableIndex).toHaveBeenCalled();
    expect(buildCompleteIndex).not.toHaveBeenCalled();
  });

  it('enforces write access when not dry_run', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'note.md',
      content: 'Test content',
    });

    await autolinkHandler({ path: 'note.md', dry_run: false });
    expect(enforceWriteAccess).toHaveBeenCalledWith(mockVault);
  });

  it('processes entire vault when no path given', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
      { path: 'a.md' },
      { path: 'b.md' },
    ]);

    await autolinkHandler({});
    expect(listNotes).toHaveBeenCalledWith('', true, expect.anything());
  });

  it('excludes paths specified in exclude_paths', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
      { path: 'research/note.md' },
      { path: 'templates/template.md' },
    ]);

    const result = await autolinkHandler({ exclude_paths: ['templates/'] });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.notes_processed).toBe(1);
  });

  it('handles errors gracefully', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Vault error');
    });

    const result = await autolinkHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('AUTOLINK_ERROR');
  });
});
