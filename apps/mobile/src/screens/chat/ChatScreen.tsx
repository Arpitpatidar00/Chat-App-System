import { MessageBubble } from './components/MessageBubble.js';
import { MessageSender } from './hooks/useMessageSend.js';
import type { MessageTransmissionStatus } from '@chat/types';

export interface ChatMessageItem {
  id: string;
  plaintext: string;
  isOutgoing: boolean;
  timestamp: string;
  status: MessageTransmissionStatus;
}

export interface ChatScreenProps {
  conversationId: string;
  currentUserId: string;
  currentDeviceId: string;
  messages: ChatMessageItem[];
}

export function ChatScreen({ conversationId, currentUserId, currentDeviceId, messages }: ChatScreenProps) {
  return {
    component: 'ChatScreen',
    conversationId,
    elements: {
      header: {
        title: `Chat ${conversationId.slice(0, 8)}`,
      },
      messageList: messages.map((m) =>
        MessageBubble({
          id: m.id,
          plaintext: m.plaintext,
          isOutgoing: m.isOutgoing,
          timestamp: m.timestamp,
          status: m.status,
        })
      ),
      inputArea: {
        placeholder: 'Type an encrypted message...',
      },
    },
  };
}
