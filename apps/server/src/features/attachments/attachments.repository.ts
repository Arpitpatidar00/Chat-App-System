import { prisma, type Attachment, type AttachmentStatus } from '@chat/database';

export interface CreateAttachmentParams {
  id: string;
  conversationId: string;
  uploaderId: string;
  objectKey: string;
  ciphertextSizeBytes: number;
  declaredMime: string;
  sha256Ciphertext: string;
}

export class AttachmentsRepository {
  public async createAttachment(params: CreateAttachmentParams): Promise<Attachment> {
    return prisma.attachment.create({
      data: {
        id: params.id,
        conversationId: params.conversationId,
        uploaderId: params.uploaderId,
        objectKey: params.objectKey,
        ciphertextSizeBytes: params.ciphertextSizeBytes,
        declaredMime: params.declaredMime,
        sha256Ciphertext: params.sha256Ciphertext,
        status: 'UPLOADING',
      },
    });
  }

  public async findById(id: string): Promise<Attachment | null> {
    return prisma.attachment.findUnique({
      where: { id },
    });
  }

  public async findByObjectKey(objectKey: string): Promise<Attachment | null> {
    return prisma.attachment.findUnique({
      where: { objectKey },
    });
  }

  public async updateStatus(id: string, status: AttachmentStatus): Promise<Attachment> {
    return prisma.attachment.update({
      where: { id },
      data: { status },
    });
  }

  public async deleteAttachment(id: string): Promise<Attachment> {
    return prisma.attachment.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }

  public async findByConversation(conversationId: string): Promise<Attachment[]> {
    return prisma.attachment.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const attachmentsRepository = new AttachmentsRepository();
