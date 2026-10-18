export interface SendButtonProps {
  canSend: boolean;
  onSendPress?: () => void;
  onVoiceRecordPress?: () => void;
}

export function SendButton({
  canSend,
  onSendPress,
  onVoiceRecordPress,
}: SendButtonProps) {
  return {
    component: 'SendButton',
    props: {
      mode: canSend ? 'SEND' : 'VOICE_RECORD',
      icon: canSend ? 'send' : 'mic',
      backgroundColor: '#00A884',
      iconColor: '#FFFFFF',
      enabled: canSend ? !!onSendPress : !!onVoiceRecordPress,
    },
  };
}
