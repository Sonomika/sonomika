import { useStore } from '../store/store';
import { BPMManager } from '../engine/BPMManager';

interface ShortcutConfig {
  handler: (e: KeyboardEvent) => void;
  description: string;
  category: string;
  allowInInput?: boolean;
  keyCombo?: string;
}

export class KeyboardShortcuts {
  private static instance: KeyboardShortcuts;
  private shortcuts: Map<string, ShortcutConfig> = new Map();
  private categories: Map<string, string[]> = new Map();
  private store: any = null;

  private constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.handleKeyDown);
    this.initializeDefaultShortcuts();
  }

  static getInstance(): KeyboardShortcuts {
    if (!KeyboardShortcuts.instance) {
      KeyboardShortcuts.instance = new KeyboardShortcuts();
    }
    return KeyboardShortcuts.instance;
  }

  setStore(store: any): void {
    this.store = store;
  }

  private initializeDefaultShortcuts(): void {
    // Navigation shortcuts
    this.registerShortcut('Tab', {
      handler: () => this.toggleSidebar(),
      description: 'Toggle sidebar',
      category: 'Navigation'
    });

    this.registerShortcut('Escape', {
      handler: () => this.closeModals(),
      description: 'Close modals/dialogs',
      category: 'Navigation'
    });

    // BPM shortcuts
    this.registerShortcut(' ', {
      handler: () => this.tapTempo(),
      description: 'Tap tempo',
      category: 'BPM Control',
      allowInInput: true
    });

    this.registerShortcut('ArrowUp', {
      handler: () => this.increaseBPM(),
      description: 'Increase BPM',
      category: 'BPM Control'
    });

    this.registerShortcut('ArrowDown', {
      handler: () => this.decreaseBPM(),
      description: 'Decrease BPM',
      category: 'BPM Control'
    });

    // Scene shortcuts
    this.registerShortcut('ArrowLeft', {
      handler: () => this.previousScene(),
      description: 'Previous scene',
      category: 'Scene Control'
    });

    this.registerShortcut('ArrowRight', {
      handler: () => this.nextScene(),
      description: 'Next scene',
      category: 'Scene Control'
    });

    // Number keys for scene selection
    for (let i = 0; i <= 9; i++) {
      this.registerShortcut(i.toString(), {
        handler: () => this.switchToScene(i),
        description: `Switch to scene ${i}`,
        category: 'Scene Control'
      });
    }

    // Layer shortcuts
    this.registerShortcut('m', {
      handler: () => this.toggleMute(),
      description: 'Toggle mute for selected layer',
      category: 'Layer Control'
    });

    this.registerShortcut('s', {
      handler: () => this.toggleSolo(),
      description: 'Toggle solo for selected layer',
      category: 'Layer Control'
    });

    this.registerShortcut('l', {
      handler: () => this.toggleLock(),
      description: 'Toggle lock for selected layer',
      category: 'Layer Control'
    });

    // Effect shortcuts
    this.registerShortcut('e', {
      handler: () => this.cycleEffect(),
      description: 'Cycle through effects',
      category: 'Effects'
    });

    this.registerShortcut('r', {
      handler: () => this.randomizeEffect(),
      description: 'Randomize effect parameters',
      category: 'Effects'
    });

    // Performance shortcuts
    this.registerShortcut('p', {
      handler: () => this.togglePerformanceMode(),
      description: 'Toggle performance mode',
      category: 'Performance'
    });

    this.registerShortcut('f', {
      handler: () => this.toggleFullscreen(),
      description: 'Toggle fullscreen',
      category: 'Display'
    });

    // Project shortcuts
    this.registerShortcut('Control+s', {
      handler: () => this.saveProject(),
      description: 'Save project',
      category: 'Project'
    });

    this.registerShortcut('Control+o', {
      handler: () => this.openProject(),
      description: 'Open project',
      category: 'Project'
    });

    this.registerShortcut('Control+n', {
      handler: () => this.newProject(),
      description: 'New project',
      category: 'Project'
    });

    // Help shortcut
    this.registerShortcut('?', {
      handler: () => this.showHelp(),
      description: 'Show keyboard shortcuts help',
      category: 'Help'
    });

    // MIDI shortcuts
    this.registerShortcut('m', {
      handler: () => this.openMIDIMapper(),
      description: 'Open MIDI mapper',
      category: 'MIDI Control'
    });

    this.registerShortcut('s', {
      handler: () => this.openMIDISceneMapper(),
      description: 'Open MIDI scene mapper',
      category: 'MIDI Control'
    });

    // Media shortcuts
    this.registerShortcut('l', {
      handler: () => this.openMediaLibrary(),
      description: 'Open media library',
      category: 'Media'
    });
  }

  registerShortcut(key: string, config: ShortcutConfig): void {
    this.shortcuts.set(key.toLowerCase(), {
      ...config,
      allowInInput: config.allowInInput ?? false,
    });

    // Add to category
    if (!this.categories.has(config.category)) {
      this.categories.set(config.category, []);
    }
    this.categories.get(config.category)!.push(key);
  }

  unregisterShortcut(key: string): void {
    this.shortcuts.delete(key.toLowerCase());
  }

  getShortcuts(): Map<string, ShortcutConfig> {
    return new Map(this.shortcuts);
  }

  getShortcutsByCategory(): Map<string, ShortcutConfig[]> {
    const categorized = new Map<string, ShortcutConfig[]>();
    
    this.shortcuts.forEach((config, key) => {
      if (!categorized.has(config.category)) {
        categorized.set(config.category, []);
      }
      categorized.get(config.category)!.push({ ...config, keyCombo: key });
    });

    return categorized;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Handle modifier key combinations
    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Control');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.altKey) modifiers.push('Alt');
    if (e.metaKey) modifiers.push('Meta');

    const keyCombo = modifiers.length > 0 
      ? `${modifiers.join('+')}+${e.key}`
      : e.key;

    // Don't trigger shortcuts when typing in input fields unless explicitly allowed
    const shortcut = this.shortcuts.get(keyCombo.toLowerCase()) || this.shortcuts.get(e.key.toLowerCase());
    if (!shortcut?.allowInInput &&
        (e.target instanceof HTMLInputElement ||
         e.target instanceof HTMLTextAreaElement ||
         e.target instanceof HTMLSelectElement)) {
      return;
    }

    if (shortcut) {
      e.preventDefault();
      try {
        shortcut.handler(e);
      } catch (error) {
        console.error('Error in keyboard shortcut handler:', error);
      }
    }
  }

  // Shortcut handler implementations
  private toggleSidebar(): void {
    // Implementation for toggling sidebar
    console.log('Toggle sidebar');
  }

  private closeModals(): void {
    // Implementation for closing modals
    console.log('Closing modals');
  }

  private tapTempo(): void {
    BPMManager.getInstance().tap();
  }

  private increaseBPM(): void {
    const bpmManager = BPMManager.getInstance();
    bpmManager.setBPM(bpmManager.getBPM() + 1);
  }

  private decreaseBPM(): void {
    const bpmManager = BPMManager.getInstance();
    bpmManager.setBPM(bpmManager.getBPM() - 1);
  }

  private previousScene(): void {
    // Implementation for previous scene
    console.log('Previous scene');
  }

  private nextScene(): void {
    // Implementation for next scene
    console.log('Next scene');
  }

  private switchToScene(index: number): void {
    // Implementation for switching to specific scene
    console.log(`Switch to scene ${index}`);
  }

  private toggleMute(): void {
    // Implementation for toggling mute
    console.log('Toggle mute');
  }

  private toggleSolo(): void {
    // Implementation for toggling solo
    console.log('Toggle solo');
  }

  private toggleLock(): void {
    // Implementation for toggling lock
    console.log('Toggle lock');
  }

  private cycleEffect(): void {
    // Implementation for cycling effects
    console.log('Cycle effect');
  }

  private randomizeEffect(): void {
    // Implementation for randomizing effects
    console.log('Randomize effect');
  }

  private togglePerformanceMode(): void {
    // Implementation for performance mode
    console.log('Toggle performance mode');
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  private saveProject(): void {
    // Implementation for saving project
    console.log('Save project');
  }

  private openProject(): void {
    // Implementation for opening project
    console.log('Open project');
  }

  private newProject(): void {
    // Implementation for new project
    console.log('New project');
  }

  private showHelp(): void {
    // Implementation for showing help
    console.log('Show help');
  }

  private openMIDIMapper(): void {
    if (this.store) {
      // This would need to be implemented in the store
      console.log('Open MIDI mapper');
    }
  }

  private openMIDISceneMapper(): void {
    if (this.store) {
      // This would need to be implemented in the store
      console.log('Open MIDI scene mapper');
    }
  }

  private openMediaLibrary(): void {
    if (this.store) {
      // This would need to be implemented in the store
      console.log('Open media library');
    }
  }

  cleanup(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.shortcuts.clear();
    this.categories.clear();
  }
} 