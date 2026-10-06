import { TEST_URL } from './config';

// Runs inside each test worker before any module under test is imported, so
// lib/db.ts picks up the acceptance-test database rather than a real one.
process.env.TEST_DATABASE_URL = TEST_URL;
