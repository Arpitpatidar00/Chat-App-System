import { TitleAndAvatar, type TitleAndAvatarProps } from './TitleAndAvatar.js';
import { PresenceSubtitle, type PresenceSubtitleProps } from './PresenceSubtitle.js';

export interface ConversationHeaderProps {
  titleProps: TitleAndAvatarProps;
  presenceProps: PresenceSubtitleProps;
  onBackPress?: () => void;
  onCallPress?: () => void;
  onMenuPress?: () => void;
}

export function ConversationHeader({
  titleProps,
  presenceProps,
  onBackPress,
  onCallPress,
  onMenuPress,
}: ConversationHeaderProps) {
  return {
    component: 'ConversationHeader',
    children: {
      titleSection: TitleAndAvatar(titleProps),
      presenceSection: PresenceSubtitle(presenceProps),
    },
    actions: {
      hasBackButton: true,
      hasCallButton: !!onCallPress,
      hasMenuButton: !!onMenuPress,
    },
  };
}
