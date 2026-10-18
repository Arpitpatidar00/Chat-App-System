import { ConversationHeader, type ConversationHeaderProps } from './ConversationHeader.js';
import { MessageFlatList, type MessageFlatListProps } from './MessageFlatList.js';
import { MessageInputBar, type MessageInputBarProps } from './MessageInputBar.js';

export interface ConversationViewProps {
  headerProps: ConversationHeaderProps;
  listProps: MessageFlatListProps;
  inputBarProps: MessageInputBarProps;
}

export function ConversationView({
  headerProps,
  listProps,
  inputBarProps,
}: ConversationViewProps) {
  return {
    component: 'ConversationView',
    layout: 'flex-column',
    children: {
      header: ConversationHeader(headerProps),
      viewport: MessageFlatList(listProps),
      footer: MessageInputBar(inputBarProps),
    },
  };
}
