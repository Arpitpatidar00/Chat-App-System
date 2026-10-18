import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics for NFR-004: Group Message Fan-out Latency p95 <= 1000ms
const fanoutLatency = new Trend('websocket_fanout_latency_ms');
const receivedFrames = new Counter('websocket_frames_received');
const failureRate = new Rate('websocket_failure_rate');

export const options = {
  scenarios: {
    group_fanout_100_members: {
      executor: 'per-vu-iterations',
      vus: 100, // Simulates 100 concurrent group members
      iterations: 5,
      maxDuration: '2m',
    },
  },
  thresholds: {
    // NFR-004: 100-member group fan-out p95 must be <= 1000ms
    websocket_fanout_latency_ms: ['p(95)<1000'],
    websocket_failure_rate: ['rate<0.01'],
  },
};

const WS_BASE_URL = __ENV.WS_URL || 'ws://localhost:4000/ws';

export default function () {
  const vuId = __VU;
  const conversationId = '00000000-0000-0000-0000-000000000001';
  const testToken = `k6_fanout_token_vu_${vuId}`;

  const url = `${WS_BASE_URL}?token=${testToken}&vu=${vuId}`;

  const res = ws.connect(url, {}, function (socket) {
    let messageSentTimestamp = 0;

    socket.on('open', () => {
      // VU 1 acts as the active sender in the 100-member group
      if (vuId === 1) {
        sleep(0.5); // Allow all 100 VUs to establish socket handshake
        messageSentTimestamp = Date.now();

        socket.send(
          JSON.stringify({
            action: 'MSG_SEND',
            client_msg_id: `fanout-msg-${Date.now()}`,
            conversation_id: conversationId,
            msg_type: 'TEXT',
            encrypted_payloads: {
              all_members_broadcast: 'k6_fanout_encrypted_sample_data',
            },
          })
        );
      }
    });

    socket.on('message', (data) => {
      receivedFrames.add(1);
      try {
        const frame = JSON.parse(data);

        if (frame.action === 'MSG_ACK' && vuId === 1) {
          const ackDuration = Date.now() - messageSentTimestamp;
          fanoutLatency.add(ackDuration);
          check(frame, {
            'sender ACK received': (f) => f.status === 'SENT',
          });
        } else if (frame.action === 'MSG_RECEIVE') {
          if (frame.sent_at) {
            const deliveryLatency = Date.now() - new Date(frame.sent_at).getTime();
            fanoutLatency.add(deliveryLatency);
          }
          check(frame, {
            'member received fan-out frame': (f) => !!f.seq_id,
          });
        }
      } catch (err) {
        failureRate.add(1);
      }
    });

    socket.on('error', (e) => {
      failureRate.add(1);
    });

    // Stay connected to receive fanout distribution
    sleep(2.0);
    socket.close();
  });

  check(res, {
    'websocket connected successfully': (r) => r && r.status === 101,
  });
}
