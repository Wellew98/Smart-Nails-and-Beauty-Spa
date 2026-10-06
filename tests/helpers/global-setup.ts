import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { ADMIN_URL, TEST_DB, TEST_URL } from './config';

/**
 * Builds the acceptance-test database once per `vitest run`.
 *
 * These tests run against real Postgres, not a mock. Spec §9 tests 1 and 8
 * assert behaviour that only exists in the database — exclusion constraints
 * and RLS policies — so a fake would assert nothing at all.
 */

function sql(relativePath: string): string {
  return readFileSync(new URL(relativePath, new URL('../../', import.meta.url)), 'utf8');
}

export default async function setup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  // Drop any leftover from an interrupted run so migrations apply to a clean slate.
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const db = new Client({ connectionString: TEST_URL });
  await db.connect();
  await db.query(sql('supabase/local/0000_local_bootstrap.sql'));
  // The same migrations Supabase applies on merge, in the same order, so the
  // tests exercise the real deployed schema rather than a parallel definition.
  await db.query(sql('supabase/migrations/0001_init.sql'));
  await db.query(sql('supabase/migrations/0002_rls.sql'));
  await db.query(sql('supabase/migrations/0003_business.sql'));
  // 0004_demo_data.sql is deliberately SKIPPED. It is data, not schema, and its
  // placeholder menu would change the row counts and availability the §9
  // assertions are pinned to. Tests use §10's fixture below instead.
  //
  // 0005 IS applied: it is schema, and the chat route's rate limiter counts
  // into it on every request.
  await db.query(sql('supabase/migrations/0005_ai_rate_limit.sql'));
  // 0006 is SKIPPED for the same reason as 0004 — it is the real menu, and the
  // §9 assertions are pinned to §10's fixture.
  //
  // 0007 IS applied: it is schema, and the chat route records a transcript into
  // it on every turn.
  await db.query(sql('supabase/migrations/0007_ai_conversations.sql'));
  // 0008 IS applied: it is schema, and tests/vouchers.test.ts exercises it
  // against real Postgres, same reasoning as every table above.
  await db.query(sql('supabase/migrations/0008_vouchers.sql'));
  await db.query(sql('supabase/seed.sql'));
  await db.end();
}
