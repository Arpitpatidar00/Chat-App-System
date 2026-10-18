import { prisma, type PrismaClient } from '@chat/database';

export type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Unit of Work pattern: executes atomic database operations across multiple repositories.
 */
export class UnitOfWork {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async runInTransaction<T>(
    operation: (tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      return operation(tx);
    }, {
      maxWait: 5000, // 5s max wait to connect to transaction
      timeout: 10000, // 10s max duration for atomic message + envelope operations
    });
  }

  public get client(): PrismaClient {
    return this.db;
  }
}

export const uow = new UnitOfWork();
