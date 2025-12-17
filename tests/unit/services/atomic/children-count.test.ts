/**
 * Tests for children count validation (Phase 025)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAccurateChildrenCount, updateChildrenCount } from '../../../../src/services/atomic/children-count.js';

// Mock fs and fs/promises
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Import mocked modules
import { existsSync, readdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';

describe('Children Count Validation (Phase 025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getAccurateChildrenCount', () => {
    it('should return accurate count when all children exist', async () => {
      const hubContent = `---
type: research_hub
children_count: 3
---

# Test Hub

## Knowledge Map

- [[Child One]]
- [[Child Two]]
- [[Child Three]]
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(hubContent);
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['Test Hub.md', 'Child One.md', 'Child Two.md', 'Child Three.md']);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md');

      expect(result.storedCount).toBe(3);
      expect(result.actualCount).toBe(3);
      expect(result.isAccurate).toBe(true);
      expect(result.existingChildren).toHaveLength(3);
      expect(result.missingChildren).toHaveLength(0);
    });

    it('should detect missing children', async () => {
      const hubContent = `---
type: research_hub
children_count: 3
---

# Test Hub

## Knowledge Map

- [[Child One]]
- [[Child Two]]
- [[Missing Child]]
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(hubContent);
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        return !path.includes('Missing Child');
      });
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['Test Hub.md', 'Child One.md', 'Child Two.md']);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md');

      expect(result.storedCount).toBe(3);
      expect(result.actualCount).toBe(2);
      expect(result.isAccurate).toBe(false);
      expect(result.existingChildren).toHaveLength(2);
      expect(result.missingChildren).toHaveLength(1);
      expect(result.missingChildren[0]).toContain('Missing Child');
    });

    it('should detect stale children_count', async () => {
      const hubContent = `---
type: research_hub
children_count: 5
---

# Test Hub

## Knowledge Map

- [[Child One]]
- [[Child Two]]
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(hubContent);
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['Test Hub.md', 'Child One.md', 'Child Two.md']);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md');

      expect(result.storedCount).toBe(5);
      expect(result.actualCount).toBe(2);
      expect(result.isAccurate).toBe(false);
    });

    it('should handle Knowledge Map with path aliases', async () => {
      const hubContent = `---
type: research_hub
children_count: 2
---

# Test Hub

## Knowledge Map

- [[Child One|First Child]]
- [[path/to/Child Two|Second Child]]
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(hubContent);
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['Test Hub.md', 'Child One.md']);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md');

      expect(result.existingChildren).toHaveLength(2);
    });

    it('should handle hub with no Knowledge Map section', async () => {
      const hubContent = `---
type: research_hub
children_count: 0
---

# Test Hub

Some content without a Knowledge Map section.
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(hubContent);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['Test Hub.md']);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md');

      expect(result.actualCount).toBe(0);
      expect(result.isAccurate).toBe(true);
    });

    it('should handle file read errors gracefully', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('File not found'));

      const result = await getAccurateChildrenCount('/vault', 'nonexistent/Hub.md');

      expect(result.storedCount).toBe(0);
      expect(result.actualCount).toBe(0);
      expect(result.isAccurate).toBe(true);
      expect(result.existingChildren).toHaveLength(0);
    });

    it('should use provided content instead of reading file', async () => {
      const hubContent = `---
type: research_hub
children_count: 1
---

# Test Hub

## Knowledge Map

- [[Child]]
`;

      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['Test Hub.md', 'Child.md']);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md', hubContent);

      // readFile should not be called when content is provided
      expect(readFile).not.toHaveBeenCalled();
      expect(result.actualCount).toBe(1);
    });

    it('should detect orphaned children (files in dir not linked)', async () => {
      const hubContent = `---
type: research_hub
children_count: 1
---

# Test Hub

## Knowledge Map

- [[Child One]]
`;

      const orphanContent = `---
type: research
---

# Orphan Note
`;

      (readFile as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path.includes('Orphan')) return orphanContent;
        return hubContent;
      });
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
        'Test Hub.md',
        'Child One.md',
        'Orphan Note.md',
      ]);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md');

      expect(result.orphanedChildren).toHaveLength(1);
      expect(result.orphanedChildren[0]).toContain('Orphan Note');
    });

    it('should stop parsing at next section after Knowledge Map', async () => {
      const hubContent = `---
type: research_hub
children_count: 1
---

# Test Hub

## Knowledge Map

- [[Real Child]]

## References

- [[Not A Child]]
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(hubContent);
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['Test Hub.md', 'Real Child.md', 'Not A Child.md']);

      const result = await getAccurateChildrenCount('/vault', 'topic/Test Hub.md');

      // Only "Real Child" should be counted, not "Not A Child" from References section
      expect(result.existingChildren).toHaveLength(1);
      expect(result.existingChildren[0]).toContain('Real Child');
    });
  });

  describe('updateChildrenCount', () => {
    it('should update children_count in frontmatter', async () => {
      const originalContent = `---
type: research_hub
children_count: 5
modified: 2025-01-01T00:00:00Z
---

# Test Hub

Content here.
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(originalContent);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await updateChildrenCount('/vault', 'topic/Test Hub.md', 3);

      expect(result).toBe(true);
      expect(writeFile).toHaveBeenCalled();

      // Verify the written content has updated children_count
      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('children_count: 3');
    });

    it('should not write if count is already accurate', async () => {
      const originalContent = `---
type: research_hub
children_count: 3
---

# Test Hub
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(originalContent);

      const result = await updateChildrenCount('/vault', 'topic/Test Hub.md', 3);

      expect(result).toBe(true);
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should handle write errors gracefully', async () => {
      const originalContent = `---
type: research_hub
children_count: 5
---

# Test Hub
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(originalContent);
      (writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Write failed'));

      const result = await updateChildrenCount('/vault', 'topic/Test Hub.md', 3);

      expect(result).toBe(false);
    });

    it('should update modified timestamp when changing count', async () => {
      const originalContent = `---
type: research_hub
children_count: 5
modified: 2020-01-01T00:00:00Z
---

# Test Hub
`;

      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(originalContent);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await updateChildrenCount('/vault', 'topic/Test Hub.md', 3);

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      // Modified timestamp should be updated (not the old 2020 date)
      expect(writtenContent).not.toContain('2020-01-01');
      expect(writtenContent).toContain('modified:');
    });
  });
});
