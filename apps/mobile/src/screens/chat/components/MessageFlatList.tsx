import { MessageItem, type MessageItemProps } from './MessageItem.js';

export interface MessageFlatListProps {
  items: MessageItemProps[];
  inverted?: boolean;
  onEndReached?: () => void; // Pagination / load older history
  onEndReachedThreshold?: number;
  isFetchingHistory?: boolean;
}

export function MessageFlatList({
  items,
  inverted = true,
  onEndReached,
  onEndReachedThreshold = 0.5,
  isFetchingHistory = false,
}: MessageFlatListProps) {
  return {
    component: 'MessageFlatList',
    props: {
      inverted,
      initialNumToRender: 25,
      maxToRenderPerBatch: 20,
      windowSize: 10,
      onEndReachedThreshold,
      hasOnEndReached: !!onEndReached,
      isFetchingHistory,
    },
    renderedRows: items.map((item) => MessageItem(item)),
  };
}
