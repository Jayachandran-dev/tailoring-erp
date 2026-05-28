// Singleton Prisma client for the PLATFORM schema (tenants, OTPs, memberships).
import { PrismaClient } from '../../node_modules/.prisma/platform-client';

export const platformDb = new PrismaClient();

export async function disconnectPlatform(): Promise<void> {
  await platformDb.$disconnect();
}
