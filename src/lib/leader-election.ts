// Leader election via localStorage heartbeats - Phase 8
// First tab claims leadership. Stale leaders (>5s no heartbeat) get replaced.

const STORAGE_KEY = 'orderbook-leader';
const HEARTBEAT_INTERVAL = 2000; // 2s
const CHECK_INTERVAL = 2000;     // 2s
const STALE_THRESHOLD = 5000;    // 5s

interface LeaderRecord {
  tabId: string;
  timestamp: number;
}

export interface LeaderElectionCallbacks {
  onBecomeLeader: () => void;
  onBecomeFollower: () => void;
}

export class LeaderElection {
  private id: string;
  private leader: boolean = false;
  private callbacks: LeaderElectionCallbacks;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private boundOnStorage: (e: StorageEvent) => void;
  private boundOnUnload: () => void;

  constructor(callbacks: LeaderElectionCallbacks) {
    this.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.callbacks = callbacks;
    this.boundOnStorage = this.onStorage.bind(this);
    this.boundOnUnload = this.stop.bind(this);
  }

  start(): void {
    // Listen for storage changes from other tabs
    window.addEventListener('storage', this.boundOnStorage);
    window.addEventListener('beforeunload', this.boundOnUnload);

    // Try to claim leadership
    this.tryClaimLeadership();

    // Periodically check for stale leader
    this.checkInterval = setInterval(() => {
      this.tryClaimLeadership();
    }, CHECK_INTERVAL);
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    window.removeEventListener('storage', this.boundOnStorage);
    window.removeEventListener('beforeunload', this.boundOnUnload);

    // If we were leader, remove the key so other tabs detect immediately
    if (this.leader) {
      this.leader = false;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // localStorage may be unavailable
      }
    }
  }

  get isLeader(): boolean {
    return this.leader;
  }

  get tabId(): string {
    return this.id;
  }

  private tryClaimLeadership(): void {
    const record = this.readRecord();

    if (record && record.tabId === this.id) {
      // We are already the leader — heartbeat
      this.writeHeartbeat();
      return;
    }

    if (record && Date.now() - record.timestamp < STALE_THRESHOLD) {
      // Another tab is a live leader
      if (this.leader) {
        // We lost leadership (shouldn't happen, but handle it)
        this.leader = false;
        this.stopHeartbeat();
        this.callbacks.onBecomeFollower();
      }
      return;
    }

    // No leader or stale leader — claim it
    this.claimLeadership();
  }

  private claimLeadership(): void {
    this.writeHeartbeat();

    // Verify we actually got it (another tab may have claimed simultaneously)
    const record = this.readRecord();
    if (record && record.tabId === this.id) {
      if (!this.leader) {
        this.leader = true;
        this.startHeartbeat();
        this.callbacks.onBecomeLeader();
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.writeHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private writeHeartbeat(): void {
    const record: LeaderRecord = { tabId: this.id, timestamp: Date.now() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // localStorage may be unavailable or full
    }
  }

  private readRecord(): LeaderRecord | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as LeaderRecord;
    } catch {
      return null;
    }
  }

  private onStorage(e: StorageEvent): void {
    if (e.key !== STORAGE_KEY) return;

    if (e.newValue === null) {
      // Leader key was removed — another leader tab closed
      // Try to claim leadership immediately
      this.tryClaimLeadership();
      return;
    }

    // Leader key changed — check if we lost or someone else claimed
    this.tryClaimLeadership();
  }
}
