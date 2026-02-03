import './App.css';
import { useWorker } from '@/hooks/useWorker';

function App() {
  const { status, messageCount } = useWorker();

  return (
    <div className="app">
      <h1>Orderbook</h1>
      <div className="status-display">
        <span className={`status-dot status-${status}`} />
        <span>{status}</span>
      </div>
      <p className="message-count">Messages received: {messageCount}</p>
      <p className="hint">Open console to see orderbook updates</p>
    </div>
  );
}

export default App;
