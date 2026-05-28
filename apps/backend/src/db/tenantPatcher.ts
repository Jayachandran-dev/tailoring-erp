// Re-applies the tenant template DDL against every existing tenant schema on boot.
// The template is written to be IDEMPOTENT (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS),
// so re-running it brings older tenants up to the current shape without a per-tenant migration tool.
//
// This is the "good-enough" approach for an MVP. For production-scale (hundreds of tenants),
// switch to a proper migration tracker per schema.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platformDb } from './platformClient';
import { validateSchemaName } from './tenantClient';
import { logger } from '../config/logger';

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

export async function patchAllTenantSchemas(): Promise<void> {
  const template = await readFile(
    join(__dirname, '..', '..', 'prisma', 'tenant', 'tenant_template.sql'),
    'utf8',
  );

  const tenants = await platformDb.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, schemaName: true },
  });

  for (const t of tenants) {
    try {
      validateSchemaName(t.schemaName);
      const sql = template.replaceAll('__SCHEMA__', t.schemaName);
      const stmts = splitSql(sql);
      await platformDb.$transaction(async (tx) => {
        for (const s of stmts) {
          const trimmed = s.trim();
          if (!trimmed) continue;
          await tx.$executeRawUnsafe(trimmed);
        }
      });
      logger.info({ schemaName: t.schemaName }, 'tenant schema patched');
    } catch (err) {
      logger.error({ err, schemaName: t.schemaName }, 'tenant patch failed');
    }
  }
}
