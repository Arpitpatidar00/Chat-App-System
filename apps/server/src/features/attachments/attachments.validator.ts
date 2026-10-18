import {
  AttachmentTooLargeError,
  UnsupportedFileTypeError,
  ValidationError,
} from '../../core/errors/domain-error.js';
import { ALLOWED_MIME_TYPES } from '@chat/types';

// Bounded ceiling: 10 MB raw file (10,485,760 bytes) + 28 bytes AES-GCM IV/Tag + 14 KB tolerance (NFR-004)
export const MAX_CIPHERTEXT_BYTES = 10_500_000;

const DISALLOWED_EXTENSIONS = [
  '.exe',
  '.apk',
  '.sh',
  '.bat',
  '.msi',
  '.cmd',
  '.com',
  '.vbs',
  '.scr',
  '.pif',
  '.bin',
  '.elf',
];

const DISALLOWED_MIMES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-bat',
  'application/vnd.android.package-archive',
  'application/x-dosexec',
  'application/x-shellscript',
];

/**
 * P6-T03: MIME Whitelist & Executable Gate (FR-046, FR-052, NFR-004).
 */
export function validateAttachmentUpload(params: {
  ciphertextSizeBytes: number;
  declaredMime: string;
  filename?: string;
}): void {
  // 1. Size ceiling check
  if (params.ciphertextSizeBytes <= 0) {
    throw new ValidationError('Attachment size must be greater than 0 bytes');
  }

  if (params.ciphertextSizeBytes > MAX_CIPHERTEXT_BYTES) {
    throw new AttachmentTooLargeError(
      `Attachment size ${params.ciphertextSizeBytes} exceeds maximum permitted 10 MB ceiling (NFR-004)`
    );
  }

  // 2. Executable extension check (FR-052)
  if (params.filename) {
    const lowerName = params.filename.toLowerCase();
    for (const ext of DISALLOWED_EXTENSIONS) {
      if (lowerName.endsWith(ext)) {
        throw new UnsupportedFileTypeError(
          `Executable and script extensions (${ext}) are strictly blocked for security (FR-052)`
        );
      }
    }
  }

  // 3. Disallowed executable MIME check
  const lowerMime = params.declaredMime.toLowerCase().trim();
  if (DISALLOWED_MIMES.includes(lowerMime)) {
    throw new UnsupportedFileTypeError(
      `MIME type ${params.declaredMime} is blocked as an executable/binary format (FR-052)`
    );
  }

  // 4. Allowed MIME whitelist check
  const isAllowed =
    ALLOWED_MIME_TYPES.includes(lowerMime as any) ||
    lowerMime.startsWith('image/') ||
    lowerMime.startsWith('audio/') ||
    lowerMime.startsWith('video/') ||
    lowerMime === 'application/pdf' ||
    lowerMime === 'text/plain' ||
    lowerMime === 'application/zip';

  if (!isAllowed) {
    throw new UnsupportedFileTypeError(
      `MIME type ${params.declaredMime} is not in the permitted whitelist (FR-052)`
    );
  }
}
