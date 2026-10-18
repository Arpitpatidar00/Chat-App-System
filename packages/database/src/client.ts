import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __db__: PrismaClient | undefined;
}

// Singleton pattern to prevent socket exhaustion across hot-reloads
export const prisma =
  globalThis.__db__ ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__db__ = prisma;
}

export * from '@prisma/client';
