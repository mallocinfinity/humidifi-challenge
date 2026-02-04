import './App.css';
import { useWorker, useConnectionStatus } from '@/hooks';
import { useSABWorker } from '@/hooks/useSABWorker';
import { detectSyncMode } from '@/lib/sync-mode';
import { OrderBook } from '@/components/OrderBook';
import { Controls } from '@/components/Controls';
import { MetricsPanel } from '@/components/MetricsPanel';

// Module-level — evaluated once before React renders.
// Safe for conditional hooks because the branch never changes.
const syncMode = detectSyncMode();

function App() {
  // Initialize worker connection based on sync mode.
  // syncMode is determined at module load time and never changes — safe to branch.
  if (syncMode === 'sab') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSABWorker();
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useWorker();
  }

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
