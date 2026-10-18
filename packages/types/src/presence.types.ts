export type PresenceVisibility = 'EVERYONE' | 'CONTACTS' | 'NOBODY';

export interface UserPresenceDTO {
  userId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface TypingIndicatorDTO {
  action: 'TYPING_START' | 'TYPING_STOP';
  conversationId: string;
  clientTimestamp: number;
}
