import { ReceiptIcon } from './ReceiptIcon.js';
import type { MessageTransmissionStatus } from '@chat/types';

export interface MessageMetadataProps {
  timestamp: string;
  isOutgoing: boolean;
  status: MessageTransmissionStatus;
  isEdited?: boolean;
}

export function MessageMetadata({
  timestamp,
  isOutgoing,
  status,
  isEdited = false,
}: MessageMetadataProps) {
  const formattedTime = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    component: 'MessageMetadata',
    props: {
      time: formattedTime,
      isEdited,
      isOutgoing,
      receipt: isOutgoing ? ReceiptIcon({ status }) : null,
    },
  };
}
