type KeyCallback = (key: string, modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }) => void;

export class KeyboardInputManager {
  private static instance: KeyboardInputManager;
  private keyCallbacks: Set<KeyCallback>;
  private initialized: boolean;
  private pressedKeys: Set<string>;

  private constructor() {
    this.keyCallbacks = new Set();
    this.initialized = false;
    this.pressedKeys = new Set();
    this.initialize();
  }

  static getInstance(): KeyboardInputManager {
    if (!KeyboardInputManager.instance) {
      KeyboardInputManager.instance = new KeyboardInputManager();
    }
    return KeyboardInputManager.instance;
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    window.addEventListener('keydown', this.handleKeyDown, { capture: true });
    window.addEventListener('keyup', this.handleKeyUp, { capture: true });
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Do not interfere with typing into inputs
    const target = e.target as HTMLElement | null;
    const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target?.getAttribute && target.getAttribute('contenteditable') === 'true');
    if (isInput) return;

    const key = e.key;
    const keyId = `${key}-${e.ctrlKey}-${e.shiftKey}-${e.altKey}-${e.metaKey}`;
    
    // Only trigger on initial press, not on repeat events
    if (this.pressedKeys.has(keyId)) {
      return;
    }
    
    this.pressedKeys.add(keyId);
    const modifiers = { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
    this.keyCallbacks.forEach(cb => {
      try { cb(key, modifiers); } catch {}
    });
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key;
    const keyId = `${key}-${e.ctrlKey}-${e.shiftKey}-${e.altKey}-${e.metaKey}`;
    this.pressedKeys.delete(keyId);
  };

  addKeyCallback(callback: KeyCallback): void {
    this.keyCallbacks.add(callback);
  }

  removeKeyCallback(callback: KeyCallback): void {
    this.keyCallbacks.delete(callback);
  }

  cleanup(): void {
    window.removeEventListener('keydown', this.handleKeyDown, { capture: true } as any);
    window.removeEventListener('keyup', this.handleKeyUp, { capture: true } as any);
    this.keyCallbacks.clear();
    this.pressedKeys.clear();
    this.initialized = false;
  }
}


