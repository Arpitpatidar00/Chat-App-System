import { MessageBubble, type MessageBubbleProps } from './MessageBubble.js';
import { MessageActionBar, type MessageActionBarProps } from './MessageActionBar.js';

export interface MessageItemProps {
  bubbleProps: MessageBubbleProps;
  showActionBar?: boolean;
  canEdit?: boolean;
  onSwipeToReply?: () => void;
  onLongPress?: () => void;
}

export function MessageItem({
  bubbleProps,
  showActionBar = false,
  canEdit = false,
  onSwipeToReply,
  onLongPress,
}: MessageItemProps) {
  const bubble = MessageBubble(bubbleProps);

  const actionBarProps: MessageActionBarProps = {
    messageId: bubbleProps.id,
    isOutgoing: bubbleProps.isOutgoing,
    canEdit,
  };

  return {
    component: 'MessageItem',
    id: bubbleProps.id,
    gestures: {
      swipeToReplyEnabled: !!onSwipeToReply,
      longPressEnabled: !!onLongPress,
    },
    children: {
      bubble,
      actionBar: showActionBar ? MessageActionBar(actionBarProps) : null,
    },
  };
}
