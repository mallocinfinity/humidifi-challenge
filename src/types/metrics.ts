// ============================================================================
// PERFORMANCE METRICS TYPES
// ============================================================================

/** Latency measurements */
export interface LatencyMetrics {
  current: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
}

/** Performance metrics */
export interface Metrics {
  // Throughput
  messagesPerSecond: number;

  // Latency (WebSocket message → DOM update)
  latencyMs: LatencyMetrics;

  // Rendering
  fps: number;
  droppedFrames: number;
  rowsRerenderedLastUpdate: number;

  // Memory
  heapUsedMB: number;
  heapGrowthMB: number;       // Since start

  // Connection
  reconnectCount: number;
  sequenceGaps: number;
  tabCount: number;           // For multi-tab mode
}

/** Default/initial metrics state */
export const DEFAULT_METRICS: Metrics = {
  messagesPerSecond: 0,
  latencyMs: {
    current: 0,
    avg: 0,
    min: Infinity,
    max: 0,
    p95: 0,
  },
  fps: 0,
  droppedFrames: 0,
  rowsRerenderedLastUpdate: 0,
  heapUsedMB: 0,
  heapGrowthMB: 0,
  reconnectCount: 0,
  sequenceGaps: 0,
  tabCount: 1,
};
