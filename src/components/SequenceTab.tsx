import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '../store/store';
import CustomWaveform, { CustomWaveformRef } from './CustomWaveform';
import { Button, ScrollArea, Select, Input, Label, Switch } from './ui';
import { ActionLogger } from '../utils/ActionLogger';
import { Trash2, Play, Pause, Square, Upload, Settings, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface TriggerConfig {
  id: string;
  time: number;
  actions: TriggerAction[];
}

interface TriggerAction {
  type: 'column' | 'cell';
  columnId?: string;
  columnIndex?: number;
  row?: number;
  action: 'play' | 'stop' | 'toggle';
}

interface AudioFile {
  id: string;
  file: File;
  name: string;
  duration: number;
  waveformData?: Float32Array;
  path?: string; // Electron absolute path for persistence
}

const SequenceTab: React.FC = () => {
  const { scenes, currentSceneId, playColumn, globalStop, playingColumnId, selectedLayerId, activeLayerOverrides, playNextScene, updateScene, sequenceEnabledGlobal, setSequenceEnabledGlobal, accentColor } = useStore();
  const storageKeyForScene = (sceneId: string) => `vj-sequence-settings-v1:${sceneId || 'default'}`;
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<AudioFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const waveformRef = useRef<CustomWaveformRef>(null);
  // Debounce map: triggerTime -> last fired performance timestamp
  const lastFiredRef = useRef<Record<number, number>>({});
  // Previous time to detect seeks/backward jumps
  const prevTimeRef = useRef(0);

  // Sequence enable/disable is now per-scene via scene.sequenceEnabled
  const [triggerPoints, setTriggerPoints] = useState<number[]>([]);
  const [triggerConfigs, setTriggerConfigs] = useState<Record<number, TriggerConfig>>({});
  const [selectedTriggerTime, setSelectedTriggerTime] = useState<number | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [editorDrafts, setEditorDrafts] = useState<Record<number, { columnIndex: number; rowCells: Record<number, number>; action: 'play' | 'stop' | 'toggle' }>>({});
  // Auto Fill options
  const [autoFillCount, setAutoFillCount] = useState<number>(0); // 0 = auto
  const [autoFillRandomize, setAutoFillRandomize] = useState<boolean>(false);
  const [autoFillOverflowStrategy, setAutoFillOverflowStrategy] = useState<'repeat' | 'random' | 'no_adjacent'>('no_adjacent');

  // Fallback playhead ticker (when no audio is loaded)
  const fallbackRafRef = useRef<number | null>(null);
  const fallbackStartMsRef = useRef<number>(0);
  const fallbackOriginTimeRef = useRef<number>(0);

  // One-shot trigger tracking for current play session
  const firedOnceRef = useRef<Set<number>>(new Set());
  // Briefly suppress triggers after a manual column play to avoid flashes
  const suppressUntilRef = useRef<number>(0);
  const lastGlobalPlayMsRef = useRef<number>(0);
  // When user explicitly stops via toolbar or turns sequence off, suppress auto-reassert
  const explicitlyStoppedRef = useRef<boolean>(false);

  // Restore persisted sequence settings (per scene)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKeyForScene(currentSceneId));
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data?.triggerPoints)) setTriggerPoints(data.triggerPoints.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n)).sort((a: number,b: number)=>a-b));
        if (data?.triggerConfigs && typeof data.triggerConfigs === 'object') {
          const next: Record<number, TriggerConfig> = {};
          Object.keys(data.triggerConfigs).forEach((k) => {
            const keyNum = Number(k);
            const cfg = data.triggerConfigs[k];
            if (Number.isFinite(keyNum) && cfg && Array.isArray(cfg.actions)) {
              next[keyNum] = { id: String(cfg.id || `t-${keyNum}`), time: keyNum, actions: cfg.actions } as TriggerConfig;
            }
          });
          setTriggerConfigs(next);
        }
        // Restore audio files and selection (Electron)
        if (Array.isArray(data?.audioFiles)) {
          const restored: AudioFile[] = data.audioFiles.map((af: any) => ({
            id: String(af.id),
            file: new File([], af.name || 'audio', { type: 'audio/mpeg' }),
            name: af.name || 'audio',
            duration: Number(af.duration) || 0,
            path: af.path || undefined,
          }));
          setAudioFiles(restored);
          const selId = String(data?.selectedAudioId || '')
          const sel = restored.find(a => a.id === selId) || restored[0] || null;
          if (sel) setSelectedFile(sel);
        }
        // Restore Auto Fill options
        try {
          const n = Number(data?.autoFillCount);
          setAutoFillCount(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
        } catch { setAutoFillCount(0); }
        try { setAutoFillRandomize(Boolean(data?.autoFillRandomize)); } catch { setAutoFillRandomize(false); }
        try {
          const s = String(data?.autoFillOverflowStrategy || 'repeat');
          setAutoFillOverflowStrategy((s === 'random' || s === 'no_adjacent') ? (s as any) : 'repeat');
        } catch { setAutoFillOverflowStrategy('repeat'); }
        // Restore global sequence toggle from saved payload if present
        try {
          if (typeof data?.triggersEnabled === 'boolean') {
            setSequenceEnabledGlobal(Boolean(data.triggersEnabled));
          }
        } catch {}
      } else {
        // Reset to clean state if no saved data for this scene
        setTriggerPoints([]);
        setTriggerConfigs({} as any);
        setAudioFiles([]);
        setSelectedFile(null);
        setAudioUrl('');
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setAutoFillCount(0);
        setAutoFillRandomize(false);
        setAutoFillOverflowStrategy('repeat');
      }
    } catch {}
    setHasHydrated(true);
  }, [currentSceneId]);

  // Persist sequence settings (per scene)
  useEffect(() => {
    if (!hasHydrated) return;
    try {
      const payload = {
        // Persist global toggle to each scene payload (backward compat with existing saves)
        triggersEnabled: !!sequenceEnabledGlobal,
        triggerPoints,
        triggerConfigs,
        audioFiles: audioFiles.map(f => ({ id: f.id, name: f.name, duration: f.duration, path: f.path })),
        selectedAudioId: selectedFile?.id || null,
        autoFillCount,
        autoFillRandomize,
        autoFillOverflowStrategy,
      };
      localStorage.setItem(storageKeyForScene(currentSceneId), JSON.stringify(payload));
    } catch {}
  }, [hasHydrated, sequenceEnabledGlobal, currentSceneId, triggerPoints, triggerConfigs, audioFiles, selectedFile, autoFillCount, autoFillRandomize, autoFillOverflowStrategy]);

  // Get current scene and columns
  const currentScene = scenes.find(s => s.id === currentSceneId);
  const triggersEnabled = !!sequenceEnabledGlobal;
  const columns = currentScene?.columns || [];

  // Normalize trigger configurations so each marker has a column action and per-row cell actions
  useEffect(() => {
    try {
      const rowsCount = Math.min(6, Math.max(1, Number(currentScene?.numRows) || 3));
      let changedAny = false;
      const next: typeof triggerConfigs = { ...triggerConfigs } as any;
      for (const t of triggerPoints) {
        const cfg = next[t];
        if (!cfg) continue;
        let changed = false;
        const actions = Array.isArray(cfg.actions) ? [...cfg.actions] : [];
        const hasColumn = actions.some(a => a && a.type === 'column');
        if (!hasColumn) {
          const colIdx = Math.max(1, Math.min((columns?.length || 1), 1));
          actions.unshift({ type: 'column', columnIndex: colIdx, action: 'play' } as any);
          changed = true;
        }
        for (let r = 1; r <= rowsCount; r++) {
          const existing = actions.find(a => a && a.type === 'cell' && Number((a as any).row) === r);
          if (!existing) {
            const colAct = actions.find(a => a && a.type === 'column');
            const baseIdx = (colAct && (colAct as any).columnIndex) ? Number((colAct as any).columnIndex) : 1;
            actions.push({ type: 'cell', row: r, columnIndex: baseIdx, action: 'play' } as any);
            changed = true;
          }
        }
        if (changed) { next[t] = { ...cfg, actions } as any; changedAny = true; }
      }
      if (changedAny) setTriggerConfigs(next);
    } catch {}
  }, [currentScene?.numRows, columns?.length, triggerPoints]);

  // Handle file selection from input
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    handleFiles(files);
  }, []);

  // Handle files (from input or drag & drop)
  const handleFiles = useCallback((files: File[]) => {
    const first = files.find(file => file.type.startsWith('audio/'));
    if (!first) return;
    const audioFile: AudioFile = {
      id: Math.random().toString(36).substr(2, 9),
      file: first,
      name: first.name,
      duration: 0, // Will be updated when loaded
      path: (first as any).path || undefined,
    };

    setAudioFiles([audioFile]);
    setSelectedFile(audioFile);
  }, []);

  // Handle drag and drop from files library
  const handleFileDrop = useCallback((file: File) => {
    const audioFile: AudioFile = {
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      duration: 0,
      path: (file as any).path || undefined,
    };
    
    setAudioFiles([audioFile]);
    setSelectedFile(audioFile);
  }, []);

  // Handle file load completion
  const handleFileLoad = useCallback((file: File) => {
    // Update duration when file is loaded
    setAudioFiles(prev => prev.map(audioFile => 
      audioFile.file === file 
        ? { ...audioFile, duration: 0 } // Duration will be updated by the waveform component
        : audioFile
    ));
  }, []);

  // Create URL for selected file
  useEffect(() => {
    const buildUrlForPath = (p: string) => {
      try {
        const isElectron = typeof window !== 'undefined' && !!((window as any).process?.versions?.electron);
        if (isElectron) {
          return `file://${p}`;
        }
        // Fallback for web (may be blocked):
        const normalized = p.replace(/\\/g, '/');
        return `file://${encodeURI(normalized)}`;
      } catch {
        return '';
      }
    };

    if (selectedFile) {
      if (selectedFile.path) {
        const urlFromPath = buildUrlForPath(selectedFile.path);
        setAudioUrl(urlFromPath);
        return () => {};
      }
      const url = URL.createObjectURL(selectedFile.file);
      setAudioUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setAudioUrl('');
    }
  }, [selectedFile]);

  // Handle time update from waveform
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Handle duration change from waveform
  const handleDurationChange = useCallback((dur: number) => {
    setDuration(dur);
    if (selectedFile) {
      setAudioFiles(prev => prev.map(file => 
        file.id === selectedFile.id 
          ? { ...file, duration: dur }
          : file
      ));
    }
  }, [selectedFile]);

  // Handle play/pause from waveform
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Handle audio end-of-track action based on scene setting
  const handleEnded = useCallback(() => {
    try {
      const scene = scenes.find(s => s.id === currentSceneId);
      const action = scene?.endOfSceneAction || 'stop';
      if (action === 'loop') {
        // Reset trigger one-shots and restart audio
        lastFiredRef.current = {};
        firedOnceRef.current.clear();
        try { prevTimeRef.current = 0; } catch {}
        try { waveformRef.current?.seekTo?.(0); } catch {}
        setCurrentTime(0);
        // Re-apply early markers to ensure 0.00 triggers fire on loop
        try { applyMarkersUpToTime(0.15); } catch {}
        setTimeout(() => {
          try { waveformRef.current?.play?.(); } catch {}
          // Notify transport listeners that playback resumed due to loop
          try { document.dispatchEvent(new CustomEvent('globalPlay', { detail: { source: 'sequence:loop' } })); } catch {}
        }, 80);
      } else if (action === 'play_next') {
        // Prepare for next scene: clear per-session trigger state so 0.00 fires in new scene
        try { lastFiredRef.current = {}; } catch {}
        try { firedOnceRef.current.clear(); } catch {}
        try { prevTimeRef.current = 0; } catch {}
        
        playNextScene();
        
        // Give time for per-scene settings to hydrate, then apply early markers and auto-play if audio exists
        setTimeout(() => {
          const hasAudio = selectedFile && audioUrl;
          
          if (hasAudio) {
            // If we have audio, apply markers and start playback
            try { applyMarkersUpToTime(Math.max(0.15, Number(0))); } catch {}
            try { waveformRef.current?.play?.(); } catch {}
            // Also emit a globalPlay so other subsystems can react consistently
            try { document.dispatchEvent(new CustomEvent('globalPlay', { detail: { source: 'sequence:autoNext' } })); } catch {}
          } else {
            // If no audio in the new scene, just emit globalPlay for other systems
            // This allows other systems (like timeline) to continue playback
            console.log('📻 Next scene has no audio, emitting globalPlay for other systems');
            try { document.dispatchEvent(new CustomEvent('globalPlay', { detail: { source: 'sequence:autoNextNoAudio' } })); } catch {}
          }
        }, 250);
      } else {
        // stop: hard-stop audio and prevent auto-resume handlers from reasserting
        try { explicitlyStoppedRef.current = true; } catch {}
        try { waveformRef.current?.stop?.(); } catch {}
        // Cancel fallback ticker if running
        try { if (fallbackRafRef.current != null) { cancelAnimationFrame(fallbackRafRef.current); fallbackRafRef.current = null; } } catch {}
        setIsPlaying(false);
        // Broadcast a globalStop so listeners honor the stop state
        try { document.dispatchEvent(new CustomEvent('globalStop', { detail: { source: 'sequence:endStop' } })); } catch {}
      }
    } catch {}
  }, [currentSceneId, scenes, playNextScene]);

  // Controls
  const togglePlayPause = useCallback(() => {
    try { waveformRef.current?.playPause?.(); } catch {}
  }, []);

  const clearAll = useCallback(() => {
    setAudioFiles([]);
    setSelectedFile(null);
    setAudioUrl('');
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setTriggerPoints([]);
    setTriggerConfigs({} as any);
  }, []);

  const removeFile = useCallback((id: string) => {
    setAudioFiles((prev) => prev.filter((f) => f.id !== id));
    setSelectedFile((prev) => (prev && prev.id === id ? null : prev));
  }, []);

  // Derive current selection: prefer selected layer (row+column), else playing column
  const deriveSelectedCell = useCallback((): { columnId: string; row: number } | null => {
    try {
      if (!selectedLayerId) return null;
      const scene = scenes.find(s => s.id === currentSceneId);
      if (!scene) return null;
      for (let c = 0; c < (scene.columns?.length || 0); c++) {
        const col = scene.columns[c];
        const rowIdx = (col.layers || []).findIndex(l => l?.id === selectedLayerId);
        if (rowIdx >= 0) {
          return { columnId: col.id, row: rowIdx + 1 };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, [scenes, currentSceneId, selectedLayerId]);

  const deriveDefaultTriggerAction = useCallback((): TriggerAction | null => {
    const scene = scenes.find(s => s.id === currentSceneId);
    // Prefer the currently selected/playing column
    if (playingColumnId && scene) {
      const idx = Math.max(0, (scene.columns || []).findIndex(c => c.id === playingColumnId));
      const columnIndex = idx >= 0 ? idx + 1 : undefined;
      return { type: 'column', columnId: playingColumnId, columnIndex, action: 'play' } as TriggerAction;
    }
    // Else, if a specific layer (cell) is selected, use its column+row
    const cell = deriveSelectedCell();
    if (cell && scene) {
      const idx = Math.max(0, (scene.columns || []).findIndex(c => c.id === cell.columnId));
      const columnIndex = idx >= 0 ? idx + 1 : undefined;
      return { type: 'cell', columnId: cell.columnId, columnIndex, row: cell.row, action: 'play' } as TriggerAction;
    }
    // Fallback to first column in scene if available
    try {
      if (scene?.columns && scene.columns[0]) {
        return { type: 'column', columnId: scene.columns[0].id, columnIndex: 1, action: 'play' } as TriggerAction;
      }
    } catch {}
    return null;
  }, [deriveSelectedCell, playingColumnId, scenes, currentSceneId]);

  // Add trigger point
  const addTriggerPoint = useCallback((time: number) => {
    if (!triggersEnabled) return;
    
    const norm = (t: number) => Number(Number(Math.max(0, Number(t) || 0)).toFixed(3));
    const t = norm(time);

    setTriggerPoints(prev => {
      const normalized = prev.map(norm);
      const next = Array.from(new Set<number>([...normalized, t])).sort((a, b) => a - b);
      return next;
    });

    // Build initial actions so summary and editor match immediately
    const triggerId = `trigger-${t}-${Date.now()}`;
    const rowsCount = Math.min(6, Math.max(1, Number(currentScene?.numRows) || 3));

    // Determine base column index from playing column or selected cell
    const deriveBaseColumnIndex = (): number => {
      try {
        if (playingColumnId) {
          const idx = (currentScene?.columns || []).findIndex(c => c.id === playingColumnId);
          if (idx >= 0) return idx + 1;
        }
        // Fallback to selected cell's column
        const sel = deriveSelectedCell?.();
        if (sel) {
          const idx = (currentScene?.columns || []).findIndex(c => c.id === sel.columnId);
          if (idx >= 0) return idx + 1;
        }
      } catch {}
      return 1;
    };

    const baseColIndex = deriveBaseColumnIndex();

    const cellIndexForRow = (row: number): number => {
      try {
        const overrideColId = (activeLayerOverrides || ({} as any))[row];
        if (overrideColId) {
          const j = (currentScene?.columns || []).findIndex(c => c.id === overrideColId);
          if (j >= 0) return j + 1;
        }
      } catch {}
      return baseColIndex;
    };

    const initialActions: TriggerAction[] = [
      { type: 'column', columnIndex: baseColIndex, action: 'play' } as TriggerAction,
      // Pre-populate per-row cell actions
      ...Array.from({ length: rowsCount }, (_, i) => {
        const rowNum = i + 1;
        return { type: 'cell', row: rowNum, columnIndex: cellIndexForRow(rowNum), action: 'play' } as TriggerAction;
      })
    ];

    setTriggerConfigs(prev => {
      const out: Record<number, TriggerConfig> = { ...prev } as any;
      // Remove any configs that collide within rounding precision
      Object.keys(out).forEach((k) => {
        const kn = Number(k);
        if (Math.abs(kn - t) < 0.0005) delete (out as any)[kn];
      });
      out[t] = { id: triggerId, time: t, actions: initialActions } as TriggerConfig;
      return out as any;
    });
  }, [triggersEnabled, currentScene, playingColumnId, activeLayerOverrides]);

  // Remove trigger point
  const removeTriggerPoint = useCallback((time: number) => {
    setTriggerPoints(prev => prev.filter(t => Math.abs(t - time) > 0.1));
    setTriggerConfigs(prev => {
      const newConfigs = { ...prev };
      delete newConfigs[time];
      return newConfigs;
    });
  }, []);

  // Check if current time matches or crosses any trigger between prev and current
  const checkTriggers = useCallback((currentTime: number, prevTime?: number) => {
    if (!triggersEnabled) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // If user just manually changed column, give it a short hold window
    // But NEVER suppress the initial 0:00 triggers
    const suppressionActive = now < suppressUntilRef.current;

    triggerPoints.forEach(triggerTime => {
      // Skip if this marker already fired in this play session
      if (firedOnceRef.current.has(triggerTime)) return;
      // Detect crossing in either direction when prevTime is provided
      const crossed = (typeof prevTime === 'number')
        ? ((prevTime <= triggerTime && triggerTime <= currentTime) || (prevTime >= triggerTime && triggerTime >= currentTime))
        : (Math.abs(currentTime - triggerTime) < 0.05);
      if (crossed) {
        // Allow 0:00 (and near-zero) markers even during manual suppression
        if (suppressionActive && triggerTime > 0.2) return;
        try { console.log('[Sequence][Fire] triggerTime =', triggerTime.toFixed(3), 'currentTime =', Number(currentTime||0).toFixed(3), 'prevTime =', typeof prevTime==='number'?prevTime.toFixed(3):'n/a'); } catch {}
        const last = lastFiredRef.current?.[triggerTime] || 0;
        if (now - last < 400) {
          return; // Suppress rapid re-fires within 400ms window
        }
        lastFiredRef.current[triggerTime] = now;
        firedOnceRef.current.add(triggerTime);
        const config = triggerConfigs[triggerTime];
        if (config) {
          console.log('Trigger fired at:', triggerTime, 'Actions:', config.actions);
          
          // Execute trigger actions
          try {
            // 1) Apply all cell overrides first
            const state: any = useStore.getState();
            const applyOverride = state?.setActiveLayerOverride;
            const clearOverrides = state?.clearActiveLayerOverrides;
            let nextColumnToPlay: string | null = null;
            let shouldStop = false;
            const appliedOverrides: Array<{ row: number; targetId: string }> = [];

            try {
              const rowsCount = Math.min(6, Math.max(1, Number(currentScene?.numRows) || 3));
              const resolved: Record<number, string | null> = {};
              const resolvedIdx: Record<number, number> = {};
              const idxFromId = (id: string | null | undefined): number | null => {
                if (!id) return null;
                const j = columns.findIndex(c => c.id === id);
                return j >= 0 ? j + 1 : null;
              };
              for (let r = 1; r <= rowsCount; r++) resolved[r] = null;
              for (const act of (config.actions || [])) {
                if (act?.type === 'cell') {
                  const idx = Math.max(1, Math.min((columns?.length || 1), Number((act as any).columnIndex) || 1));
                  const id = act.columnId || columns[idx - 1]?.id || null;
                  const row = Math.max(1, Number((act as any).row) || 1);
                  resolved[row] = id;
                  const idxResolved = (act as any).columnIndex ? Number((act as any).columnIndex) : (idxFromId(id) || idx);
                  resolvedIdx[row] = idxResolved;
                }
              }
              const columnAct = (config.actions || []).find(a => a.type === 'column') as any;
              const columnIndex = columnAct?.columnIndex
                ? Number(columnAct.columnIndex)
                : idxFromId(columnAct?.columnId) || 1;
              const summaryCells = Array.from({ length: rowsCount }, (_, i) => {
                const row = i + 1;
                const idx = resolvedIdx[row] || columnIndex;
                return `Row ${row}: ${idx}`;
              }).join(', ');
              console.log('[Sequence] Resolving trigger', triggerTime, `Column ${columnIndex} • Cells: ${summaryCells}`);
            } catch {}

            try { if (clearOverrides) clearOverrides(); } catch {}

            for (const action of config.actions || []) {
              if (action.type === 'cell') {
                try {
                  const safeIdx = Math.max(1, Math.min((columns?.length || 1), Number(action.columnIndex) || 1));
                  const targetId = action.columnId || columns[safeIdx - 1]?.id;
                  const rowNum = Math.max(1, Number(action.row) || 1);
                  if (applyOverride && targetId) applyOverride(rowNum, targetId);
                  if (targetId) appliedOverrides.push({ row: rowNum, targetId });
                  console.log('[Sequence] Applied cell override', `Row ${rowNum}: ${safeIdx}`);
                  // If the overridden row points to a different column, restart its video layer to ensure playback
                  try {
                    const scene = currentScene;
                    const targetCol = (scene?.columns || []).find(c => c.id === targetId);
                    const getLayerFor = (col: any, ln: number) => (col?.layers || []).find((l: any) => l.layerNum === ln || l.name === `Layer ${ln}`) || null;
                    const layer = getLayerFor(targetCol as any, rowNum);
                    if (layer && (layer.type === 'video' || (layer as any)?.asset?.type === 'video')) {
                      document.dispatchEvent(new CustomEvent('videoRestart', {
                        detail: { layerId: layer.id, columnId: targetId }
                      }));
                    }
                  } catch {}
                } catch (e) {
                  console.warn('Failed to apply cell action override:', e);
                }
              }
            }

            // 2) Determine column command
            for (const action of config.actions || []) {
              if (action.type === 'column') {
                const safeIdx = Math.max(1, Math.min((columns?.length || 1), Number(action.columnIndex) || 1));
                const colId = action.columnId || columns[safeIdx - 1]?.id;
                if (!colId) continue;
                if (action.action === 'stop') {
                  shouldStop = true;
                } else {
                  // play or toggle both resolve to playColumn
                  nextColumnToPlay = colId;
                }
              }
            }

            // 3) Execute column command or refresh current playing column IMMEDIATELY (no deferral)
            if (shouldStop) {
              globalStop();
            } else if (nextColumnToPlay) {
              playColumn(nextColumnToPlay);
              // Single-shot event dispatch per tick
              try {
                if (!(window as any).__vjLastColumnPlay || (window as any).__vjLastColumnPlay !== nextColumnToPlay) {
                  (window as any).__vjLastColumnPlay = nextColumnToPlay;
                  setTimeout(() => { (window as any).__vjLastColumnPlay = null; }, 100);
                  document.dispatchEvent(new CustomEvent('columnPlay', { detail: { type: 'columnPlay', columnId: nextColumnToPlay, fromTrigger: true } }));
                }
              } catch {}
              // Re-apply overrides to ensure they persist after playColumn side effects
              try {
                const reapply = (useStore.getState() as any).setActiveLayerOverride as (ln: number, col: string|null) => void;
                if (typeof reapply === 'function') {
                  for (const { row, targetId } of appliedOverrides) reapply(row, targetId);
                }
              } catch {}
              // Update preview without re-triggering store play path
              try { document.dispatchEvent(new CustomEvent('columnPlay', { detail: { type: 'columnPlay', columnId: nextColumnToPlay, fromTrigger: true, previewOnly: true } })); } catch {}
            } else {
              const currentPlaying = (useStore.getState() as any).playingColumnId;
              if (currentPlaying) {
                try { playColumn(currentPlaying); } catch {}
                try {
                  if (!(window as any).__vjLastColumnPlay || (window as any).__vjLastColumnPlay !== currentPlaying) {
                    (window as any).__vjLastColumnPlay = currentPlaying;
                    setTimeout(() => { (window as any).__vjLastColumnPlay = null; }, 100);
                    document.dispatchEvent(new CustomEvent('columnPlay', { detail: { type: 'columnPlay', columnId: currentPlaying, fromTrigger: true, previewOnly: true } }));
                  }
                } catch {}
              }
            }
            // Log the actual effective mapping after actions
            try {
              const st: any = useStore.getState();
              const rowsCount = Math.min(6, Math.max(1, Number(currentScene?.numRows) || 3));
              const idxFromId = (id: string | null | undefined): number | null => {
                if (!id) return null;
                const j = columns.findIndex(c => c.id === id);
                return j >= 0 ? j + 1 : null;
              };
              const playingIdx = idxFromId(st.playingColumnId) || 1;
              const summary = Array.from({ length: rowsCount }, (_, i) => {
                const row = i + 1;
                const srcId = (st.activeLayerOverrides || {})[row] || st.playingColumnId;
                const srcIdx = idxFromId(srcId) || playingIdx;
                return `Row ${row}: ${srcIdx}`;
              }).join(', ');
              console.log('[Sequence] Effective after trigger', triggerTime, `Column ${playingIdx} • Cells: ${summary}`);
            } catch {}
            console.log('[Sequence] Trigger applied', {
              triggerTime,
              playingAfter: (useStore.getState() as any).playingColumnId,
              shouldStop,
              nextColumnToPlay,
            });
          } catch (err) {
            console.warn('Error executing trigger actions:', err);
          }
        }
      } else {
        // If we moved away from this marker significantly, allow future fires
        const last = lastFiredRef.current?.[triggerTime];
        if (last && Math.abs(currentTime - triggerTime) > 0.3) {
          try { delete lastFiredRef.current[triggerTime]; } catch {}
        }
      }
    });
  }, [triggersEnabled, triggerPoints, triggerConfigs, playColumn, globalStop, columns, currentScene?.numRows]);

  // Apply all markers up to a given time (inclusive)
  const applyMarkersUpToTime = useCallback((t: number) => {
    try {
      const upper = Math.max(0, Number(t) || 0);
      try { console.log('[Sequence][Init] applyMarkersUpToTime → upper =', upper.toFixed(3)); } catch {}
      const sorted = [...triggerPoints].sort((a, b) => a - b);
      for (const tp of sorted) {
        if (tp <= upper) {
          try { delete lastFiredRef.current[tp]; } catch {}
          if (!firedOnceRef.current.has(tp)) {
            checkTriggers(tp, tp - 0.01);
          }
        } else {
          break;
        }
      }
    } catch {}
  }, [triggerPoints, checkTriggers]);

  // Global transport integration: control audio and apply triggers immediately on Play
  useEffect(() => {
    const onGlobalPlay = () => {
      try { explicitlyStoppedRef.current = false; } catch {}
      try { ActionLogger.log('globalPlay'); } catch {}
      if (!triggersEnabled) return;
      try { lastGlobalPlayMsRef.current = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); } catch {}
      try { waveformRef.current?.play?.(); ActionLogger.log('sequenceAudioPlay'); } catch {}
      try {
        lastFiredRef.current = {};
        firedOnceRef.current.clear();
        // Ensure earliest marker has normalized actions before applying
        const upper = Math.max(currentTime, 0.15);
        const sorted = [...triggerPoints].filter(tp => tp <= upper).sort((a,b)=>a-b);
        const earliest = sorted.length > 0 ? sorted[0] : null;
        const cfg = earliest != null ? triggerConfigs[earliest] : null;
        const hasCells = !!(cfg && Array.isArray(cfg.actions) && cfg.actions.some(a => a && a.type === 'cell'));
        const run = () => applyMarkersUpToTime(upper);
        // Always defer briefly to allow hydration/normalization to complete reliably
        const delayMs = 120;
        try { console.log('[Sequence][Init] onGlobalPlay → currentTime =', Number(currentTime || 0).toFixed(3), 'upper =', upper.toFixed(3), 'delay =', delayMs, 'ms'); } catch {}
        setTimeout(run, delayMs);
      } catch {}

      // Start fallback ticker if there is no audio playing
      try {
        const hasAudio = !!audioUrl;
        if (!hasAudio && fallbackRafRef.current == null) {
          fallbackStartMsRef.current = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          fallbackOriginTimeRef.current = Number(currentTime) || 0;
          const loop = () => {
            const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const elapsed = Math.max(0, nowMs - fallbackStartMsRef.current) * 0.001;
            const t = fallbackOriginTimeRef.current + elapsed;
            setCurrentTime(t);
            fallbackRafRef.current = requestAnimationFrame(loop);
          };
          fallbackRafRef.current = requestAnimationFrame(loop);
          // Mirror global playing state locally to enable trigger checks
          setIsPlaying(true);
        }
      } catch {}
    };
    const stopFallback = () => {
      try { if (fallbackRafRef.current != null) { cancelAnimationFrame(fallbackRafRef.current); fallbackRafRef.current = null; } } catch {}
    };
    const onGlobalPause = (evt?: any) => {
      if (!triggersEnabled) return;
      const source = evt?.detail?.source || '';
      // Ignore non-forced pauses while sequence is active
      if (!source) return;
      try { waveformRef.current?.pause?.(); ActionLogger.log('sequenceAudioPause'); } catch {}
      stopFallback();
      setIsPlaying(false);
    };
    const onGlobalStop = (evt?: any) => {
      if (!triggersEnabled) return;
      const source = evt?.detail?.source || '';
      // Ignore non-forced stops while sequence is active
      if (!source) return;
      try { explicitlyStoppedRef.current = true; } catch {}
      try { waveformRef.current?.stop?.(); ActionLogger.log('sequenceAudioStop'); } catch {}
      stopFallback();
      setIsPlaying(false);
      firedOnceRef.current.clear();
    };
    document.addEventListener('globalPlay', onGlobalPlay as any);
    document.addEventListener('globalPause', onGlobalPause as any);
    document.addEventListener('globalStop', onGlobalStop as any);
    // Keep sequence independent from other media events
    const onVideoPause = (evt?: any) => {
      if (!triggersEnabled) return;
      const source = evt?.detail?.source || '';
      try { ActionLogger.log('videoPause(evt)', evt?.detail); } catch {}
      if (audioUrl && !explicitlyStoppedRef.current && !source) {
        try { waveformRef.current?.play?.(); ActionLogger.log('sequenceAudioPlay(recover:videoPause)'); } catch {}
      }
    };
    const onVideoStop = (evt?: any) => {
      if (!triggersEnabled) return;
      const source = evt?.detail?.source || '';
      try { ActionLogger.log('videoStop(evt)', evt?.detail); } catch {}
      if (audioUrl && !explicitlyStoppedRef.current && !source) {
        try { waveformRef.current?.play?.(); ActionLogger.log('sequenceAudioPlay(recover:videoStop)'); } catch {}
      }
    };
    const onColumnStopEvt = (evt?: any) => {
      if (!triggersEnabled) return;
      const source = evt?.detail?.source || '';
      try { ActionLogger.log('columnStop(evt)', evt?.detail); } catch {}
      if (audioUrl && !explicitlyStoppedRef.current && !source) {
        try { waveformRef.current?.play?.(); ActionLogger.log('sequenceAudioPlay(recover:columnStop)'); } catch {}
      }
    };
    try {
      document.addEventListener('videoPause', onVideoPause as any);
      document.addEventListener('videoStop', onVideoStop as any);
      document.addEventListener('columnStop', onColumnStopEvt as any);
    } catch {}
    // Manual column plays (no fromTrigger flag) should suppress triggers briefly
    const onAnyColumnPlay = (e: any) => {
      try {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        // Ignore columnPlay emitted immediately by transport start (auto-play first column)
        if (now - (lastGlobalPlayMsRef.current || 0) < 500) return;
        if (e?.detail?.fromTrigger) return;
        // Only treat explicit UI/MIDI manual events; ignore unknown origins to avoid false suppression
        if ((e?.detail?.origin || '') !== 'manual') return;
        // Debounce multiple manual events to one suppression window
        const debounceMs = 250;
        if ((suppressUntilRef as any).__lastManual && now - (suppressUntilRef as any).__lastManual < debounceMs) {
          (suppressUntilRef as any).__lastManual = now;
          return;
        }
        (suppressUntilRef as any).__lastManual = now;
        // During manual switch, clear any auto-applied per-row overrides so base column shows
        try { (useStore.getState() as any)?.clearActiveLayerOverrides?.(); } catch {}
        suppressUntilRef.current = now + 600; // balanced hold for reliable manual switching
        try { console.log('[Sequence][Manual] columnPlay detected; suppressing triggers until', suppressUntilRef.current, 'origin= manual'); } catch {}
      } catch {}
    };
    document.addEventListener('columnPlay', onAnyColumnPlay as any);
    return () => {
      document.removeEventListener('globalPlay', onGlobalPlay as any);
      document.removeEventListener('globalPause', onGlobalPause as any);
      document.removeEventListener('globalStop', onGlobalStop as any);
      try {
        document.removeEventListener('videoPause', onVideoPause as any);
        document.removeEventListener('videoStop', onVideoStop as any);
        document.removeEventListener('columnStop', onColumnStopEvt as any);
      } catch {}
      document.removeEventListener('columnPlay', onAnyColumnPlay as any);
      try { if (fallbackRafRef.current != null) { cancelAnimationFrame(fallbackRafRef.current); fallbackRafRef.current = null; } } catch {}
    }; 
  }, [triggersEnabled, currentTime, applyMarkersUpToTime]);

  // Update time update handler to check triggers
  useEffect(() => {
    if (triggersEnabled && isPlaying) {
      const prev = prevTimeRef.current;
      prevTimeRef.current = currentTime;
      // If we jumped backwards by more than 0.5s, treat as a seek and skip checks this tick
      if (prev - currentTime > 0.5) {
        return;
      }
      checkTriggers(currentTime, prev);
    }
  }, [currentTime, checkTriggers, triggersEnabled, isPlaying]);

  // Ensure fallback ticker also drives trigger checks when audio isn't present
  useEffect(() => {
    if (!triggersEnabled) return;
    if (fallbackRafRef.current != null && isPlaying) {
      try { checkTriggers(currentTime); } catch {}
    }
  }, [currentTime, isPlaying, triggersEnabled, checkTriggers]);

  // Ensure first marker applies if triggers become enabled after hydration
  useEffect(() => {
    try {
      if (triggersEnabled && isPlaying) {
        setTimeout(() => {
          try { applyMarkersUpToTime(Math.max(currentTime, 0.15)); } catch {}
        }, 120);
      }
    } catch {}
  }, [triggersEnabled, isPlaying]);

  // Also check once right when playback starts so a marker exactly at the
  // current time applies immediately on Play
  useEffect(() => {
    if (triggersEnabled && isPlaying) {
      try { checkTriggers(currentTime); } catch {}
    }
  }, [isPlaying, triggersEnabled, currentTime, checkTriggers]);

  // Add action to trigger
  const addTriggerAction = useCallback((triggerTime: number, action: TriggerAction) => {
    setTriggerConfigs(prev => ({
      ...prev,
      [triggerTime]: {
        ...prev[triggerTime],
        actions: [...(prev[triggerTime]?.actions || []), action]
      }
    }));
  }, []);

  // Remove action from trigger
  const removeTriggerAction = useCallback((triggerTime: number, actionIndex: number) => {
    setTriggerConfigs(prev => ({
      ...prev,
      [triggerTime]: {
        ...prev[triggerTime],
        actions: prev[triggerTime]?.actions.filter((_, i) => i !== actionIndex) || []
      }
    }));
  }, []);

  // Format duration for display
  const formatDuration = (seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (safe < 1) {
      const hundredths = Math.round(safe * 100);
      return `0.${hundredths.toString().padStart(2, '0')}`;
    }
    const mins = Math.floor(safe / 60);
    const secsWhole = Math.floor(safe % 60);
    return `${mins}:${secsWhole.toString().padStart(2, '0')}`;
  };

  // Helper: add audio entry from absolute path (Electron)
  const addAudioFromPath = useCallback((name: string, absPath: string) => {
    const audioFile: AudioFile = {
      id: Math.random().toString(36).substr(2, 9),
      file: new File([], name, { type: 'audio/mpeg' }),
      name,
      duration: 0,
      path: absPath,
    };
    setAudioFiles([audioFile]);
    setSelectedFile(audioFile);
  }, []);

  // Color helpers (use accent for bars; brighter for progress)
  const toBrightenedHex = useCallback((hex: string, factor: number) => {
    try {
      const norm = String(hex || '').trim();
      const m = /^#?([0-9a-fA-F]{6})$/.exec(norm);
      if (!m) return hex;
      const int = parseInt(m[1], 16);
      const r = Math.min(255, Math.max(0, Math.round(((int >> 16) & 255) * factor)));
      const g = Math.min(255, Math.max(0, Math.round(((int >> 8) & 255) * factor)));
      const b = Math.min(255, Math.max(0, Math.round((int & 255) * factor)));
      const to2 = (n: number) => n.toString(16).padStart(2, '0');
      return `#${to2(r)}${to2(g)}${to2(b)}`;
    } catch {
      return hex;
    }
  }, []);

  // Generate/refresh auto markers: always include 0.000, replace prior auto markers, keep manual ones
  const generateAutoMarkers = useCallback(() => {
    try {
      const scene = scenes.find(s => s.id === currentSceneId);
      if (!scene) return;
      const cols = (scene.columns || []).filter((c: any) => (c.layers || []).some((l: any) => !!l?.asset));
      const numRows = Math.min(6, Math.max(1, Number(scene.numRows) || 3));
      const baseCount = Math.max(cols.length, numRows);
      const count = Math.max(1, autoFillCount || baseCount);
      const peaks = (waveformRef.current?.getPeaks?.(count, { minDistanceSec: Math.max(0.5, (duration || 0) / (count * 2)) }) || []) as number[];
      const times = Array.isArray(peaks) ? peaks.slice() : [];
      // Ensure a start marker with a small gap before the next to avoid duplicates like 0.00, 0.00
      const startGap = Math.max(0.06, (duration || 0) / Math.max(50, count * 4));
      times.unshift(0, startGap);
      // Normalize to ms precision and unique
      const norm = (t: number) => Number(Number(t).toFixed(3));
      let picked = Array.from(new Set(times.map(norm)));
      if (autoFillRandomize) {
        picked = picked.sort(() => Math.random() - 0.5);
      } else {
        picked = picked.sort((a,b) => a - b);
      }

      // Remove existing auto markers and normalize manual times to 3 decimals to avoid
      // near-zero duplicates (e.g., 0 and 0.001 both showing as 0:00 in UI)
      const isAuto = (t: number) => String(triggerConfigs[t]?.id || '').startsWith('auto-');
      const manualPoints = triggerPoints
        .filter((t) => !isAuto(t))
        .map(norm);
      // Re-key manual configs using normalized time keys so the config map remains aligned
      const manualConfigs: Record<number, TriggerConfig> = {} as any;
      Object.entries(triggerConfigs).forEach(([k, cfg]) => {
        const tNum = Number(k);
        if (!isAuto(tNum) && cfg) {
          const key = norm((cfg as any).time ?? tNum);
          manualConfigs[key] = { ...(cfg as any), time: key } as TriggerConfig;
        }
      });

      const colIds = cols.map(c => c.id);
      const nextPoints = Array.from(new Set<number>([...manualPoints, ...picked])).sort((a,b)=>a-b);
      const nextConfigs: Record<number, TriggerConfig> = { ...(manualConfigs as any) } as any;

      let previousBaseColIdx: number | null = null;
      picked.forEach((t, idx) => {
        const key = norm(t);
        const actions: TriggerAction[] = [];
        // Default: group peaks into blocks of numRows so pattern is 1,1,1,1 → 2,2,2,2.
        // In 'no_adjacent' mode, we disable grouping so consecutive markers cycle columns.
        const blockSize = (autoFillOverflowStrategy === 'no_adjacent') ? 1 : Math.max(1, numRows);
        let baseColIdx = 0;
        if (colIds.length > 0) {
          if (autoFillOverflowStrategy === 'random') {
            // After columns exhausted, pick random among available
            // For consistent grouping, base on block index
            const blockIndex = Math.floor(idx / blockSize);
            const rng = Math.abs(Math.sin(blockIndex * 12.9898 + 78.233)) % 1; // deterministic-ish
            baseColIdx = Math.floor(rng * colIds.length) % colIds.length;
          } else if (autoFillOverflowStrategy === 'no_adjacent') {
            // Choose next column per marker, avoid same as previous marker
            const prev = previousBaseColIdx == null ? -1 : previousBaseColIdx;
            baseColIdx = (prev + 1) % colIds.length;
          } else {
            // repeat: wrap around
            baseColIdx = (Math.floor(idx / blockSize) % colIds.length);
          }
        }
        const baseIndex1 = Math.max(1, baseColIdx + 1);
        actions.push({ type: 'column', columnIndex: baseIndex1, action: 'play' } as TriggerAction);
        // Do not add per-row cell actions here. Normalization will populate
        // rows using the same column as the column action, yielding 1,1,1,1 then 2,2,2,2.
        nextConfigs[key] = { id: `auto-${key.toFixed(3)}`, time: key, actions } as TriggerConfig;
        // Track previous column at the granularity in effect
        if (autoFillOverflowStrategy === 'no_adjacent') previousBaseColIdx = baseColIdx; else if ((idx + 1) % blockSize === 0) previousBaseColIdx = baseColIdx;
      });

      setTriggerPoints(nextPoints);
      setTriggerConfigs(nextConfigs);
    } catch {}
  }, [scenes, currentSceneId, duration, autoFillCount, autoFillRandomize, triggerPoints, triggerConfigs]);

  // Clear only markers (keep audio)
  const clearMarkers = useCallback(() => {
    try {
      setTriggerPoints([]);
      setTriggerConfigs({} as any);
    } catch {}
  }, []);

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-p-4 tw-space-y-4">
      {/* Header */}
      <div className="tw-flex tw-items-center tw-justify-between">
        <h3 className="tw-text-sm tw-font-medium tw-text-white">Sequence</h3>
        <div className="tw-flex tw-items-center tw-gap-4">
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-xs tw-text-neutral-400">End:</span>
            <Select
              value={currentScene?.endOfSceneAction || 'play_next'}
              onChange={(action) => {
                try { updateScene(currentSceneId, { endOfSceneAction: action as 'loop' | 'play_next' | 'random' | 'stop' }); } catch {}
              }}
              options={[
                { value: 'stop', label: 'Stop' },
                { value: 'loop', label: 'Loop' },
                { value: 'play_next', label: 'Next' }
              ]}
              className="tw-text-xs"
            />
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-xs tw-text-neutral-400">Sequence:</span>
            <Switch checked={triggersEnabled} onCheckedChange={(val) => setSequenceEnabledGlobal(!!val)} />
          </div>
        </div>
      </div>

      {/* Waveform Display */}
      <div className="tw-flex-1 tw-min-h-0">
        <div 
          className="tw-w-full tw-h-full tw-rounded-lg"
          onDragOver={(e) => {
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'copy'; } catch {}
            e.currentTarget.classList.add('tw-border-blue-400', 'tw-bg-blue-50/10');
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('tw-border-blue-400', 'tw-bg-blue-50/10');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('tw-border-blue-400', 'tw-bg-blue-50/10');
            
            // 1) Accept file objects (from desktop)
            const files = Array.from(e.dataTransfer.files || []);
            const audioFiles = files.filter(file => file.type.startsWith('audio/'));
            if (audioFiles.length > 0) {
              handleFiles(audioFiles);
              return;
            }

            // 2) Accept JSON asset payloads from Files/Media tabs
            const json = e.dataTransfer.getData('application/json');
            if (json) {
              try {
                const asset = typeof json === 'string' ? JSON.parse(json) : json;
                const type = (asset?.type || '').toLowerCase();
                const name = asset?.name || 'audio';
                const pathLike: string | undefined = asset?.filePath || asset?.path || asset?.id;
                const isAudio = type === 'audio' || (/\.(mp3|wav|aiff|flac|ogg)$/i).test(String(name || pathLike || ''));
                if (isAudio && pathLike) {
                  // Strip scheme if present
                  const absPath = pathLike.startsWith('local-file://') ? pathLike.replace('local-file://', '') : pathLike;
                  addAudioFromPath(name, absPath);
                  return;
                }
              } catch {
                // ignore JSON parse failure
              }
            }
          }}
        >
          {audioUrl ? (
            <div className="tw-space-y-3">
              <div className="tw-space-y-2">
                {/* Zoom Controls and Add Button */}
                <div className="tw-flex tw-items-center tw-justify-between tw-rounded-lg">
                  <div className="tw-flex tw-items-center tw-space-x-2">
                    <button
                      onClick={() => waveformRef.current?.zoomIn?.()}
                      className="tw-inline-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-rounded tw-border tw-text-white tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700"
                      title="Zoom In"
                    >
                      <ZoomIn className="tw-w-4 tw-h-4" />
                    </button>
                    <button
                      onClick={() => waveformRef.current?.zoomOut?.()}
                      className="tw-inline-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-rounded tw-border tw-text-white tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700"
                      title="Zoom Out"
                    >
                      <ZoomOut className="tw-w-4 tw-h-4" />
                    </button>
                    <button
                      onClick={() => waveformRef.current?.resetZoom?.()}
                      className="tw-inline-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-rounded tw-border tw-text-white tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700"
                      title="Reset Zoom"
                    >
                      <RotateCcw className="tw-w-4 tw-h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => addTriggerPoint(currentTime)}
                    disabled={!triggersEnabled || !audioUrl}
                    className="tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                  >
                    + Add column selection at {formatDuration(currentTime)}
                  </button>
                </div>

                <CustomWaveform
                  key={audioUrl}
                  ref={waveformRef}
                  audioUrl={audioUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onDurationChange={handleDurationChange}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onEnded={handleEnded}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  height={150}
                  waveColor="#404040"
                  progressColor="#aaaaaa"
                  triggerPoints={triggerPoints}
                  onTriggerClick={addTriggerPoint}
                  triggersEnabled={triggersEnabled}
                />

              </div>
              
               {/* Controls */}
               <div className="tw-flex tw-items-center tw-justify-between tw-rounded-lg">
                {/* Audio Info */}
                <div className="tw-flex tw-items-center tw-gap-2 tw-flex-1 tw-min-w-0">
                  <div className="tw-text-white tw-text-xs tw-truncate">
                    {audioFiles[0]?.name || 'Audio File'}
                  </div>
                </div>
                
                {/* Play/Pause Button */}
                  <button
                    onClick={togglePlayPause}
                    className="tw-inline-flex tw-items-center tw-justify-center tw-h-8 tw-w-8 tw-p-0 tw-mx-4 tw-text-xs tw-rounded tw-bg-neutral-700 tw-text-white hover:tw-bg-neutral-600"
                  >
                  {isPlaying ? <Pause className="tw-w-4 tw-h-4" /> : <Play className="tw-w-4 tw-h-4" />}
                </button>
                
                {/* Time and Delete */}
                <div className="tw-flex tw-items-center tw-gap-2">
                  <div className="tw-text-white tw-text-xs">
                    {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2, '0')} / 
                    {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2, '0')}
                  </div>
                  <button
                    onClick={clearAll}
                    className="tw-inline-flex tw-items-center tw-justify-center tw-h-8 tw-w-8 tw-p-0 tw-text-xs tw-rounded tw-border tw-bg-neutral-800 tw-text-red-400 tw-border-neutral-700 hover:tw-bg-red-900/20"
                    title="Delete audio file"
                  >
                    <Trash2 className="tw-w-4 tw-h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-h-full tw-text-neutral-400">
              <div className="tw-text-sm tw-text-center">
                Drag audio files here or click "Add"
              </div>
              <div className="tw-text-xs tw-mt-2 tw-text-neutral-500">
                Supports MP3, WAV, OGG, FLAC
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="tw-mt-4 tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700 tw-flex tw-items-center tw-gap-1"
              >
                <Upload className="tw-w-3 tw-h-3" />
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trigger Controls + End Action */}
      <div className="tw-flex tw-items-center tw-justify-between tw-rounded-lg tw-border tw-border-neutral-600">
        <div className="tw-flex tw-items-center tw-space-x-3">
        </div>
        {/* Controls arranged on two lines to avoid overflow */}
        <div className="tw-flex tw-flex-col tw-items-start tw-gap-2 tw-w-full">
          {/* Line 1 */}
          <div className="tw-flex tw-items-center tw-gap-3 tw-w-full">
            {/* Auto Fill options */}
            <div className="tw-flex tw-items-center tw-gap-2">
              <span className="tw-text-xs tw-text-neutral-400">Markers:</span>
              <input
                type="number"
                min={0}
                step={1}
                value={autoFillCount}
                onChange={(e) => setAutoFillCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
                title="Number of markers to add (0 = auto)"
              />
              <Select
                value={autoFillOverflowStrategy}
                onChange={(v) => setAutoFillOverflowStrategy((v === 'random' || v === 'no_adjacent') ? (v as any) : 'repeat')}
                options={[
                  { value: 'repeat', label: 'Repeat' },
                  { value: 'random', label: 'Randomize' },
                  { value: 'no_adjacent', label: 'No Adjacent Same' }
                ]}
                className="tw-text-xs"
              />
            </div>
            {audioUrl && (
              <button
                onClick={generateAutoMarkers}
                className="tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700"
              >
                Auto Fill
              </button>
            )}
          </div>

          {/* Line 2 */}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileSelect}
        className="tw-hidden"
      />


      {/* Trigger List */}
      {triggersEnabled && triggerPoints.length > 0 && (
        <div className="tw-space-y-2">
          <div className="tw-flex tw-items-center tw-justify-between">
            <div className="tw-text-xs tw-text-neutral-400 tw-font-medium">Trigger Points</div>
            <button
              onClick={clearMarkers}
              className="tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700"
              title="Clear all markers"
            >
              Clear markers
            </button>
          </div>
          <div className="tw-rounded-lg tw-p-3 tw-max-h-48 tw-overflow-y-auto">
            <div className="tw-space-y-2">
              {triggerPoints.map((triggerTime, index) => {
                const config = triggerConfigs[triggerTime];
                const rowsCount = Math.min(6, Math.max(1, Number(currentScene?.numRows) || 3));
                const deriveColumnIndexFromConfig = () => {
                  try {
                    const colAct = (config?.actions || []).find(a => a.type === 'column');
                    if (colAct?.columnIndex) return Number(colAct.columnIndex);
                    if (colAct?.columnId) {
                      const idx = columns.findIndex(c => c.id === colAct.columnId);
                      if (idx >= 0) return idx + 1;
                    }
                  } catch {}
                  return 1;
                };
                // Build a row -> cellIndex map from all actions to avoid picking a stale first match
                const rowToCellIndex: Record<number, number> = {};
                try {
                  for (const act of (config?.actions || [])) {
                    if (act && act.type === 'cell') {
                      const r = Math.max(1, Number((act as any).row) || 1);
                      let idx = Number((act as any).columnIndex) || 0;
                      if (!idx && (act as any).columnId) {
                        const j = columns.findIndex(c => c.id === (act as any).columnId);
                        if (j >= 0) idx = j + 1;
                      }
                      if (idx > 0) rowToCellIndex[r] = idx;
                    }
                  }
                } catch {}
                const summaryColIndex = deriveColumnIndexFromConfig();
                const summaryCells = Array.from({ length: rowsCount }, (_, i) => {
                  const rowNum = i + 1;
                  let idx = rowToCellIndex[rowNum];
                  if (!idx) {
                    try {
                      const overrideColId = (activeLayerOverrides || ({} as any))[rowNum];
                      if (overrideColId) {
                        const j = columns.findIndex(c => c.id === overrideColId);
                        if (j >= 0) idx = j + 1;
                      }
                    } catch {}
                  }
                  if (!idx) idx = summaryColIndex;
                  return `${rowNum}.${idx}`;
                }).join(' / ');
                return (
                  <div
                    key={index}
                    className="tw-bg-neutral-700/50 tw-rounded tw-p-2 tw-text-xs"
                  >
                    <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
                      <div className="tw-flex tw-items-center tw-space-x-2">
                        <span className="tw-text-neutral-400">Time</span>
                        <Input
                          defaultValue={formatDuration(triggerTime)}
                          className="tw-h-7 tw-w-24 tw-text-xs"
                          onBlur={(e) => {
                            const toSec = (val: string) => {
                              const raw = (val || '').trim();
                              if (raw.includes(':')) {
                                const parts = raw.split(':');
                                const m = Math.max(0, Number(parts[0]) || 0);
                                const s = Math.max(0, Number(parts[1]) || 0);
                                return m * 60 + s;
                              }
                              if (raw.includes('.')) {
                                const parts = raw.split('.');
                                const m = Math.max(0, Number(parts[0]) || 0);
                                const s = Math.max(0, Number(parts[1]) || 0);
                                return m * 60 + s;
                              }
                              return Math.max(0, Number(raw) || 0);
                            };
                            const newTime = toSec(e.target.value);
                            if (!Number.isFinite(newTime)) return;
                            setTriggerPoints((prev) => {
                              const without = prev.filter(t => Math.abs(t - triggerTime) > 0.0001);
                              const next = [...without, newTime].sort((a,b) => a-b);
                              return next;
                            });
                            setTriggerConfigs((prev) => {
                              const cfg = prev[triggerTime];
                              const rest: any = { ...prev };
                              delete rest[triggerTime as any];
                              if (cfg) rest[newTime] = { ...cfg, time: newTime } as any;
                              return rest as any;
                            });
                          }}
                        />
                        <span className="tw-text-neutral-400 tw-text-xs tw-whitespace-nowrap">
                          Col {summaryColIndex}, Rows {summaryCells}
                        </span>
                      </div>
                      <div className="tw-flex tw-space-x-1">
                        <button
                          onClick={() => setSelectedTriggerTime(selectedTriggerTime === triggerTime ? null : triggerTime)}
                          className="tw-inline-flex tw-items-center tw-justify-center tw-w-6 tw-h-6 tw-rounded tw-border tw-text-neutral-400 hover:tw-text-blue-400 tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700"
                          title="Settings"
                        >
                          <Settings className="tw-w-4 tw-h-4" />
                        </button>
                        <button
                          onClick={() => removeTriggerPoint(triggerTime)}
                          className="tw-inline-flex tw-items-center tw-justify-center tw-w-6 tw-h-6 tw-rounded tw-border tw-text-neutral-400 hover:tw-text-red-400 tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700"
                          title="Delete"
                        >
                          <Trash2 className="tw-w-4 tw-h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Hide verbose actions list to keep one-row summary; details available in settings */}
 
                    {/* Add Action Button */}
                    {selectedTriggerTime === triggerTime && (
                      <div className="tw-space-y-2 tw-mt-2 tw-pt-2 tw-border-t tw-border-neutral-600">
                        <div className="tw-text-xs tw-text-neutral-400">Add Action:</div>
                        {(() => {
                          const rowsCount = Math.min(6, Math.max(1, Number(currentScene?.numRows) || 3));
                          const cfg = triggerConfigs[triggerTime];
                          const summaryColIndex = (() => {
                            try {
                              const colAct = (cfg?.actions || []).find(a => a.type === 'column');
                              if (colAct?.columnIndex) return Number(colAct.columnIndex);
                              if (colAct?.columnId) {
                                const idx = columns.findIndex(c => c.id === colAct.columnId);
                                if (idx >= 0) return idx + 1;
                              }
                            } catch {}
                            return 1;
                          })();
                          // Helpers to read/write config actions
                          const getColumnIndexFromConfig = (): number => {
                            try {
                              const colAct = (cfg?.actions || []).find(a => a.type === 'column');
                              if (colAct?.columnIndex) return Number(colAct.columnIndex);
                              if (colAct?.columnId) {
                                const idx = columns.findIndex(c => c.id === colAct.columnId);
                                if (idx >= 0) return idx + 1;
                              }
                            } catch {}
                            return summaryColIndex;
                          };
                          const getCellIndexForRow = (row: number): number => {
                            try {
                              const cellAct = (cfg?.actions || []).find(a => a.type === 'cell' && Number(a.row) === row);
                              if (cellAct?.columnIndex) return Number(cellAct.columnIndex);
                              if ((cellAct as any)?.columnId) {
                                const idx = columns.findIndex(c => c.id === (cellAct as any).columnId);
                                if (idx >= 0) return idx + 1;
                              }
                              const overrideColId = (activeLayerOverrides || ({} as any))[row];
                              if (overrideColId) {
                                const idx2 = columns.findIndex(c => c.id === overrideColId);
                                if (idx2 >= 0) return idx2 + 1;
                              }
                            } catch {}
                            return getColumnIndexFromConfig();
                          };
 
                          const setColumnIndex = (colIdx: number) => {
                            setTriggerConfigs(prev => {
                              const prevCfg = prev[triggerTime] || { id: `trigger-${triggerTime}`, time: triggerTime, actions: [] } as TriggerConfig;
                              // Replace only the column action; keep per-row cells as set by the user
                              const nextActions = (prevCfg.actions || []).filter(a => a.type !== 'column');
                              nextActions.unshift({ type: 'column', columnIndex: colIdx, action: 'play' });
                              return { ...prev, [triggerTime]: { ...prevCfg, actions: nextActions } };
                            });
                          };
                          const setCellIndexForRow = (row: number, colIdx: number) => {
                            setTriggerConfigs(prev => {
                              const prevCfg = prev[triggerTime] || { id: `trigger-${triggerTime}`, time: triggerTime, actions: [] } as TriggerConfig;
                              // Replace existing cell action for this row; keep others intact
                              const nextActions = (prevCfg.actions || []).filter(a => !(a.type === 'cell' && Number((a as any).row) === row));
                              nextActions.push({ type: 'cell', columnIndex: colIdx, row, action: 'play' });
                              return { ...prev, [triggerTime]: { ...prevCfg, actions: nextActions } };
                            });
                          };
 
                          const currentColumnIndex = getColumnIndexFromConfig();
 
                          return (
                            <>
                              {/* Column selector */}
                              <div className="tw-grid tw-grid-cols-4 tw-gap-2 tw-items-end">
                                <div className="tw-space-y-1">
                                  <Label className="tw-text-xs tw-text-neutral-300">Column</Label>
                                  <Select
                                    value={String(currentColumnIndex)}
                                    onChange={(val) => setColumnIndex(Math.max(1, Number(val) || 1))}
                                    options={columns.map((c, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                                    className="tw-h-7 tw-text-xs"
                                  />
                                </div>
                              </div>
                              {/* Cells per row */}
                              <div className="tw-mt-3 tw-space-y-2">
                                <Label className="tw-text-xs tw-text-neutral-400">Cells</Label>
                                <div className="tw-space-y-1">
                                  <div className="tw-flex tw-items-center tw-gap-2 tw-text-neutral-400 tw-text-xs">
                                    <div className="tw-w-20">Row</div>
                                    <div className="tw-w-28">Cell</div>
                                  </div>
                                  {Array.from({ length: rowsCount }, (_, i) => i + 1).map((rowNum) => (
                                    <div key={`row-${rowNum}`} className="tw-flex tw-items-center tw-gap-2">
                                      <div className="tw-w-20 tw-text-xs tw-text-neutral-300">Row {rowNum}</div>
                                      <Select
                                        value={String(getCellIndexForRow(rowNum))}
                                        onChange={(val) => setCellIndexForRow(rowNum, Math.max(1, Number(val) || 1))}
                                        options={columns.map((c, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                                        className="tw-h-7 tw-text-xs tw-w-28"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Instructions removed (duplicate elsewhere) */}
    </div>
  );
};

export default SequenceTab;