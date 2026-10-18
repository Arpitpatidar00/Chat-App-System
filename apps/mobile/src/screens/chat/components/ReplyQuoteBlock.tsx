export interface ReplyQuoteBlockProps {
  senderName: string;
  previewText: string;
  isOutgoing: boolean;
  onPress?: () => void;
}

export function ReplyQuoteBlock({
  senderName,
  previewText,
  isOutgoing,
  onPress,
}: ReplyQuoteBlockProps) {
  return {
    component: 'ReplyQuoteBlock',
    props: {
      senderName,
      previewText: previewText.length > 80 ? `${previewText.slice(0, 80)}...` : previewText,
      accentColor: isOutgoing ? '#00A884' : '#53BDEB',
      backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.08)',
      hasOnPress: !!onPress,
    },
  };
}
