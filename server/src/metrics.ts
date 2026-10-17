import client from 'prom-client';

export const register = new client.Registry();

// Collect default Node.js runtime metrics (event loop lag, memory, CPU, GC)
client.collectDefaultMetrics({ register, prefix: 'static_' });

// Domain Metrics
export const activeRoomsGauge = new client.Gauge({
  name: 'static_active_rooms',
  help: 'Total number of active rooms currently in memory',
  registers: [register]
});

export const participantsGauge = new client.Gauge({
  name: 'static_participants_total',
  help: 'Total number of connected participants partitioned by state',
  labelNames: ['state'], // PARTY | LOUNGE | QUEUED | DISCONNECTED
  registers: [register]
});

export const queueLengthGauge = new client.Gauge({
  name: 'static_queue_length_total',
  help: 'Total number of participants waiting in queues across all rooms',
  registers: [register]
});

export const signalingMessagesCounter = new client.Counter({
  name: 'static_signaling_messages_total',
  help: 'Total WebRTC signaling messages processed',
  labelNames: ['type'], // offer | answer | ice-candidate
  registers: [register]
});

export const signalingRejectedCounter = new client.Counter({
  name: 'static_signaling_rejected_total',
  help: 'Total WebRTC signaling messages rejected by security gates',
  labelNames: ['reason'],
  registers: [register]
});

export const rateLimitHitsCounter = new client.Counter({
  name: 'static_rate_limit_hits_total',
  help: 'Total requests blocked by rate limiting',
  labelNames: ['action'],
  registers: [register]
});

export const reconnectsCounter = new client.Counter({
  name: 'static_reconnects_total',
  help: 'Total session reconnect attempts',
  labelNames: ['status'], // success | failed | expired
  registers: [register]
});

export const gracePeriodSavesCounter = new client.Counter({
  name: 'static_grace_period_saves_total',
  help: 'Total times host reconnected before the 8-second grace period expired',
  registers: [register]
});

export const iceConfigRequestsCounter = new client.Counter({
  name: 'static_ice_config_requests_total',
  help: 'Total get-ice-config requests serviced',
  registers: [register]
});
