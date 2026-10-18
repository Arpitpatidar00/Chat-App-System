export interface CanaryProbeDetails {
  dbWriteLatencyMs: number;
  dbReadLatencyMs: number;
  wsBroadcastMs: number;
}

export interface CanaryProbeResultDTO {
  probeId: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  timestamp: string;
  details: CanaryProbeDetails;
}

export interface CanaryHealthSummaryDTO {
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  availabilityPct: number;
  totalProbes: number;
  passedProbes: number;
  failedProbes: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastProbeAt: string;
}

export interface SecurityAuditScanResultDTO {
  status: 'CLEAN' | 'VIOLATION';
  scannedTables: string[];
  scannedRecordsCount: number;
  leakedPlaintextBytes: number;
  violations: string[];
  scannedAt: string;
}

export interface DrFailoverAuditDTO {
  drillId: string;
  acknowledgedMessagesCount: number;
  recoveredMessagesCount: number;
  rpoLostMessages: number;
  rtoDurationMs: number;
  tombstonesScrubbedCount: number;
  resurrectedMessagesCount: number;
  status: 'SUCCESS' | 'FAILED';
}
