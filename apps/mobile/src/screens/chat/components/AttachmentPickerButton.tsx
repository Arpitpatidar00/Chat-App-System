export interface AttachmentPickerButtonProps {
  maxSizeBytes?: number; // 10 MB limit (NFR-008, DEC-10)
  allowedMimeTypes?: string[];
  onAttachmentSelected?: (file: {
    uri: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
  }) => void;
}

export const DEFAULT_ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/aac',
  'application/pdf',
];

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function AttachmentPickerButton({
  maxSizeBytes = MAX_ATTACHMENT_SIZE_BYTES,
  allowedMimeTypes = DEFAULT_ALLOWED_MIMES,
  onAttachmentSelected,
}: AttachmentPickerButtonProps) {
  return {
    component: 'AttachmentPickerButton',
    props: {
      icon: 'paperclip',
      color: '#8696A0',
      maxSizeBytes,
      allowedMimeTypes,
      hasHandler: !!onAttachmentSelected,
    },
  };
}
