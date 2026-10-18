export interface TitleAndAvatarProps {
  title: string;
  avatarUrl?: string | null;
  isEncrypted?: boolean;
}

export function TitleAndAvatar({
  title,
  avatarUrl = null,
  isEncrypted = true,
}: TitleAndAvatarProps) {
  return {
    component: 'TitleAndAvatar',
    props: {
      title,
      avatarUrl,
      isEncrypted,
      lockBadge: isEncrypted
        ? { icon: 'lock-closed', color: '#00A884', label: 'End-to-End Encrypted' }
        : null,
    },
  };
}
