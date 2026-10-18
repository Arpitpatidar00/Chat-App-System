export const RECEIPT_STATUS = {
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
} as const;

export type ReceiptStatusCode = (typeof RECEIPT_STATUS)[keyof typeof RECEIPT_STATUS];

export interface ReceiptAckDTO {
  action: 'RECEIPT_ACK';
  messageId: string;
  status: 2; // DELIVERED
}

export interface ReadUpToDTO {
  action: 'READ_UP_TO';
  conversationId: string;
  maxSeqId: string;
}

export interface GroupReaderItemDTO {
  userId: string;
  username: string;
  readAt: string;
}
