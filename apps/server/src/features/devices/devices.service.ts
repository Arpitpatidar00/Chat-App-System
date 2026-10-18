import { devicesRepository, type DevicesRepository } from './devices.repository.js';
import { ok, err, type Result } from '../../core/result/result.js';
import { NotFoundError, type DomainError } from '../../core/errors/domain-error.js';
import type { EnrollDeviceRequestDTO, PrekeyBundleDTO } from '@chat/types';

export interface KeyVaultDto {
  userId: string;
  encryptedVaultBlob: string; // base64
  kdfSalt: string; // base64
  kdfParams: Record<string, unknown>;
  version: number;
}

export class DevicesService {
  constructor(private readonly repo: DevicesRepository = devicesRepository) {}

  public async enrollDevice(
    userId: string,
    dto: EnrollDeviceRequestDTO
  ): Promise<Result<{ deviceId: string; status: string }, DomainError>> {
    const device = await this.repo.enrollDevice({
      userId,
      deviceName: dto.deviceName,
      platform: dto.platform,
      pushToken: dto.pushToken,
      identityKeyPub: Buffer.from(dto.identityKeyPub, 'base64'),
      signedPrekeyPub: Buffer.from(dto.signedPrekeyPub, 'base64'),
      signedPrekeySig: Buffer.from(dto.signedPrekeySig, 'base64'),
      oneTimePrekeys: dto.oneTimePrekeys.map((opk) => ({
        keyId: opk.keyId,
        publicKey: Buffer.from(opk.publicKey, 'base64'),
      })),
      vaultBackup: dto.encryptedVaultBlob
        ? {
            encryptedVaultBlob: Buffer.from(dto.encryptedVaultBlob, 'base64'),
            kdfSalt: Buffer.alloc(16),
            kdfParams: { memory_cost: 65536, time_cost: 3, parallelism: 4 },
          }
        : undefined,
    });

    return ok({
      deviceId: device.deviceId,
      status: device.status,
    });
  }

  /**
   * P2-T01: Retrieves prekey bundles for all active devices of target user,
   * atomically claiming an unconsumed OPK for each.
   */
  public async getPrekeyBundles(
    targetUserId: string
  ): Promise<Result<PrekeyBundleDTO[], DomainError>> {
    const devices = await this.repo.getActiveDevicesForUser(targetUserId);
    if (devices.length === 0) {
      return err(new NotFoundError(`No active devices found for user ${targetUserId}`));
    }

    const bundles: PrekeyBundleDTO[] = [];

    for (const device of devices) {
      const opk = await this.repo.claimDeviceOpk(device.deviceId);

      bundles.push({
        userId: targetUserId,
        deviceId: device.deviceId,
        identityKeyPub: Buffer.from(device.identityKeyPub).toString('base64'),
        signedPrekeyPub: Buffer.from(device.signedPrekeyPub).toString('base64'),
        signedPrekeySig: Buffer.from(device.signedPrekeySig).toString('base64'),
        oneTimePrekey: opk
          ? {
              keyId: opk.keyId,
              publicKey: Buffer.from(opk.publicKey).toString('base64'),
            }
          : undefined,
      });
    }

    return ok(bundles);
  }

  public async updateKeyVault(
    userId: string,
    dto: {
      encryptedVaultBlob: string;
      kdfSalt: string;
      kdfParams: Record<string, unknown>;
      version?: number;
    }
  ): Promise<Result<KeyVaultDto, DomainError>> {
    const vault = await this.repo.upsertVault(userId, {
      encryptedVaultBlob: Buffer.from(dto.encryptedVaultBlob, 'base64'),
      kdfSalt: Buffer.from(dto.kdfSalt, 'base64'),
      kdfParams: dto.kdfParams,
      version: dto.version,
    });

    return ok({
      userId: vault.userId,
      encryptedVaultBlob: Buffer.from(vault.encryptedVaultBlob).toString('base64'),
      kdfSalt: Buffer.from(vault.kdfSalt).toString('base64'),
      kdfParams: vault.kdfParams as Record<string, unknown>,
      version: vault.version,
    });
  }

  public async getKeyVault(userId: string): Promise<Result<KeyVaultDto, DomainError>> {
    const vault = await this.repo.getVault(userId);
    if (!vault) {
      return err(new NotFoundError('No key backup vault found for user'));
    }

    return ok({
      userId: vault.userId,
      encryptedVaultBlob: Buffer.from(vault.encryptedVaultBlob).toString('base64'),
      kdfSalt: Buffer.from(vault.kdfSalt).toString('base64'),
      kdfParams: vault.kdfParams as Record<string, unknown>,
      version: vault.version,
    });
  }
}

export const devicesService = new DevicesService();
