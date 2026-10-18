export interface UserBlockDTO {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface BlockUserRequestDTO {
  blockedUserId: string;
}

export type ReportStatusDTO = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'PURGED';

export interface CreateReportRequestDTO {
  reportedUserId: string;
  conversationId: string;
  reasonCode: string;
  disclosedMessagesEncrypted: string; // base64
  metadataSnapshot?: Record<string, any>;
}

export interface DisclosedMessageItem {
  messageId: string;
  senderId: string;
  plaintext: string;
  createdAt: string;
}

export interface ModerationReportDTO {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  conversationId: string;
  reasonCode: string;
  status: ReportStatusDTO;
  assignedReviewerId?: string | null;
  createdAt: string;
  metadataSnapshot?: Record<string, any>;
  decryptedMessages?: DisclosedMessageItem[];
}

export type AdminActionDTO = 'VIEW_REPORT' | 'SUSPEND_USER' | 'RESOLVE_REPORT' | 'REVOKE_DEVICE';

export interface AdminAuditLogDTO {
  logId: string;
  actorAdminId: string;
  actionType: AdminActionDTO;
  targetId: string;
  ipAddress: string;
  justification: string;
  createdAt: string;
}

export interface MetadataTransparencyManifestDTO {
  version: string;
  cryptography: {
    keyExchange: string;
    doubleRatchet: string;
    symmetricCipher: string;
    attachmentCipher: string;
    moderationCipher: string;
  };
  zeroPlaintextGuarantees: string[];
  retentionPolicies: Record<string, string>;
  transparencyDisclosures: string[];
}
