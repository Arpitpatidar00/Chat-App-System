export type UserStatus = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'SUSPENDED' | 'DELETED';
export type DevicePlatform = 'IOS' | 'ANDROID' | 'WEB';
export type DeviceStatus = 'ACTIVE' | 'REVOKED';

export interface UserSessionPayload {
  userId: string;
  deviceId: string;
  username: string;
  status: UserStatus;
  platform: DevicePlatform;
}

export interface EnrollDeviceRequestDTO {
  deviceName: string;
  platform: DevicePlatform;
  pushToken?: string;
  identityKeyPub: string; // base64
  signedPrekeyPub: string; // base64
  signedPrekeySig: string; // base64
  oneTimePrekeys: Array<{ keyId: number; publicKey: string }>;
  encryptedVaultBlob?: string;
}

export interface PrekeyBundleDTO {
  userId: string;
  deviceId: string;
  identityKeyPub: string;
  signedPrekeyPub: string;
  signedPrekeySig: string;
  oneTimePrekey?: { keyId: number; publicKey: string };
}
