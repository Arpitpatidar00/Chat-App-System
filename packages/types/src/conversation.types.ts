export type ConversationType = 'DIRECT' | 'GROUP';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'REMOVED';

export interface ConversationSummaryDTO {
  id: string;
  type: ConversationType;
  title: string | null;
  lastSeqId: string;
  memberCount: number;
  unreadCount: number;
  lastActivityAt: string;
  pinnedMessageId?: string | null;
}

export interface CreateDirectConversationDTO {
  peerUserId: string;
}

export interface CreateGroupConversationDTO {
  title: string;
  memberIds: string[];
}

export interface AddGroupMemberDTO {
  userId: string;
  encryptedHistoryPackage?: string;
}

export interface UploadHistoryPackageDTO {
  recipientUserId: string;
  fromSeqId: string;
  toSeqId: string;
  encryptedHistoryKeyBundle: string; // base64
}

export interface GroupHistoryPackageDTO {
  id: string;
  conversationId: string;
  recipientUserId: string;
  fromSeqId: string;
  toSeqId: string;
  encryptedHistoryKeyBundle: string; // base64
  createdAt: string;
}

