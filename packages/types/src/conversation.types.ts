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
