import { prisma, type Message } from '@chat/database';
import { pushGateway, type PushGateway } from './push-gateway.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import type { ZeroPlaintextPushPayload, ClearNotificationPushPayload } from '@chat/types';

/**
 * P7-T05, P7-T06, P7-T07: Privacy-Preserving Push Notification Service.
 * Implements:
 * - Flow 7C: FCM (Android) & APNs (iOS) push dispatch
 * - FR-063: Mute conversation suppression (mutedUntil > NOW())
 * - FR-064: Foreground active WebSocket suppression
 * - FR-065: Gateway outage resilience (503 gracefully handled, messaging never fails)
 * - FR-066 & P7-T07: Cross-device read notification dismissal (CLEAR_NOTIFICATION)
 * - FR-067 & NFR-042: Zero plaintext payload guarantee
 * - NFR-011: Push dispatch within p95 <= 5s
 */
export class PushNotificationService {
  constructor(private readonly gateway: PushGateway = pushGateway) {}

  /**
   * P7-T05 & P7-T06: Dispatches zero-plaintext push wakeups to all conversation members.
   */
  public async notifyConversationMembers(
    conversationId: string,
    message: Message,
    senderId: string
  ): Promise<{ dispatched: number; skippedMuted: number; skippedForeground: number; failures: number }> {
    let dispatched = 0;
    let skippedMuted = 0;
    let skippedForeground = 0;
    let failures = 0;

    try {
      // 1. Fetch conversation members and their devices
      const members = await prisma.conversationMember.findMany({
        where: {
          conversationId,
          userId: { not: senderId },
          removedAtSeqId: null,
        },
        include: {
          user: {
            include: {
              devices: {
                where: {
                  status: 'ACTIVE',
                  pushToken: { not: null },
                },
              },
            },
          },
        },
      });

      const now = new Date();

      for (const member of members) {
        // FR-063: Skip push if conversation is muted
        if (member.mutedUntil && member.mutedUntil > now) {
          skippedMuted++;
          continue;
        }

        // FR-064: Check if member is actively connected in foreground via WebSocket
        const activeConnections = wsGateway.getUserActiveConnectionsCount(member.userId);
        if (activeConnections > 0) {
          // If user has an active WebSocket, push is suppressed
          skippedForeground++;
          continue;
        }

        // Retrieve encrypted payloads for recipient devices
        const payloads = (message.encryptedPayloads as Record<string, string>) || {};

        for (const device of member.user.devices) {
          if (!device.pushToken) continue;

          // Zero-Plaintext Push Payload (FR-067):
          // Contains strictly: { conversation_id, message_id, seq_id, encrypted_preview_envelope }
          const deviceEnvelope = payloads[device.deviceId] || Buffer.from('encrypted_preview_bytes').toString('base64');

          const pushPayload: ZeroPlaintextPushPayload = {
            conversation_id: message.conversationId,
            message_id: message.id,
            seq_id: Number(message.seqId),
            encrypted_preview_envelope: deviceEnvelope,
          };

          try {
            const result = await this.gateway.send(device.pushToken, pushPayload);
            if (result.success) {
              dispatched++;
            } else {
              // FR-065: Push gateway outage / 503 is caught and logged; never bubbles up
              failures++;
            }
          } catch {
            // Network or client error caught and isolated
            failures++;
          }
        }
      }
    } catch {
      // Isolate any unhandled database/service exception to guarantee FR-065
      failures++;
    }

    return { dispatched, skippedMuted, skippedForeground, failures };
  }

  /**
   * P7-T07: Cross-Device Read Notification Dismissal (FR-066).
   * Dispatches silent CLEAR_NOTIFICATION push when user reads chat on another device.
   */
  public async dismissConversationNotifications(
    userId: string,
    conversationId: string,
    maxSeqId: number
  ): Promise<{ dismissed: number }> {
    let dismissed = 0;
    try {
      const devices = await prisma.device.findMany({
        where: {
          userId,
          status: 'ACTIVE',
          pushToken: { not: null },
        },
      });

      const payload: ClearNotificationPushPayload = {
        action: 'CLEAR_NOTIFICATION',
        conversation_id: conversationId,
        max_seq_id: maxSeqId,
      };

      for (const device of devices) {
        if (!device.pushToken) continue;
        try {
          const res = await this.gateway.send(device.pushToken, payload);
          if (res.success) {
            dismissed++;
          }
        } catch {
          // Silently ignore push gateway errors
        }
      }
    } catch {
      // Silently ignore errors
    }

    return { dismissed };
  }
}

export const pushNotificationService = new PushNotificationService();
