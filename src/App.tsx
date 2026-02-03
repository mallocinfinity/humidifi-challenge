import './App.css';
import { useWorker, useConnectionStatus, useMetrics, useSpread } from '@/hooks';

function App() {
  // Initialize worker connection
  useWorker();

  // Get state from store
  const status = useConnectionStatus();
  const metrics = useMetrics();
  const spread = useSpread();

  return (
    <div className="app">
      <h1>Orderbook</h1>
      <div className="status-display">
        <span className={`status-dot status-${status}`} />
        <span>{status}</span>
      </div>

      {spread && (
        <div className="spread-display">
          <p>Midpoint: ${spread.midpoint.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p>Spread: ${spread.spread.toFixed(2)} ({(spread.spreadPercent * 100).toFixed(4)}%)</p>
        </div>
      )}

      <div className="metrics-display">
        <p>Messages/sec: {metrics.messagesPerSecond}</p>
        <p>Latency: {metrics.latencyMs.avg.toFixed(1)}ms avg</p>
        <p>FPS: {metrics.fps}</p>
      </div>

      <p className="hint">Phase 3: Data flows through Zustand + RAF</p>
    </div>
  );
}

export default App;
