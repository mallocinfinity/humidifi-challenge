import './App.css';
import { useWorker, useConnectionStatus, useMetrics } from '@/hooks';
import { OrderBook } from '@/components/OrderBook';

function App() {
  // Initialize worker connection
  useWorker();

  // Get state from store
  const status = useConnectionStatus();
  const metrics = useMetrics();

  return (
    <div className="app">
      <header className="app-header">
        <h1>BTC/USD Orderbook</h1>
        <div className="status-display">
          <span className={`status-dot status-${status}`} />
          <span>{status}</span>
        </div>
      </header>

      <OrderBook />

      <footer className="app-footer">
        <div className="metrics-display">
          <p>Messages/sec: {metrics.messagesPerSecond}</p>
          <p>Latency: {metrics.latencyMs.avg.toFixed(1)}ms avg</p>
          <p>FPS: {metrics.fps}</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
