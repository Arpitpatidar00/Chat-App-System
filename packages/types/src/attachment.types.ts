export type AttachmentStatus = 'UPLOADING' | 'COMMITTED' | 'DELETED';

export const ATTACHMENT_MAX_BYTES = 10_485_760; // 10 MB strict limit

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
] as const;

export interface InitAttachmentUploadDTO {
  conversationId: string;
  ciphertextSizeBytes: number;
  declaredMime: string;
  sha256Ciphertext: string;
  filename?: string;
}

export interface InitAttachmentResponseDTO {
  attachmentId: string;
  uploadUrl: string; // S3 pre-signed PUT URL
  objectKey: string;
  expiresAt: string;
}

export interface AttachmentDownloadResponseDTO {
  attachmentId: string;
  downloadUrl: string; // S3 pre-signed GET URL
  sha256Ciphertext: string;
  expiresAt: string;
}

export interface AttachmentDTO {
  id: string;
  conversationId: string;
  uploaderId: string;
  objectKey: string;
  ciphertextSizeBytes: number;
  declaredMime: string;
  sha256Ciphertext: string;
  status: AttachmentStatus;
  createdAt: string;
}
