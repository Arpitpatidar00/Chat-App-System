export type PresenceState = 'ONLINE' | 'TYPING' | 'OFFLINE';

export interface PresenceSubtitleProps {
  state: PresenceState;
  lastSeen?: string | null;
  typingUserName?: string | null;
}

export function PresenceSubtitle({
  state,
  lastSeen = null,
  typingUserName = null,
}: PresenceSubtitleProps) {
  let text = 'offline';
  let color = '#8696A0';

  if (state === 'TYPING') {
    text = typingUserName ? `${typingUserName} is typing...` : 'typing...';
    color = '#00A884'; // WhatsApp accent green
  } else if (state === 'ONLINE') {
    text = 'online';
    color = '#00A884';
  } else if (lastSeen) {
    const formattedDate = new Date(lastSeen).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    text = `last seen today at ${formattedDate}`;
  }

  return {
    component: 'PresenceSubtitle',
    props: {
      text,
      color,
      state,
    },
  };
}
