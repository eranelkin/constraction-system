import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Single worker + sequential files prevents deadlocks on shared DB tables
    singleFork: true,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/test/**', 'src/main.ts', 'src/database/migrate.ts'],
    },
  },
});
