/**
 * Master k6 Load Testing Configuration & Suite Runner
 * Corresponds to NFR benchmarks defined in:
 * - 09-phase9-non-functional-acceptance-and-release.md
 * - 10-architecture-tech-stack-and-monorepo.md
 */

export const k6Config = {
  environments: {
    local: {
      targetUrl: 'http://localhost:4000',
      wsUrl: 'ws://localhost:4000/ws',
    },
    docker: {
      targetUrl: 'http://api:3000',
      wsUrl: 'ws://api:3000/ws',
    },
  },
  thresholds: {
    // Latency & Processing Gates
    messageAckP95Ms: 500,     // NFR-005
    groupFanoutP95Ms: 1000,    // NFR-004
    historyFetchP95Ms: 1000,   // NFR-009
    reconnectSyncP95Ms: 1500,  // NFR-007
    maxFailureRate: 0.01,      // 99% availability bar
  },
  scenarios: [
    {
      name: 'message-throughput',
      file: './scenarios/message-throughput.js',
      description: '25 msg/s sustained load + 100 msg/s burst spike test',
    },
    {
      name: 'websocket-fanout',
      file: './scenarios/websocket-fanout.js',
      description: '100-member group real-time fanout latency verification',
    },
    {
      name: 'reconnect-storm',
      file: './scenarios/reconnect-storm.js',
      description: '100 concurrent reconnecting clients delta sync test',
    },
  ],
};

export default k6Config;
