import './App.css';
import { useWorker, useConnectionStatus } from '@/hooks';
import { OrderBook } from '@/components/OrderBook';
import { Controls } from '@/components/Controls';
import { MetricsPanel } from '@/components/MetricsPanel';

function App() {
  // Initialize worker connection
  useWorker();

  // Get connection status
  const status = useConnectionStatus();

  return (
    <div className="app">
      <header className="app-header">
        <h1>BTC/USD Orderbook</h1>
        <div className="status-display">
          <span className={`status-dot status-${status}`} />
          <span>{status}</span>
          <Controls />
        </div>
      </header>

      <OrderBook />

      <MetricsPanel />
    </div>
  );
}

export default App;
