/** Shared by the global setup (which builds the database) and the test workers. */

export const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ?? 'postgresql://postgres@localhost:5433/postgres';

export const TEST_DB = process.env.TEST_DB_NAME ?? 'spa_test';

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export const TEST_URL = withDatabase(ADMIN_URL, TEST_DB);
