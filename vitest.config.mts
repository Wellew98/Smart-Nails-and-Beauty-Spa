import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // `server-only` throws by design outside a React Server Component graph.
      // The modules under test are genuinely server-only; the guard just has
      // nothing to guard in a Node test process.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globalSetup: ['./tests/helpers/global-setup.ts'],
    setupFiles: ['./tests/helpers/setup-env.ts'],
    // One shared Postgres database, reset between tests. Parallel files would
    // race on that reset, and acceptance test 1 needs the connection pool to
    // itself to mean anything.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
