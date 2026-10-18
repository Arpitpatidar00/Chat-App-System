import type { WebSocket } from 'ws';
import type { OutboundWSFrame } from '@chat/types';

export interface ActiveSession {
  userId: string;
  deviceId: string;
  socket: WebSocket;
  isAlive: boolean;
  connectedAt: Date;
}

export class WebSocketGateway {
  // Key format: `${userId}:${deviceId}`
  private readonly sessions = new Map<string, ActiveSession>();
  // User to set of deviceIds mapping
  private readonly userDevices = new Map<string, Set<string>>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  public register(userId: string, deviceId: string, socket: WebSocket): void {
    const sessionKey = `${userId}:${deviceId}`;

    // Clean up existing session on this device if any
    const existing = this.sessions.get(sessionKey);
    if (existing && existing.socket !== socket) {
      existing.socket.terminate();
    }

    const session: ActiveSession = {
      userId,
      deviceId,
      socket,
      isAlive: true,
      connectedAt: new Date(),
    };

    this.sessions.set(sessionKey, session);

    if (!this.userDevices.has(userId)) {
      this.userDevices.set(userId, new Set());
    }
    this.userDevices.get(userId)!.add(deviceId);

    socket.on('pong', () => {
      const s = this.sessions.get(sessionKey);
      if (s) {
        s.isAlive = true;
      }
    });

    socket.on('close', () => {
      this.unregister(userId, deviceId);
    });

    socket.on('error', () => {
      this.unregister(userId, deviceId);
    });
  }

  public unregister(userId: string, deviceId: string): void {
    const sessionKey = `${userId}:${deviceId}`;
    this.sessions.delete(sessionKey);

    const devices = this.userDevices.get(userId);
    if (devices) {
      devices.delete(deviceId);
      if (devices.size === 0) {
        this.userDevices.delete(userId);
      }
    }
  }

  public sendToDevice(userId: string, deviceId: string, payload: OutboundWSFrame): boolean {
    const sessionKey = `${userId}:${deviceId}`;
    const session = this.sessions.get(sessionKey);
    if (session && session.socket.readyState === 1 /* OPEN */) {
      session.socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  public sendToUserAllDevices(userId: string, payload: OutboundWSFrame): number {
    const devices = this.userDevices.get(userId);
    if (!devices) return 0;

    let deliveredCount = 0;
    for (const deviceId of devices) {
      if (this.sendToDevice(userId, deviceId, payload)) {
        deliveredCount++;
      }
    }
    return deliveredCount;
  }

  public getConnectedDevicesCount(): number {
    return this.sessions.size;
  }

  public isUserOnline(userId: string): boolean {
    const devices = this.userDevices.get(userId);
    return !!devices && devices.size > 0;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [sessionKey, session] of this.sessions.entries()) {
        if (!session.isAlive) {
          session.socket.terminate();
          this.sessions.delete(sessionKey);
          continue;
        }

        session.isAlive = false;
        session.socket.ping();
      }
    }, 15000);

    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  public destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const session of this.sessions.values()) {
      session.socket.terminate();
    }
    this.sessions.clear();
    this.userDevices.clear();
  }
}

export const wsGateway = new WebSocketGateway();
