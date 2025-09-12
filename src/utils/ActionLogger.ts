// Simple in-memory action log with console mirroring
// Use for debugging where playback stops

export type ActionLogEntry = {
  ts: number;
  type: string;
  detail?: any;
};

class ActionLoggerImpl {
  private entries: ActionLogEntry[] = [];
  private maxEntries = 500;

  log(type: string, detail?: any) {
    const entry: ActionLogEntry = { ts: Date.now(), type, detail };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    try { console.log(`[LOG:${type}]`, detail || ''); } catch {}
  }

  get(): ActionLogEntry[] { return [...this.entries]; }
  clear() { this.entries = []; }
}

export const ActionLogger = new ActionLoggerImpl();


