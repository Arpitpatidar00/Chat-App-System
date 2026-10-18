import { AttachmentPickerButton, type AttachmentPickerButtonProps } from './AttachmentPickerButton.js';
import { EncryptedTextInput, type EncryptedTextInputProps } from './EncryptedTextInput.js';
import { SendButton, type SendButtonProps } from './SendButton.js';

export interface MessageInputBarProps {
  inputProps: EncryptedTextInputProps;
  attachmentProps?: AttachmentPickerButtonProps;
  sendProps: SendButtonProps;
}

export function MessageInputBar({
  inputProps,
  attachmentProps = {},
  sendProps,
}: MessageInputBarProps) {
  return {
    component: 'MessageInputBar',
    children: {
      attachmentButton: AttachmentPickerButton(attachmentProps),
      textInput: EncryptedTextInput(inputProps),
      sendButton: SendButton(sendProps),
    },
  };
}
