export interface MessageActionBarProps {
  messageId: string;
  isOutgoing: boolean;
  canEdit?: boolean;
  onCopy?: () => void;
  onEdit?: () => void;
  onDeleteForMe?: () => void;
  onDeleteForEveryone?: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onReply?: () => void;
}

export function MessageActionBar({
  messageId,
  isOutgoing,
  canEdit = false,
  onCopy,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onForward,
  onPin,
  onReply,
}: MessageActionBarProps) {
  const actions = [
    { id: 'reply', label: 'Reply', icon: 'arrow-undo' },
    { id: 'copy', label: 'Copy Text', icon: 'copy' },
    { id: 'forward', label: 'Forward', icon: 'arrow-redo' },
    { id: 'pin', label: 'Pin Message', icon: 'pin' },
  ];

  if (isOutgoing && canEdit) {
    actions.push({ id: 'edit', label: 'Edit (48h)', icon: 'pencil' });
  }

  actions.push({ id: 'delete_me', label: 'Delete for me', icon: 'trash' });

  if (isOutgoing) {
    actions.push({ id: 'delete_everyone', label: 'Delete for everyone', icon: 'trash-bin' });
  }

  return {
    component: 'MessageActionBar',
    messageId,
    actions,
  };
}
