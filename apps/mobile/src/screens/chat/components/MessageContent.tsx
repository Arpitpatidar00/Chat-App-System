export type MessageContentType = 'TEXT' | 'IMAGE' | 'FILE' | 'LINK';

export interface MessageContentProps {
  type: MessageContentType;
  text?: string;
  attachmentMeta?: {
    fileName?: string;
    fileSizeBytes?: number;
    mimeType?: string;
    thumbnailUrl?: string;
    isDownloaded?: boolean;
  };
  linkMeta?: {
    url: string;
    title?: string;
    description?: string;
    previewImageUrl?: string;
  };
}

export function MessageContent({
  type,
  text,
  attachmentMeta,
  linkMeta,
}: MessageContentProps) {
  switch (type) {
    case 'TEXT':
      return {
        component: 'MessageContentText',
        text: text || '',
      };
    case 'IMAGE':
      return {
        component: 'MessageContentImage',
        thumbnailUrl: attachmentMeta?.thumbnailUrl || null,
        fileSizeBytes: attachmentMeta?.fileSizeBytes || 0,
        caption: text || null,
        isEncrypted: true,
      };
    case 'FILE':
      return {
        component: 'MessageContentFile',
        fileName: attachmentMeta?.fileName || 'Encrypted File',
        fileSizeBytes: attachmentMeta?.fileSizeBytes || 0,
        mimeType: attachmentMeta?.mimeType || 'application/octet-stream',
        isDownloaded: attachmentMeta?.isDownloaded ?? false,
      };
    case 'LINK':
      return {
        component: 'MessageContentLink',
        url: linkMeta?.url || '',
        title: linkMeta?.title || '',
        description: linkMeta?.description || '',
        previewImageUrl: linkMeta?.previewImageUrl || null,
        displayText: text || linkMeta?.url || '',
      };
    default:
      return {
        component: 'MessageContentUnknown',
        text: text || '',
      };
  }
}
