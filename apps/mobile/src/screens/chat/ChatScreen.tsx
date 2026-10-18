import { ConversationView } from './components/ConversationView.js';
import type { MessageItemProps } from './components/MessageItem.js';
import type { PresenceState } from './components/PresenceSubtitle.js';
import type { MessageTransmissionStatus } from '@chat/types';

export interface ChatMessageItem {
  id: string;
  plaintext: string;
  isOutgoing: boolean;
  timestamp: string;
  status: MessageTransmissionStatus;
  isEdited?: boolean;
}

export interface ChatScreenProps {
  conversationId: string;
  conversationTitle?: string;
  currentUserId: string;
  currentDeviceId: string;
  presenceState?: PresenceState;
  messages: ChatMessageItem[];
  inputValue?: string;
  onSend?: (text: string) => void;
  onBack?: () => void;
}

export function ChatScreen({
  conversationId,
  conversationTitle = 'Encrypted Chat',
  currentUserId,
  currentDeviceId,
  presenceState = 'ONLINE',
  messages,
  inputValue = '',
  onSend,
  onBack,
}: ChatScreenProps) {
  const messageItems: MessageItemProps[] = messages.map((m) => ({
    bubbleProps: {
      id: m.id,
      plaintext: m.plaintext,
      isOutgoing: m.isOutgoing,
      timestamp: m.timestamp,
      status: m.status,
      isEdited: m.isEdited,
    },
    canEdit: m.isOutgoing,
  }));

  const view = ConversationView({
    headerProps: {
      titleProps: {
        title: conversationTitle,
        isEncrypted: true,
      },
      presenceProps: {
        state: presenceState,
      },
      onBackPress: onBack,
    },
    listProps: {
      items: messageItems,
      inverted: true,
    },
    inputBarProps: {
      inputProps: {
        value: inputValue,
      },
      sendProps: {
        canSend: inputValue.trim().length > 0,
        onSendPress: onSend ? () => onSend(inputValue) : undefined,
      },
    },
  });

  return {
    component: 'ChatScreen',
    conversationId,
    currentUserId,
    currentDeviceId,
    renderedTree: view,
  };
}
