import { describe, it, expect } from 'vitest';
import { slugify, unslugify, titleFromFilename, titleToFilename, sanitizeForFilename } from '../../../src/utils/slugify.js';

describe('slugify', () => {
  it('should convert title to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should replace spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('should handle multiple spaces', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('should remove special characters', () => {
    expect(slugify('hello! world?')).toBe('hello-world');
  });

  it('should convert forward slashes to hyphens', () => {
    expect(slugify('Sandboxed/Secure Runtimes')).toBe('sandboxed-secure-runtimes');
  });

  it('should convert backslashes to hyphens', () => {
    expect(slugify('Windows\\Path\\Style')).toBe('windows-path-style');
  });

  it('should convert ampersands to hyphens', () => {
    expect(slugify('Input & Output')).toBe('input-output');
  });

  it('should convert plus signs to hyphens', () => {
    expect(slugify('C++ Programming')).toBe('c-programming');
  });

  it('should handle compound separators', () => {
    expect(slugify('High-Level/Low-Level Runtimes')).toBe('high-level-low-level-runtimes');
  });

  it('should collapse multiple hyphens', () => {
    expect(slugify('hello--world')).toBe('hello-world');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(slugify('-hello world-')).toBe('hello-world');
  });

  it('should handle empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('should handle whitespace-only string', () => {
    expect(slugify('   ')).toBe('');
  });
});

describe('unslugify', () => {
  it('should replace hyphens with spaces', () => {
    expect(unslugify('hello-world')).toBe('Hello World');
  });

  it('should capitalize first letter of each word', () => {
    expect(unslugify('hello-world-test')).toBe('Hello World Test');
  });
});

describe('titleFromFilename', () => {
  it('should remove .md extension and unslugify', () => {
    expect(titleFromFilename('hello-world.md')).toBe('Hello World');
  });

  it('should handle uppercase .MD extension', () => {
    expect(titleFromFilename('test-file.MD')).toBe('Test File');
  });
});

describe('titleToFilename (Phase 018)', () => {
  it('should preserve title case and add .md extension', () => {
    expect(titleToFilename('Hello World')).toBe('Hello World.md');
  });

  it('should handle special characters by replacing with dash', () => {
    expect(titleToFilename('Sandboxed/Secure Runtimes')).toBe('Sandboxed-Secure Runtimes.md');
  });

  it('should sanitize filesystem-invalid characters', () => {
    // Note: ? is replaced with - on the regex, and trailing - is trimmed
    expect(titleToFilename('What is K8s?')).toBe('What is K8s.md');
    expect(titleToFilename('File:Name')).toBe('File-Name.md');
  });
});

describe('sanitizeForFilename (Phase 018)', () => {
  it('should remove invalid filesystem characters', () => {
    expect(sanitizeForFilename('File:Name')).toBe('File-Name');
    expect(sanitizeForFilename('Path/To/File')).toBe('Path-To-File');
    // ? is replaced with -, then trailing - is stripped
    expect(sanitizeForFilename('Question?')).toBe('Question');
  });

  it('should preserve spaces and case', () => {
    expect(sanitizeForFilename('Hello World')).toBe('Hello World');
    expect(sanitizeForFilename('Kubernetes Pods')).toBe('Kubernetes Pods');
  });
});
