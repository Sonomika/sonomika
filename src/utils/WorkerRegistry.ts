export type WorkerKind = 'frameRenderer' | 'thumbnail' | 'videoDecode' | 'other';

export interface RegisteredWorkerInfo {
  id: string;
  kind: WorkerKind;
  label?: string;
  createdAt: number;
  meta?: Record<string, unknown>;
}

type WorkerListener = (list: RegisteredWorkerInfo[]) => void;

export class WorkerRegistry {
  private static instance: WorkerRegistry | null = null;
  private workers: Map<string, RegisteredWorkerInfo> = new Map();
  private listeners: Set<WorkerListener> = new Set();

  static getInstance(): WorkerRegistry {
    if (!WorkerRegistry.instance) {
      WorkerRegistry.instance = new WorkerRegistry();
    }
    return WorkerRegistry.instance;
  }

  register(info: Omit<RegisteredWorkerInfo, 'createdAt'>): string {
    const id = info.id || this.generateId();
    const entry: RegisteredWorkerInfo = {
      id,
      kind: info.kind,
      label: info.label,
      createdAt: Date.now(),
      meta: info.meta,
    };
    this.workers.set(id, entry);
    this.emit();
    return id;
  }

  update(id: string, meta: Record<string, unknown>): void {
    const existing = this.workers.get(id);
    if (!existing) return;
    this.workers.set(id, { ...existing, meta: { ...(existing.meta || {}), ...meta } });
    this.emit();
  }

  unregister(id: string): void {
    if (this.workers.delete(id)) {
      this.emit();
    }
  }

  clear(): void {
    this.workers.clear();
    this.emit();
  }

  list(): RegisteredWorkerInfo[] {
    return Array.from(this.workers.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  counts(): Record<WorkerKind, number> & { total: number } {
    const counts: Record<WorkerKind, number> & { total: number } = {
      frameRenderer: 0,
      thumbnail: 0,
      videoDecode: 0,
      other: 0,
      total: 0,
    };
    for (const w of this.workers.values()) {
      counts[w.kind] += 1;
      counts.total += 1;
    }
    return counts;
  }

  onChange(listener: WorkerListener): () => void {
    this.listeners.add(listener);
    try { listener(this.list()); } catch {}
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    const snapshot = this.list();
    this.listeners.forEach((l) => { try { l(snapshot); } catch {} });
  }

  private generateId(): string {
    try { return crypto.randomUUID(); } catch {
      return `wrk_${Math.random().toString(36).slice(2)}`;
    }
  }
}

export const workerRegistry = WorkerRegistry.getInstance();


