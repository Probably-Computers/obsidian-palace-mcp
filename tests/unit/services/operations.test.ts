/**
 * Tests for Operations Service
 *
 * Phase 023: Note Lifecycle Management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  startOperation,
  trackFileCreated,
  trackFileModified,
  trackFileDeleted,
  getOperation,
  getRecentOperations,
  getFilesCreatedByOperation,
  getOperationSummary,
  clearOperations,
} from '../../../src/services/operations/index';

describe('Operations Service', () => {
  beforeEach(() => {
    clearOperations();
  });

  describe('startOperation', () => {
    it('should create a new operation with unique ID', () => {
      const op1 = startOperation('store', 'test-vault');
      const op2 = startOperation('store', 'test-vault');

      expect(op1.id).toBeDefined();
      expect(op2.id).toBeDefined();
      expect(op1.id).not.toBe(op2.id);
    });

    it('should set correct operation type', () => {
      const storeOp = startOperation('store', 'test-vault');
      const improveOp = startOperation('improve', 'test-vault');
      const deleteOp = startOperation('delete', 'test-vault');
      const splitOp = startOperation('split', 'test-vault');

      expect(storeOp.type).toBe('store');
      expect(improveOp.type).toBe('improve');
      expect(deleteOp.type).toBe('delete');
      expect(splitOp.type).toBe('split');
    });

    it('should store metadata', () => {
      const op = startOperation('store', 'test-vault', {
        title: 'Test Note',
        domain: ['test', 'domain'],
      });

      expect(op.metadata).toBeDefined();
      expect(op.metadata?.title).toBe('Test Note');
      expect(op.metadata?.domain).toEqual(['test', 'domain']);
    });

    it('should initialize empty file arrays', () => {
      const op = startOperation('store', 'test-vault');

      expect(op.filesCreated).toEqual([]);
      expect(op.filesModified).toEqual([]);
      expect(op.filesDeleted).toEqual([]);
    });

    it('should set timestamp', () => {
      const before = new Date().toISOString();
      const op = startOperation('store', 'test-vault');
      const after = new Date().toISOString();

      expect(op.timestamp >= before).toBe(true);
      expect(op.timestamp <= after).toBe(true);
    });
  });

  describe('trackFileCreated', () => {
    it('should track created files', () => {
      const op = startOperation('store', 'test-vault');
      trackFileCreated(op.id, 'notes/test.md');

      const retrieved = getOperation(op.id);
      expect(retrieved?.filesCreated).toContain('notes/test.md');
    });

    it('should track multiple files', () => {
      const op = startOperation('store', 'test-vault');
      trackFileCreated(op.id, 'notes/test1.md');
      trackFileCreated(op.id, 'notes/test2.md');
      trackFileCreated(op.id, 'notes/test3.md');

      const retrieved = getOperation(op.id);
      expect(retrieved?.filesCreated).toHaveLength(3);
    });

    it('should ignore invalid operation ID', () => {
      // Should not throw
      trackFileCreated('invalid-id', 'notes/test.md');
    });
  });

  describe('trackFileModified', () => {
    it('should track modified files', () => {
      const op = startOperation('improve', 'test-vault');
      trackFileModified(op.id, 'notes/existing.md');

      const retrieved = getOperation(op.id);
      expect(retrieved?.filesModified).toContain('notes/existing.md');
    });

    it('should avoid duplicates', () => {
      const op = startOperation('improve', 'test-vault');
      trackFileModified(op.id, 'notes/existing.md');
      trackFileModified(op.id, 'notes/existing.md');
      trackFileModified(op.id, 'notes/existing.md');

      const retrieved = getOperation(op.id);
      expect(retrieved?.filesModified).toHaveLength(1);
    });
  });

  describe('trackFileDeleted', () => {
    it('should track deleted files', () => {
      const op = startOperation('delete', 'test-vault');
      trackFileDeleted(op.id, 'notes/deleted.md');

      const retrieved = getOperation(op.id);
      expect(retrieved?.filesDeleted).toContain('notes/deleted.md');
    });
  });

  describe('getOperation', () => {
    it('should retrieve operation by ID', () => {
      const op = startOperation('store', 'test-vault', { title: 'Test' });
      const retrieved = getOperation(op.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(op.id);
      expect(retrieved?.type).toBe('store');
      expect(retrieved?.metadata?.title).toBe('Test');
    });

    it('should return undefined for unknown ID', () => {
      const retrieved = getOperation('unknown-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getRecentOperations', () => {
    it('should return operations for a vault', () => {
      startOperation('store', 'vault-a');
      startOperation('store', 'vault-a');
      startOperation('store', 'vault-b');

      const vaultAOps = getRecentOperations('vault-a');
      const vaultBOps = getRecentOperations('vault-b');

      expect(vaultAOps).toHaveLength(2);
      expect(vaultBOps).toHaveLength(1);
    });

    it('should return most recent first', () => {
      const op1 = startOperation('store', 'test-vault');
      const op2 = startOperation('improve', 'test-vault');
      const op3 = startOperation('delete', 'test-vault');

      const recent = getRecentOperations('test-vault');

      expect(recent[0].id).toBe(op3.id);
      expect(recent[1].id).toBe(op2.id);
      expect(recent[2].id).toBe(op1.id);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 20; i++) {
        startOperation('store', 'test-vault');
      }

      const recent = getRecentOperations('test-vault', 5);
      expect(recent).toHaveLength(5);
    });

    it('should return empty array for vault with no operations', () => {
      const recent = getRecentOperations('empty-vault');
      expect(recent).toEqual([]);
    });
  });

  describe('getFilesCreatedByOperation', () => {
    it('should return created files', () => {
      const op = startOperation('store', 'test-vault');
      trackFileCreated(op.id, 'notes/test1.md');
      trackFileCreated(op.id, 'notes/test2.md');

      const files = getFilesCreatedByOperation(op.id);
      expect(files).toHaveLength(2);
      expect(files).toContain('notes/test1.md');
      expect(files).toContain('notes/test2.md');
    });

    it('should return empty array for unknown operation', () => {
      const files = getFilesCreatedByOperation('unknown-id');
      expect(files).toEqual([]);
    });
  });

  describe('getOperationSummary', () => {
    it('should return summary with counts', () => {
      const op = startOperation('store', 'test-vault');
      trackFileCreated(op.id, 'notes/new1.md');
      trackFileCreated(op.id, 'notes/new2.md');
      trackFileModified(op.id, 'notes/existing.md');

      const summary = getOperationSummary(op.id);

      expect(summary).toBeDefined();
      expect(summary?.operation_id).toBe(op.id);
      expect(summary?.type).toBe('store');
      expect(summary?.files_created).toBe(2);
      expect(summary?.files_modified).toBe(1);
      expect(summary?.files_deleted).toBe(0);
    });

    it('should return null for unknown operation', () => {
      const summary = getOperationSummary('unknown-id');
      expect(summary).toBeNull();
    });
  });

  describe('clearOperations', () => {
    it('should clear all operations', () => {
      const op1 = startOperation('store', 'vault-a');
      const op2 = startOperation('store', 'vault-b');

      clearOperations();

      expect(getOperation(op1.id)).toBeUndefined();
      expect(getOperation(op2.id)).toBeUndefined();
      expect(getRecentOperations('vault-a')).toEqual([]);
      expect(getRecentOperations('vault-b')).toEqual([]);
    });
  });

  describe('Operation Limit', () => {
    it('should limit operations per vault', () => {
      // Create more than the limit (100) operations
      for (let i = 0; i < 110; i++) {
        startOperation('store', 'test-vault');
      }

      const recent = getRecentOperations('test-vault', 200);
      // Should be capped at MAX_OPERATIONS_PER_VAULT (100)
      expect(recent.length).toBeLessThanOrEqual(100);
    });
  });
});
