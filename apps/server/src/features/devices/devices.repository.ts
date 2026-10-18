import { prisma, type Device, type OneTimePrekey, type KeyBackupVault } from '@chat/database';
import { uow, type TransactionClient } from '../../core/database/unit-of-work.js';
import type { DevicePlatform } from '@chat/types';

export interface EnrollDeviceData {
  userId: string;
  deviceName: string;
  platform: DevicePlatform;
  pushToken?: string;
  identityKeyPub: Buffer;
  signedPrekeyPub: Buffer;
  signedPrekeySig: Buffer;
  oneTimePrekeys: Array<{ keyId: number; publicKey: Buffer }>;
  vaultBackup?: {
    encryptedVaultBlob: Buffer;
    kdfSalt: Buffer;
    kdfParams: Record<string, unknown>;
    version?: number;
  };
}

export class DevicesRepository {
  public async enrollDevice(data: EnrollDeviceData): Promise<Device> {
    return uow.runInTransaction(async (tx: TransactionClient) => {
      // 1. Create Device record
      const device = await tx.device.create({
        data: {
          userId: data.userId,
          deviceName: data.deviceName,
          platform: data.platform as any,
          pushToken: data.pushToken,
          identityKeyPub: data.identityKeyPub as any,
          signedPrekeyPub: data.signedPrekeyPub as any,
          signedPrekeySig: data.signedPrekeySig as any,
          status: 'ACTIVE',
        },
      });

      // 2. Insert One-Time Prekeys
      if (data.oneTimePrekeys.length > 0) {
        await tx.oneTimePrekey.createMany({
          data: data.oneTimePrekeys.map((opk) => ({
            deviceId: device.deviceId,
            keyId: opk.keyId,
            publicKey: opk.publicKey as any,
            consumed: false,
          })),
        });
      }

      // 3. Upsert KeyBackupVault if supplied
      if (data.vaultBackup) {
        await tx.keyBackupVault.upsert({
          where: { userId: data.userId },
          create: {
            userId: data.userId,
            encryptedVaultBlob: data.vaultBackup.encryptedVaultBlob as any,
            kdfSalt: data.vaultBackup.kdfSalt as any,
            kdfParams: data.vaultBackup.kdfParams as any,
            version: data.vaultBackup.version ?? 1,
          },
          update: {
            encryptedVaultBlob: data.vaultBackup.encryptedVaultBlob as any,
            kdfSalt: data.vaultBackup.kdfSalt as any,
            kdfParams: data.vaultBackup.kdfParams as any,
            version: data.vaultBackup.version ?? 1,
          },
        });
      }

      return device;
    });
  }

  public async getActiveDevicesForUser(userId: string): Promise<Device[]> {
    return prisma.device.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * P2-T01: Atomically consumes and returns an unconsumed OPK for a device.
   */
  public async claimDeviceOpk(deviceId: string): Promise<OneTimePrekey | null> {
    return uow.runInTransaction(async (tx: TransactionClient) => {
      // Find one unconsumed prekey
      const opk = await tx.oneTimePrekey.findFirst({
        where: {
          deviceId,
          consumed: false,
        },
        orderBy: { id: 'asc' },
      });

      if (!opk) {
        return null;
      }

      // Mark as consumed atomically
      await tx.oneTimePrekey.update({
        where: { id: opk.id },
        data: { consumed: true },
      });

      return opk;
    });
  }

  public async upsertVault(
    userId: string,
    params: {
      encryptedVaultBlob: Buffer;
      kdfSalt: Buffer;
      kdfParams: Record<string, unknown>;
      version?: number;
    }
  ): Promise<KeyBackupVault> {
    return prisma.keyBackupVault.upsert({
      where: { userId },
      create: {
        userId,
        encryptedVaultBlob: params.encryptedVaultBlob as any,
        kdfSalt: params.kdfSalt as any,
        kdfParams: params.kdfParams as any,
        version: params.version ?? 1,
      },
      update: {
        encryptedVaultBlob: params.encryptedVaultBlob as any,
        kdfSalt: params.kdfSalt as any,
        kdfParams: params.kdfParams as any,
        version: params.version ?? 1,
      },
    });
  }

  public async getVault(userId: string): Promise<KeyBackupVault | null> {
    return prisma.keyBackupVault.findUnique({
      where: { userId },
    });
  }
}

export const devicesRepository = new DevicesRepository();
