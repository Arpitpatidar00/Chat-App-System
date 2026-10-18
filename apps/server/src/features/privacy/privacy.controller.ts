import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MetadataTransparencyManifestDTO } from '@chat/types';

export class PrivacyController {
  public async getMetadataManifest(_request: FastifyRequest, reply: FastifyReply) {
    const manifest: MetadataTransparencyManifestDTO = {
      version: '1.0.0',
      cryptography: {
        keyExchange: 'X3DH (X25519 + Ed25519 + HKDF-SHA256)',
        doubleRatchet: 'Olm/Signal Double Ratchet with Forward Secrecy & Break-in Recovery',
        symmetricCipher: 'AES-256-GCM (96-bit IV, 128-bit authentication tag)',
        attachmentCipher: 'AES-256-GCM (client-side encrypted before pre-signed S3 upload)',
        moderationCipher: 'X25519 Ephemeral-Static ECDH + AES-256-GCM (Mod_PK scoped re-encryption)',
      },
      zeroPlaintextGuarantees: [
        'Zero server plaintext indexing (NFR-042)',
        'Zero plaintext push notification payloads (FR-067)',
        'Zero unselected message exposure during moderation disclosure (FR-071, FR-084)',
        'Zero plaintexts accessible to routine database administrators (NFR-029, NFR-039)',
      ],
      retentionPolicies: {
        messages: 'Durable until user delete-for-self or delete-for-everyone',
        attachments: 'Committed to S3 until tombstoned/purged',
        moderationReports: 'Strict 90-day retention with automatic purging (NFR-037)',
        adminAuditLogs: 'Immutable write-ahead append-only audit trail',
        deletedEntitiesRegistry: 'Persistent tombstone record preventing post-restore resurrection (NFR-040)',
      },
      transparencyDisclosures: [
        'Retained metadata: conversation_id, sender_id, seq_id, created_at, client_msg_id',
        'Excluded metadata: IP address redacted from application logs (NFR-026)',
        'Audit requirements: Justification strictly required for moderator payload access',
      ],
    };

    return reply.status(200).send({ data: manifest });
  }
}

export const privacyController = new PrivacyController();
