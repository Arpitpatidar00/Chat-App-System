export interface ReactionSummary {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export interface ReactionsPillListProps {
  reactions: ReactionSummary[];
  onReactionPress?: (emoji: string) => void;
}

export function ReactionsPillList({
  reactions,
  onReactionPress,
}: ReactionsPillListProps) {
  if (!reactions || reactions.length === 0) {
    return null;
  }

  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0);

  return {
    component: 'ReactionsPillList',
    props: {
      totalCount,
      pills: reactions.map((r) => ({
        emoji: r.emoji,
        count: r.count,
        userReacted: r.userReacted,
        backgroundColor: r.userReacted ? 'rgba(0, 168, 132, 0.2)' : 'rgba(255, 255, 255, 0.12)',
        borderColor: r.userReacted ? '#00A884' : 'transparent',
      })),
      hasOnPress: !!onReactionPress,
    },
  };
}
