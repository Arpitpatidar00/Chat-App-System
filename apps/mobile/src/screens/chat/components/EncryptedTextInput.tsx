export interface EncryptedTextInputProps {
  value: string;
  placeholder?: string;
  maxLength?: number; // 4,096 char limit (DEC-01)
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const MAX_MESSAGE_CHARACTERS = 4096;

export function EncryptedTextInput({
  value,
  placeholder = 'Type an encrypted message...',
  maxLength = MAX_MESSAGE_CHARACTERS,
  onChangeText,
  onFocus,
  onBlur,
}: EncryptedTextInputProps) {
  const charactersRemaining = maxLength - value.length;

  return {
    component: 'EncryptedTextInput',
    props: {
      value,
      placeholder,
      maxLength,
      charactersRemaining,
      isNearLimit: charactersRemaining < 100,
      isOverLimit: charactersRemaining < 0,
      multiline: true,
      maxHeight: 120, // Auto-expand up to 120dp then scroll
      backgroundColor: '#2A3942',
      textColor: '#E9EDEF',
      placeholderTextColor: '#8696A0',
      hasOnChange: !!onChangeText,
    },
  };
}
