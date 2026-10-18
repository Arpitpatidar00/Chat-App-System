import { ReceiptIcon } from './ReceiptIcon.js';
import { ReplyQuoteBlock, type ReplyQuoteBlockProps } from './ReplyQuoteBlock.js';
import { MessageContent, type MessageContentProps } from './MessageContent.js';
import { MessageMetadata } from './MessageMetadata.js';
import { ReactionsPillList, type ReactionSummary } from './ReactionsPillList.js';
import type { MessageTransmissionStatus } from '@chat/types';

export interface MessageBubbleProps {
  id: string;
  plaintext: string;
  isOutgoing: boolean;
  timestamp: string;
  status: MessageTransmissionStatus;
  isEdited?: boolean;
  replyQuote?: ReplyQuoteBlockProps | null;
  contentProps?: MessageContentProps | null;
  reactions?: ReactionSummary[];
}

export function MessageBubble({
  id,
  plaintext,
  isOutgoing,
  timestamp,
  status,
  isEdited = false,
  replyQuote = null,
  contentProps = null,
  reactions = [],
}: MessageBubbleProps) {
  const content = contentProps
    ? MessageContent(contentProps)
    : MessageContent({ type: 'TEXT', text: plaintext });

  return {
    component: 'MessageBubble',
    id,
    props: {
      align: isOutgoing ? 'right' : 'left',
      backgroundColor: isOutgoing ? '#005C4B' : '#202C33',
      textColor: '#FFFFFF',
      text: plaintext,
      edited: isEdited,
      replyQuote: replyQuote ? ReplyQuoteBlock(replyQuote) : null,
      content,
      metadata: MessageMetadata({
        timestamp,
        isOutgoing,
        status,
        isEdited,
      }),
      reactions: ReactionsPillList({ reactions }),
    },
  };
}
