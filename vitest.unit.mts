import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit tests only: no Postgres, no Docker.
 *
 * The main suite (vitest.config.mts) builds a real Postgres database in its
 * globalSetup, because most of those tests assert exclusion constraints and RLS
 * that a mock cannot prove. That is the right call for those tests and the
 * wrong one for a test that only compares two constant lists, so this config
 * keeps the aliases and drops the database entirely.
 *
 * Deliberately NOT a mergeConfig of the base file: merging concatenates the
 * globalSetup array rather than replacing it, which silently put the database
 * back and made this config useless.
 *
 *   npm run test:unit
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.unit.test.ts'],
  },
});
