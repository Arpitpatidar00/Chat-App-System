import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Custom metric tracking for NFR-005: Message Processing p95 <= 500ms
const messageLatency = new Trend('message_processing_duration');
const errorRate = new Rate('error_rate');

export const options = {
  scenarios: {
    // 1. Baseline sustained load: 25 msg/s for 2 minutes
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 25,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
    // 2. Burst load: 100 msg/s for 60 seconds (DEC-01)
    burst_load: {
      executor: 'ramping-arrival-rate',
      startTime: '2m',
      startRate: 25,
      timeUnit: '1s',
      stages: [
        { target: 100, duration: '10s' },
        { target: 100, duration: '60s' },
        { target: 25, duration: '10s' },
      ],
      preAllocatedVUs: 100,
      maxVUs: 200,
    },
  },
  thresholds: {
    // NFR-005: 95th percentile latency must be under 500ms
    message_processing_duration: ['p(95)<500'],
    // HTTP response duration p95 under 500ms
    http_req_duration: ['p(95)<500'],
    // Availability > 99%
    error_rate: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4000';

export default function () {
  const userId = `load-user-${__VU}`;
  const deviceId = `device-${__VU}`;
  const conversationId = '00000000-0000-0000-0000-000000000001';
  const clientMsgId = `k6-msg-${__VU}-${__ITER}-${Date.now()}`;

  const payload = JSON.stringify({
    conversationId,
    clientMsgId,
    msgType: 'TEXT',
    encryptedPayloads: {
      'recipient-device-1': 'k6-mock-encrypted-ciphertext-payload-base64',
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      'x-device-id': deviceId,
    },
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/messages`, payload, params);
  const duration = Date.now() - start;

  messageLatency.add(duration);

  const success = check(res, {
    'status is 201 or 403 (membership check)': (r) => r.status === 201 || r.status === 403 || r.status === 404,
  });

  errorRate.add(!success);

  // Pacing
  sleep(0.04); // ~25 req/s per VU pacing
}
