import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Performance optimizations
    pool: 'forks', // Use process forking for isolation
    poolOptions: {
      forks: {
        singleFork: true, // Run tests in single fork for speed
      },
    },
    testTimeout: 10000, // 10 second timeout per test
    hookTimeout: 10000, // 10 second timeout for hooks
    // Reporter settings
    reporters: process.env.CI ? ['verbose'] : ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/index.ts'],
    },
  },
});
