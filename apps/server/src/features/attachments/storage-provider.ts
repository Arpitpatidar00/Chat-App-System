import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

export interface PresignedUrlResult {
  url: string;
  objectKey: string;
  expiresAt: Date;
}

export class StorageProvider {
  private static instance: StorageProvider;
  // Local store simulating S3 bucket objects for tests and local development
  private readonly objects = new Map<string, { data: Buffer; contentType: string }>();

  public static getInstance(): StorageProvider {
    if (!StorageProvider.instance) {
      StorageProvider.instance = new StorageProvider();
    }
    return StorageProvider.instance;
  }

  /**
   * Generates a pre-signed S3 PUT URL for uploading encrypted ciphertext blobs.
   */
  public async generateUploadUrl(
    objectKey: string,
    contentType: string,
    expiresInSeconds = 900
  ): Promise<PresignedUrlResult> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const signature = createHmac('sha256', env.JWT_SECRET)
      .update(`PUT\n${objectKey}\n${contentType}\n${expiresAt.getTime()}`)
      .digest('hex');

    // Standard S3 pre-signed format
    const baseUrl = `https://chat-attachments-prod.s3.ap-southeast-1.amazonaws.com`;
    const url = `${baseUrl}/${objectKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresInSeconds}&X-Amz-Signature=${signature}&X-Amz-Date=${Date.now()}`;

    return {
      url,
      objectKey,
      expiresAt,
    };
  }

  /**
   * Generates a short-lived (5-minute) pre-signed S3 GET URL for authorized downloads.
   */
  public async generateDownloadUrl(
    objectKey: string,
    expiresInSeconds = 300
  ): Promise<PresignedUrlResult> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const signature = createHmac('sha256', env.JWT_SECRET)
      .update(`GET\n${objectKey}\n${expiresAt.getTime()}`)
      .digest('hex');

    const baseUrl = `https://chat-attachments-prod.s3.ap-southeast-1.amazonaws.com`;
    const url = `${baseUrl}/${objectKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresInSeconds}&X-Amz-Signature=${signature}&X-Amz-Date=${Date.now()}`;

    return {
      url,
      objectKey,
      expiresAt,
    };
  }

  /**
   * Stores binary object in S3/simulated storage.
   */
  public async putObject(objectKey: string, data: Buffer, contentType: string): Promise<void> {
    this.objects.set(objectKey, { data, contentType });
  }

  /**
   * Retrieves binary object from S3/simulated storage.
   */
  public async getObject(objectKey: string): Promise<Buffer | null> {
    const obj = this.objects.get(objectKey);
    return obj ? obj.data : null;
  }

  /**
   * Deletes binary object permanently from S3/simulated storage (NFR-035).
   */
  public async deleteObject(objectKey: string): Promise<boolean> {
    return this.objects.delete(objectKey);
  }

  /**
   * Checks if object exists.
   */
  public hasObject(objectKey: string): boolean {
    return this.objects.has(objectKey);
  }

  /**
   * Clears all simulated storage objects (used in test tear-down).
   */
  public clear(): void {
    this.objects.clear();
  }
}

export const storageProvider = StorageProvider.getInstance();
