import { ReceiptIcon } from './ReceiptIcon.js';
import type { MessageTransmissionStatus } from '@chat/types';

export interface MessageBubbleProps {
  id: string;
  plaintext: string;
  isOutgoing: boolean;
  timestamp: string;
  status: MessageTransmissionStatus;
  isEdited?: boolean;
}

export function MessageBubble({
  id,
  plaintext,
  isOutgoing,
  timestamp,
  status,
  isEdited,
}: MessageBubbleProps) {
  const formattedTime = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    component: 'MessageBubble',
    id,
    props: {
      align: isOutgoing ? 'right' : 'left',
      backgroundColor: isOutgoing ? '#005C4B' : '#202C33',
      textColor: '#FFFFFF',
      text: plaintext,
      edited: isEdited,
      time: formattedTime,
      receipt: isOutgoing ? ReceiptIcon({ status }) : null,
    },
  };
}
