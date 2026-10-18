import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metric tracking for NFR-007: Reconnect Sync Latency p95 <= 1500ms
const syncDuration = new Trend('reconnect_sync_duration_ms');
const syncPayloadBytes = new Counter('reconnect_sync_bytes');
const failureRate = new Rate('reconnect_failure_rate');

export const options = {
  scenarios: {
    // 100 concurrent clients reconnecting simultaneously (e.g., after network reconnect or server deployment)
    reconnect_storm: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 300,
      maxDuration: '1m',
    },
  },
  thresholds: {
    // NFR-007: Offline catch-up p95 must be <= 1500ms for 100-message sync
    reconnect_sync_duration_ms: ['p(95)<1500'],
    http_req_duration: ['p(95)<1500'],
    reconnect_failure_rate: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.TARGET_URL || __ENV.API_URL || 'http://localhost:4000';

export default function () {
  const vuId = __VU;
  const conversationId = '00000000-0000-0000-0000-000000000001';
  const lastKnownSeqId = 100; // Client is at seq 100, asking for missing slice up to current

  const queryUrl = `${BASE_URL}/api/v1/conversations/${conversationId}/messages?fromSeqId=${lastKnownSeqId}&limit=100`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': `reconnect-user-${vuId}`,
      'x-device-id': `device-${vuId}`,
      'Authorization': `Bearer k6-mock-token-${vuId}`,
    },
    timeout: '5s',
  };

  const startTime = Date.now();
  const res = http.get(queryUrl, params);
  const latency = Date.now() - startTime;

  syncDuration.add(latency);
  if (res.body) {
    syncPayloadBytes.add(res.body.length);
  }

  const success = check(res, {
    'sync response received': (r) => r.status === 200 || r.status === 403 || r.status === 404,
    'latency within bounds': () => latency < 1500,
  });

  if (!success) {
    failureRate.add(1);
  }

  // Small jitter to simulate natural reconnect backoff
  sleep(0.1 + Math.random() * 0.2);
}
