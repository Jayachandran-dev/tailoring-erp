// Provisions a brand-new Postgres schema for a tenant by executing the
// `prisma/tenant/tenant_template.sql` DDL with __SCHEMA__ substituted.
//
// The schema name is validated against a strict regex BEFORE substitution to
// prevent SQL injection via tenant slugs.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platformDb } from './platformClient';
import { validateSchemaName } from './tenantClient';
import { logger } from '../config/logger';

let cachedTemplate: string | null = null;

async function loadTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  const path = join(__dirname, '..', '..', 'prisma', 'tenant', 'tenant_template.sql');
  cachedTemplate = await readFile(path, 'utf8');
  return cachedTemplate;
}

export async function provisionTenantSchema(schemaName: string): Promise<void> {
  validateSchemaName(schemaName);
  const template = await loadTemplate();
  const sql = template.replaceAll('__SCHEMA__', schemaName);

  // Split on top-level semicolons but keep DO $$ ... END$$ blocks intact.
  const statements = splitSql(sql);

for (const stmt of statements) {
  const trimmed = stmt.trim();

  if (!trimmed) continue;

  try {
    logger.info(
      { sql: trimmed.substring(0, 100) },
      'Executing tenant SQL'
    );

    await platformDb.$executeRawUnsafe(trimmed);

  } catch (err) {
    logger.error(
      {
        err,
        sql: trimmed,
      },
      'Tenant schema creation failed'
    );

    throw err;
  }
}

  logger.info({ schemaName }, 'tenant schema provisioned');
}

// Minimal SQL splitter that respects $$ ... $$ dollar-quoted blocks.
function splitSql(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next2 = sql.substr(i, 2);
    if (next2 === '$$') {
      inDollar = !inDollar;
      buf += '$$';
      i++;
      continue;
    }
    if (ch === ';' && !inDollar) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}
