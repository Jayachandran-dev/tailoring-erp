// Vitest setup: ensure required env vars exist before any test imports
// src/config/env (which calls process.exit on missing vars).
//
// Tests should NOT use the real DB by default; the platform/tenant clients
// are mocked at the module level inside individual test files.

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-do-not-use-in-prod-1234567890';
process.env.JWT_EXPIRES_IN ??= '15m';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/tailoring_erp_test?schema=public';
process.env.DATABASE_BASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/tailoring_erp_test';
process.env.SMS_PROVIDER ??= 'mock';
process.env.OTP_EXPOSE_IN_RESPONSE ??= 'true';
