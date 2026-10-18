import { prisma, type User, type Device } from '@chat/database';

export class AuthRepository {
  public async findUserByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  public async findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  public async findDeviceById(deviceId: string): Promise<Device | null> {
    return prisma.device.findUnique({
      where: { deviceId },
    });
  }

  public async updateDeviceLastActive(deviceId: string): Promise<void> {
    await prisma.device.update({
      where: { deviceId },
      data: { lastActiveAt: new Date() },
    });
  }
}

export const authRepository = new AuthRepository();
