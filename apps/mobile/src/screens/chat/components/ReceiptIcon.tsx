import type { MessageTransmissionStatus } from '@chat/types';

export interface ReceiptIconProps {
  status: MessageTransmissionStatus;
  size?: number;
}

/**
 * Atomic component: renders delivery state indicators.
 * - PENDING: 🕒
 * - SENT: ✓ (single grey)
 * - DELIVERED: ✓✓ (double grey)
 * - READ: ✓✓ (double blue)
 * - FAILED: ⚠️ (red warning)
 */
export function ReceiptIcon({ status, size = 14 }: ReceiptIconProps) {
  switch (status) {
    case 'PENDING':
      return { type: 'icon', name: 'clock-outline', color: '#8E8E93', label: 'Pending' };
    case 'SENT':
      return { type: 'icon', name: 'check', color: '#8E8E93', label: 'Sent' };
    case 'DELIVERED':
      return { type: 'icon', name: 'check-all', color: '#8E8E93', label: 'Delivered' };
    case 'READ':
      return { type: 'icon', name: 'check-all', color: '#34B7F1', label: 'Read' };
    case 'FAILED':
      return { type: 'icon', name: 'alert-circle', color: '#FF3B30', label: 'Failed' };
    default:
      return null;
  }
}
