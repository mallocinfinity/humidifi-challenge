// MetricsPanel component - Phase 6
// Displays detailed performance metrics with color-coded indicators

import { useState, useEffect, useCallback } from 'react';
import { useMetrics } from '@/hooks';
import './MetricsPanel.css';

// Performance thresholds from SPEC
const THRESHOLDS = {
  latencyGood: 10,      // <10ms is good
  latencyWarn: 16.67,   // >16.67ms misses frame
  fpsGood: 58,          // 58-60 is good
  fpsWarn: 55,          // <55 is concerning
};

// Get CSS class for latency value
function getLatencyClass(ms: number): string {
  if (ms <= THRESHOLDS.latencyGood) return 'good';
  if (ms <= THRESHOLDS.latencyWarn) return 'warning';
  return 'bad';
}

// Get CSS class for FPS value
function getFpsClass(fps: number): string {
  if (fps >= THRESHOLDS.fpsGood) return 'good';
  if (fps >= THRESHOLDS.fpsWarn) return 'warning';
  return 'bad';
}

export function MetricsPanel() {
  const metrics = useMetrics();
  const [collapsed, setCollapsed] = useState(false);
  const [heapMB, setHeapMB] = useState(0);

  // Toggle collapsed state
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  // Track memory usage (only available in some browsers)
  useEffect(() => {
    const updateHeap = () => {
      // @ts-expect-error - memory API not in all browsers
      const memory = performance.memory;
      if (memory) {
        setHeapMB(Math.round(memory.usedJSHeapSize / 1024 / 1024 * 10) / 10);
      }
    };

    updateHeap();
    const interval = setInterval(updateHeap, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`metrics-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="metrics-panel-header" onClick={toggleCollapsed}>
        <span className="metrics-panel-title">Performance</span>
        <span className="metrics-panel-toggle">{collapsed ? 'expand' : 'collapse'}</span>
      </div>

      <div className="metrics-panel-content">
        {/* Throughput */}
        <div className="metrics-section">
          <div className="metrics-section-title">Throughput</div>
          <div className="metrics-row">
            <span className="metrics-label">Messages/sec</span>
            <span className="metrics-value">{metrics.messagesPerSecond}</span>
          </div>
        </div>

        {/* Latency */}
        <div className="metrics-section">
          <div className="metrics-section-title">Latency (ms)</div>
          <div className="metrics-row">
            <span className="metrics-label">Average</span>
            <span className={`metrics-value ${getLatencyClass(metrics.latencyMs.avg)}`}>
              {metrics.latencyMs.avg.toFixed(1)}
            </span>
          </div>
          <div className="latency-breakdown">
            <div className="latency-stat">
              <span className="latency-stat-label">cur</span>
              <span className="latency-stat-value">{metrics.latencyMs.current.toFixed(1)}</span>
            </div>
            <div className="latency-stat">
              <span className="latency-stat-label">min</span>
              <span className="latency-stat-value">
                {(metrics.latencyMs.min === Infinity || metrics.messagesPerSecond === 0) ? '-' : metrics.latencyMs.min.toFixed(1)}
              </span>
            </div>
            <div className="latency-stat">
              <span className="latency-stat-label">avg</span>
              <span className="latency-stat-value">{metrics.latencyMs.avg.toFixed(1)}</span>
            </div>
            <div className="latency-stat">
              <span className="latency-stat-label">max</span>
              <span className="latency-stat-value">{metrics.latencyMs.max.toFixed(1)}</span>
            </div>
            <div className="latency-stat">
              <span className="latency-stat-label">p95</span>
              <span className="latency-stat-value">{metrics.latencyMs.p95.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Rendering */}
        <div className="metrics-section">
          <div className="metrics-section-title">Rendering</div>
          <div className="metrics-row">
            <span className="metrics-label">FPS</span>
            <span className={`metrics-value ${getFpsClass(metrics.fps)}`}>
              {metrics.fps}
            </span>
          </div>
          <div className="metrics-row">
            <span className="metrics-label">Dropped frames</span>
            <span className={`metrics-value ${metrics.droppedFrames > 0 ? 'warning' : ''}`}>
              {metrics.droppedFrames}
            </span>
          </div>
        </div>

        {/* Memory */}
        <div className="metrics-section">
          <div className="metrics-section-title">Memory</div>
          <div className="metrics-row">
            <span className="metrics-label">JS Heap</span>
            <span className="metrics-value">{heapMB} MB</span>
          </div>
        </div>

        {/* Connection */}
        <div className="metrics-section">
          <div className="metrics-section-title">Connection</div>
          <div className="metrics-row">
            <span className="metrics-label">Reconnects</span>
            <span className={`metrics-value ${metrics.reconnectCount > 0 ? 'warning' : ''}`}>
              {metrics.reconnectCount}
            </span>
          </div>
          <div className="metrics-row">
            <span className="metrics-label">Sequence gaps</span>
            <span className={`metrics-value ${metrics.sequenceGaps > 0 ? 'warning' : ''}`}>
              {metrics.sequenceGaps}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
