import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasStreamManager } from '../utils/CanvasStream';
import { useStore } from '../store/store';
import { LayerOptions } from './LayerOptions';
import { CanvasRenderer } from './CanvasRenderer';
import { ColumnPreview } from './ColumnPreview';
// import { MediaBrowser } from './MediaBrowser';
import { MediaLibrary } from './MediaLibrary';
import { Timeline } from './Timeline';
import TimelineComposer from './TimelineComposer';
import { BPMManager } from '../engine/BPMManager';
import { v4 as uuidv4 } from 'uuid';
import { getAssetPath, createColumn, handleDragOver, handleDragLeave, handleLayerClick } from '../utils/LayerManagerUtils';
import { handleDrop, handleLayerReorderDragStart, handleLayerReorderDragOver, handleLayerReorderDrop } from '../utils/DragDropHandlers';
import { handleColumnPlay, handleUpdateLayer } from '../utils/LayerManagementHandlers';
import { handleSceneRename } from '../utils/SceneManagementHandlers';
import EffectsBrowser from './EffectsBrowser';
import { MIDIMapper } from './MIDIMapper';
import { LFOMapper } from './LFOMapper';
// Scenes header now uses ContextMenu for actions
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from './ui/ContextMenu';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { ScrollArea as AppScrollArea } from './ui';
import { Tabs, TabsList, TabsTrigger, TabsContent, Dialog, DialogContent, DialogHeader, DialogTitle } from './ui';
import { GlobalEffectsTab } from './GlobalEffectsTab';
import { PlayIcon, PauseIcon, StopIcon } from '@radix-ui/react-icons';
import TimelineControls from './TimelineControls';
import FileBrowser from './FileBrowser';


interface LayerManagerProps {
  onClose: () => void;
  debugMode?: boolean;
}

// Quiet verbose diagnostic logs emitted from this module
// Only suppress known noisy prefixes; allow all other console output
(() => {
  try {
    const originalLog = console.log.bind(console);
    const originalWarn = console.warn.bind(console);
    const noisyPrefixRegex = /^(🎨|🎭|🎵|🔄|➕|🖱️)/;
    const alsoNoisySubstrings = ['LayerManager', 'Current scene:'];
    console.log = (...args: any[]) => {
      const first = args[0];
      if (typeof first === 'string') {
        if (noisyPrefixRegex.test(first) || alsoNoisySubstrings.some((s) => first.includes(s))) return;
      }
      return originalLog(...args);
    };
    console.warn = (...args: any[]) => {
      const first = args[0];
      if (typeof first === 'string') {
        if (noisyPrefixRegex.test(first) || alsoNoisySubstrings.some((s) => first.includes(s))) return;
      }
      return originalWarn(...args);
    };
  } catch {
    // no-op
  }
})();

// Memoized at module scope to preserve component identity across renders
const MemoMediaLibrary = React.memo(MediaLibrary);

export const LayerManager: React.FC<LayerManagerProps> = ({ onClose, debugMode = false }) => {
  // console.log('LayerManager component rendering');
  
  const { scenes, currentSceneId, setCurrentScene, addScene, removeScene, updateScene, duplicateScene, reorderScenes, compositionSettings, bpm, setBpm, playingColumnId, isGlobalPlaying, playColumn, globalPlay, globalPause, globalStop, selectedTimelineClip, setSelectedTimelineClip, selectedLayerId: persistedSelectedLayerId, setSelectedLayer: setSelectedLayerId } = useStore() as any;
  const [bpmInputValue, setBpmInputValue] = useState(bpm.toString());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(false);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState<number>(160);
  const [gridHasOverflowX, setGridHasOverflowX] = useState<boolean>(false);
  const [gridHasOverflowY, setGridHasOverflowY] = useState<boolean>(false);
  
  // Sync local BPM input with store BPM
  useEffect(() => {
    setBpmInputValue(bpm.toString());
  }, [bpm]);
  
  // Initialize BPMManager with store BPM
  useEffect(() => {
    const bpmManager = BPMManager.getInstance();
    bpmManager.setBPM(bpm);
  }, [bpm]);

  // Subscribe to BPM beat ticks to trigger a short pulse animation
  useEffect(() => {
    const bpmManager = BPMManager.getInstance();
    const onBeat = (currentBpm: number) => {
      setIsBeatPulse(true);
      if (beatPulseTimeoutRef.current != null) {
        clearTimeout(beatPulseTimeoutRef.current);
      }
      const clamped = Math.max(30, Math.min(300, Number(currentBpm) || 120));
      const beatMs = (60 / clamped) * 1000;
      const duration = Math.max(80, Math.min(200, beatMs * 0.15));
      beatPulseTimeoutRef.current = window.setTimeout(() => setIsBeatPulse(false), duration);
    };
    bpmManager.addCallback(onBeat);
    return () => {
      bpmManager.removeCallback(onBeat);
      if (beatPulseTimeoutRef.current != null) clearTimeout(beatPulseTimeoutRef.current);
    };
  }, []);

  // Compute fixed per-column width so exactly 20 columns fit the visible area
  useEffect(() => {
    const el = gridWrapperRef.current;
    if (!el) return;
    const compute = () => {
      try {
        const style = window.getComputedStyle(el);
        const gapStr = style.columnGap || style.gap || '8px';
        const gap = parseFloat(gapStr) || 8;
        const totalGap = gap * 19; // gaps between 20 columns
        const available = el.clientWidth - totalGap;
        const next = Math.max(80, Math.floor(available / 20));
        setColumnWidth(next);
        // Update overflow states
        try {
          setGridHasOverflowX(el.scrollWidth - el.clientWidth > 1);
          setGridHasOverflowY(el.scrollHeight - el.clientHeight > 1);
        } catch {}
      } catch {}
    };
    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', compute);
    };
  }, []);

  // Track small-screen breakpoint (iPad portrait and below ~ <768px)
  useEffect(() => {
    try {
      const mql = window.matchMedia('(max-width: 767px)');
      const update = () => setIsSmallScreen(mql.matches);
      update();
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
      } else if (typeof (mql as any).addListener === 'function') {
        (mql as any).addListener(update);
        return () => (mql as any).removeListener(update);
      }
    } catch {}
  }, []);
  
  // console.log('LayerManager store state:', { scenes: scenes?.length, currentSceneId, compositionSettings });
  
  const [selectedLayer, setSelectedLayer] = useState<any>(null);
  const [selectedGlobalEffectKey] = useState<string | null>(null);
  // Selected column is currently not used in UI state; pass no-op where needed
  const [paneSizes, setPaneSizes] = useState({
    gridHeight: 50, // percentage of viewport height - start at 50/50
    mediaLibraryHeight: 50 // percentage of viewport height
  });
  // Resizing disabled: bottom panel is fixed to columns; only upward adjustments allowed via future control
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [, setRefreshTrigger] = useState(0);
  const [isBeatPulse, setIsBeatPulse] = useState(false);
  const beatPulseTimeoutRef = React.useRef<number | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewHeaderRef = useRef<HTMLDivElement | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const mirrorStreamRef = useRef<CanvasStreamManager | null>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [fsFallbackActive, setFsFallbackActive] = useState(false);

  const { showTimeline, setShowTimeline } = useStore() as any;
  const [showMediaLibrary, setShowMediaLibrary] = useState<string | false>(false);
  const [middlePanelTab, setMiddlePanelTab] = useState<'global' | 'layer'>(() => {
    try {
      const saved = localStorage.getItem('vj-ui-middle-tab');
      return (saved === 'global' || saved === 'layer') ? (saved as any) : 'layer';
    } catch { return 'layer'; }
  });
  const [draggedLayer, setDraggedLayer] = useState<any>(null);
  const [dragOverLayer, setDragOverLayer] = useState<string | null>(null);
  const [contextHighlightedCell, setContextHighlightedCell] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    layerId: string | null;
    columnId: string | null;
  }>({ visible: false, x: 0, y: 0, layerId: null, columnId: null });

  // Clipboard state for copy/paste columns, cells, and clips
  const [clipboard, setClipboard] = useState<{
    type: 'column' | 'cell' | 'clip';
    data: any;
    sourceSceneId: string;
  } | null>(null);

  const handleMediaLibClose = useCallback(() => {}, []);

  // Close context menu
  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, layerId: null, columnId: null });
    setContextHighlightedCell(null);
  }, []);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        handleContextMenuClose();
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.visible, handleContextMenuClose]);

  // Memoized callback for timeline preview updates
  const handleTimelinePreviewUpdate = useCallback((previewContent: any) => {
    setPreviewContent(previewContent);
    
    // Update isPlaying state based on previewContent.isPlaying
    if (previewContent && typeof previewContent.isPlaying === 'boolean') {
      console.log('🎭 LayerManager updating isPlaying to:', previewContent.isPlaying);
      setIsPlaying(previewContent.isPlaying);
    }
  }, []);

  console.log('LayerManager state - scenes:', scenes, 'currentSceneId:', currentSceneId);
  console.log('🎭 Preview state - previewContent:', previewContent, 'isPlaying:', isPlaying);



  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
  console.log('Current scene:', currentScene);

  const handleLayerClickWrapper = (layer: any, columnId: string) => {
    // Clear any timeline selection when directly interacting with grid layers
    try { setSelectedTimelineClip(null); } catch {}
    // Persist selection in global store for refresh restore
    try { if (layer?.id) setSelectedLayerId(layer.id); } catch {}
    handleLayerClick(layer, columnId, setSelectedLayer, () => {});
  };

  // Hydrate local selectedLayer from persisted store selection when in column view
  useEffect(() => {
    if (showTimeline) return;
    if (!persistedSelectedLayerId) return;
    try {
      const scene = scenes.find((s: any) => s.id === currentSceneId);
      if (!scene) return;
      const allLayers = scene.columns.flatMap((c: any) => c.layers || []);
      const match = allLayers.find((l: any) => l.id === persistedSelectedLayerId);
      if (match) setSelectedLayer(match);
    } catch {}
  }, [showTimeline, persistedSelectedLayerId, currentSceneId, scenes]);

  // const handleColumnClickWrapper = (columnId: string) => {
  //   handleColumnClick(columnId, setSelectedColumn);
  // };

  // Handle column play button
  const handleColumnPlayWrapper = (columnId: string) => {
    handleColumnPlay(columnId, currentScene, setPreviewContent, setIsPlaying, playColumn);
  };

  // Keep preview content in sync when playback changes programmatically (e.g., via MIDI)
  useEffect(() => {
    try {
      if (playingColumnId) {
        handleColumnPlayWrapper(playingColumnId);
      }
    } catch {}
  }, [playingColumnId]);

  // const handleLayerPlayWrapper = (layerId: string) => {
  //   handleLayerPlay(layerId, currentScene, setPreviewContent, setIsPlaying);
  // };

  // Stop wrapper unused after global controls migration

  // const handleClearLayersWrapper = () => {
  //   handleClearLayers(currentScene, updateScene, setCurrentScene, setRefreshTrigger, setSelectedLayer, setSelectedColumn, setPreviewContent, setIsPlaying);
  // };

  // const handleForceClearWrapper = () => {
  //   handleForceClear(currentScene, updateScene, setSelectedLayer, setSelectedColumn, setPreviewContent, setIsPlaying, setRefreshTrigger);
  // };

  // const handleRemoveAssetWrapper = (columnId: string, layerId: string) => {
  //   handleRemoveAsset(columnId, layerId, currentScene, updateScene, setRefreshTrigger);
  // };

  const handleUpdateLayerWrapper = (layerId: string, updatedLayer: any) => {
    handleUpdateLayer(layerId, updatedLayer, currentScene, updateScene, setSelectedLayer, setRefreshTrigger);
  };

  // Unified updater: handles real layers and pseudo global-effect layers
  const handleUpdateSelectedLayer = (layerId: string, options: any) => {
    // Only reroute updates to timeline's resolved layer when timeline preview is active
    const forcedLayerId = (previewContent && previewContent.type === 'timeline' && selectedTimelineClip && selectedTimelineClip.layerId)
      ? selectedTimelineClip.layerId
      : null;
    if (forcedLayerId) {
      handleUpdateLayerWrapper(forcedLayerId, options);
      // Nudge preview timeline state so it re-renders with latest params
      try {
        setPreviewContent((prev: any) => (prev && prev.type === 'timeline' ? { ...prev } : prev));
      } catch {}
      return;
    }
    // Timeline-only clip (no mapped scene layer): write back params to the selected timeline clip in the store
    if (previewContent && previewContent.type === 'timeline' && selectedTimelineClip && (!selectedTimelineClip.layerId || String(layerId).startsWith('timeline-layer-'))) {
      try {
        const nextClipData = { ...(selectedTimelineClip.data || {}) } as any;
        // Merge top-level layer options (e.g., fitMode, blendMode, opacity, etc.)
        Object.keys(options || {}).forEach((key) => {
          if (key === 'params') return; // handled below
          (nextClipData as any)[key] = (options as any)[key];
        });
        // Merge params separately
        if (options?.params) {
          nextClipData.params = { ...(nextClipData.params || {}), ...(options.params || {}) };
        }
        setSelectedTimelineClip({ ...selectedTimelineClip, data: nextClipData });
      } catch {}
      try {
        setPreviewContent((prev: any) => (prev && prev.type === 'timeline' ? { ...prev } : prev));
      } catch {}
      return;
    }
    if (layerId.startsWith('global-effect-layer-')) {
      if (!currentScene) return;
      if (!selectedGlobalEffectKey) return;
      const [indexStr] = selectedGlobalEffectKey.split(':');
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx)) return;
      const currentGlobalEffects = currentScene.globalEffects || [];
      if (!currentGlobalEffects[idx]) return;
      const updatedEffects = [...currentGlobalEffects];
      const updatedSlot = { ...updatedEffects[idx] } as any;
      if (options.params) {
        updatedSlot.params = options.params;
      }
      // Future: support blend/opacity if needed for global context
      updatedEffects[idx] = updatedSlot;
      updateScene(currentSceneId, { globalEffects: updatedEffects });
      // Keep the pseudo layer in sync for instant UI feedback
      setSelectedLayer((prev: any) => (prev && prev.id === layerId ? { ...prev, ...options } : prev));
      return;
    }
    // Fallback to regular layer update
    handleUpdateLayerWrapper(layerId, options);
    // If the preview is showing a column, mirror the update into the previewContent object
    try {
      setPreviewContent((prev: any) => {
        if (!prev || prev.type !== 'column') return prev;
        const updateLayer = (l: any) => (l && l.id === layerId) ? { ...l, ...options } : l;
        const nextColumn = prev.column ? { ...prev.column, layers: (prev.column.layers || []).map(updateLayer) } : prev.column;
        const nextLayers = Array.isArray(prev.layers) ? prev.layers.map(updateLayer) : prev.layers;
        return { ...prev, column: nextColumn, layers: nextLayers };
      });
    } catch {}
    // Keep local selectedLayer in sync so UI reflects new values immediately
    try {
      setSelectedLayer((prev: any) => (prev && prev.id === layerId) ? { ...prev, ...options } : prev);
    } catch {}
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    // Resizing disabled
  };

  const handleResizeMove = (e: MouseEvent) => {
    // Resizing disabled
  };

  const handleResizeEnd = () => {
    // Resizing disabled
  };

  React.useEffect(() => {
    // Resizing disabled
    return () => {};
  }, []);

  // Drag and Drop Handlers
  const handleDragOverWrapper = (e: React.DragEvent, cellId: string) => {
    handleDragOver(e, cellId, setDragOverCell);
  };

  const handleDragLeaveWrapper = (e: React.DragEvent) => {
    handleDragLeave(e, setDragOverCell);
  };

  const handleDropWrapper = (e: React.DragEvent, columnId: string, layerNum: number) => {
    const wasPlayingThisColumn = playingColumnId === columnId;
    console.log('🎵 Before drop - Column playing state:', { columnId, wasPlayingThisColumn, playingColumnId });
    
    handleDrop(e, columnId, layerNum, scenes, currentSceneId, updateScene, setDragOverCell);
    
    // Keep playback running if this column was already playing
    if (wasPlayingThisColumn) {
      console.log('🎵 Restoring playback for column:', columnId);
      // Use multiple attempts to ensure playback restoration
      const restorePlayback = (attempts = 0) => {
        const maxAttempts = 3;
        try {
          setIsPlaying(true);
          playColumn(columnId);
          console.log('🎵 Playback restored successfully for column:', columnId);
        } catch (err) {
          console.warn(`Failed to reassert play after drop (attempt ${attempts + 1}):`, err);
          if (attempts < maxAttempts - 1) {
            setTimeout(() => restorePlayback(attempts + 1), 200);
          }
        }
      };
      
      // Initial attempt with small delay
      setTimeout(() => restorePlayback(), 100);
    }
  };

  // const handleLayerDragStartWrapper = (e: React.DragEvent, layer: any, columnId: string) => {
  //   handleLayerDragStart(e, layer, columnId);
  // };



  // Handle drag end
  const handleDragEnd = () => {
    setDragOverCell(null);
    setDraggedLayer(null);
    setDragOverLayer(null);
  };

  // Toggle preview fullscreen using Fullscreen API
  const fsElement = () => (document as any).fullscreenElement || (document as any).webkitFullscreenElement || null;
  const requestFS = (el: HTMLElement) => {
    const req: any = (el as any).requestFullscreen || (el as any).webkitRequestFullscreen || (el as any).webkitEnterFullscreen;
    if (typeof req === 'function') req.call(el);
  };
  const exitFS = () => {
    const docAny: any = document;
    const exit = docAny.exitFullscreen || docAny.webkitExitFullscreen;
    if (typeof exit === 'function') exit.call(document);
  };

  const togglePreviewFullscreen = () => {
    try {
      const el = previewContainerRef.current;
      if (!el) return;
      const supportsFS = (el as any).requestFullscreen || (el as any).webkitRequestFullscreen || (el as any).webkitEnterFullscreen;
      if (supportsFS) {
        if (!fsElement()) {
          requestFS(el);
        } else {
          exitFS();
        }
      } else {
        // Fallback: fixed to viewport
        setFsFallbackActive((v) => !v);
      }
    } catch {}
  };

  // Track fullscreen changes (desktop/mobile including iOS webkit)
  useEffect(() => {
    const handler = () => {
      try {
        const nowFS = !!fsElement();
        setIsPreviewFullscreen(nowFS);
      } catch {}
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange' as any, handler as any);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange' as any, handler as any);
    };
  }, []);

  // Compute preview size to fit available height (shrink-to-fit) while respecting composition aspect
  useEffect(() => {
    const compute = () => {
      try {
        const container = previewContainerRef.current;
        if (!container) return;
        const headerEl = previewHeaderRef.current;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const headerHeight = headerEl ? headerEl.offsetHeight : 0;
        const availableHeight = Math.max(0, containerHeight - headerHeight);

        if (isPreviewFullscreen || fsFallbackActive) {
          setPreviewSize({ width: window.innerWidth, height: window.innerHeight });
          return;
        }

        const aspect = (compositionSettings?.width || 1920) / (compositionSettings?.height || 1080);
        // Prefer fitting height, then clamp if width would overflow
        let height = availableHeight;
        let width = Math.floor(height * aspect);
        if (width > containerWidth) {
          width = containerWidth;
          height = Math.floor(width / aspect);
        }
        setPreviewSize({ width, height });
      } catch {}
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    try { if (previewContainerRef.current) ro.observe(previewContainerRef.current); } catch {}
    window.addEventListener('resize', compute);
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', compute);
    };
  }, [compositionSettings?.width, compositionSettings?.height, isPreviewFullscreen, fsFallbackActive]);

  // Handle right-click on column cells
  const handleCellRightClick = (e: React.MouseEvent, layer: any, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      layerId: layer?.id || 'unknown',
      columnId: columnId
    });
    setContextHighlightedCell(`${columnId}-${layer?.layerNum || (layer?.name?.split(' ')[1] || '')}`);
  };



  // Delete layer from column
  const handleDeleteLayer = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const updatedColumns = currentScene.columns.map((column: any) => {
          if (column.id === contextMenu.columnId) {
            return {
              ...column,
              layers: column.layers.filter((layer: any) => layer.id !== contextMenu.layerId)
            };
          }
          return column;
        });

        updateScene(currentSceneId, { columns: updatedColumns });
        console.log(`Deleted layer ${contextMenu.layerId} from column ${contextMenu.columnId}`);
      }
    }
    handleContextMenuClose();
  };

  // Copy column
  const handleCopyColumn = () => {
    if (contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const columnToCopy = currentScene.columns.find((col: any) => col.id === contextMenu.columnId);
        if (columnToCopy) {
          setClipboard({
            type: 'column',
            data: { ...columnToCopy },
            sourceSceneId: currentSceneId
          });
          console.log(`Copied column ${columnToCopy.name} to clipboard`);
        }
      }
    }
    handleContextMenuClose();
  };

  // Paste column: insert to the right of the selected/target column
  const handlePasteColumn = () => {
    if (!(clipboard && clipboard.type === 'column' && clipboard.data)) {
      handleContextMenuClose();
      return;
    }

    const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
    if (!currentScene) {
      handleContextMenuClose();
      return;
    }

    const targetColumnId = contextMenu.columnId;
    const targetIndex = targetColumnId
      ? currentScene.columns.findIndex((c: any) => c.id === targetColumnId)
      : currentScene.columns.length - 1;
    const insertIndex = targetIndex >= 0 ? targetIndex + 1 : currentScene.columns.length;

    const pastedColumn = {
      ...clipboard.data,
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${clipboard.data.name} (Copy)`,
      layers: clipboard.data.layers.map((layer: any) => ({
        ...layer,
        id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }))
    };

    const updatedColumns = [...currentScene.columns];
    updatedColumns.splice(insertIndex, 0, pastedColumn);
    updateScene(currentSceneId, { columns: updatedColumns });
    console.log(`Pasted column ${pastedColumn.name} after column index ${targetIndex}`);

    handleContextMenuClose();
  };

  // Copy cell
  const handleCopyCell = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const column = currentScene.columns.find((col: any) => col.id === contextMenu.columnId);
        if (column) {
          const cellToCopy = column.layers.find((layer: any) => layer.id === contextMenu.layerId);
          if (cellToCopy) {
            setClipboard({
              type: 'cell',
              data: { ...cellToCopy },
              sourceSceneId: currentSceneId
            });
            console.log(`Copied cell ${cellToCopy.name} to clipboard`);
          }
        }
      }
    }
    handleContextMenuClose();
  };

  // Paste cell
  const handlePasteCell = () => {
    if (clipboard && clipboard.type === 'cell' && clipboard.data && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        // Determine target column and layer number from the highlighted cell
        let targetColumnId: string | null = contextMenu.columnId;
        let targetLayerNum: number | null = null;
        if (contextHighlightedCell) {
          const lastDash = contextHighlightedCell.lastIndexOf('-');
          if (lastDash !== -1) {
            targetColumnId = contextHighlightedCell.substring(0, lastDash);
            const numStr = contextHighlightedCell.substring(lastDash + 1);
            const parsed = parseInt(numStr, 10);
            if (!isNaN(parsed)) targetLayerNum = parsed;
          }
        }

        const targetColumn = currentScene.columns.find((col: any) => col.id === targetColumnId);
        if (targetColumn && targetLayerNum !== null) {
          const pastedCell = {
            ...clipboard.data,
            id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `${clipboard.data.name} (Copy)`,
            layerNum: targetLayerNum
          };

          const updatedColumns = currentScene.columns.map((col: any) => {
            if (col.id === targetColumnId) {
              const existingIdx = col.layers.findIndex((l: any) => l.layerNum === targetLayerNum);
              if (existingIdx >= 0) {
                const newLayers = [...col.layers];
                newLayers[existingIdx] = pastedCell;
                return { ...col, layers: newLayers };
              }
              return { ...col, layers: [...col.layers, pastedCell] };
            }
            return col;
          });

          updateScene(currentSceneId, { columns: updatedColumns });
          console.log(`Pasted cell ${pastedCell.name} to column ${targetColumn.name} at row ${targetLayerNum}`);
        }
      }
    }
    handleContextMenuClose();
  };

  // Copy clip
  const handleCopyClip = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const column = currentScene.columns.find((col: any) => col.id === contextMenu.columnId);
        if (column) {
          const layerToCopy = column.layers.find((layer: any) => layer.id === contextMenu.layerId);
          if (layerToCopy && layerToCopy.asset) {
            setClipboard({
              type: 'clip',
              data: { ...layerToCopy },
              sourceSceneId: currentSceneId
            });
            console.log(`Copied clip ${layerToCopy.asset.name} to clipboard`);
          }
        }
      }
    }
    handleContextMenuClose();
  };

  // Paste clip (replaces existing content)
  const handlePasteClip = () => {
    if (clipboard && clipboard.type === 'clip' && clipboard.data && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        // Determine target column and layer number from the highlighted cell
        let targetColumnId: string | null = contextMenu.columnId;
        let targetLayerNum: number | null = null;
        if (contextHighlightedCell) {
          const lastDash = contextHighlightedCell.lastIndexOf('-');
          if (lastDash !== -1) {
            targetColumnId = contextHighlightedCell.substring(0, lastDash);
            const numStr = contextHighlightedCell.substring(lastDash + 1);
            const parsed = parseInt(numStr, 10);
            if (!isNaN(parsed)) targetLayerNum = parsed;
          }
        }

        const targetColumn = currentScene.columns.find((col: any) => col.id === targetColumnId);
        if (targetColumn && targetLayerNum !== null) {
          const pastedClip = {
            ...clipboard.data,
            id: `layer-${Date.now()}-${Math.random().toString(36).substr(36, 9)}`,
            name: `${clipboard.data.name} (Copy)`,
            layerNum: targetLayerNum
          };

          const updatedColumns = currentScene.columns.map((col: any) => {
            if (col.id === targetColumnId) {
              const existingIdx = col.layers.findIndex((l: any) => l.layerNum === targetLayerNum);
              if (existingIdx >= 0) {
                const newLayers = [...col.layers];
                newLayers[existingIdx] = pastedClip;
                return { ...col, layers: newLayers };
              }
              return { ...col, layers: [...col.layers, pastedClip] };
            }
            return col;
          });

        updateScene(currentSceneId, { columns: updatedColumns });
        console.log(`Pasted clip ${pastedClip.name} to column ${targetColumn.name} at row ${targetLayerNum}`);
        }
      }
    }
    handleContextMenuClose();
  };



  // Drag start wrapper currently unused by UI bindings
  // const handleLayerReorderDragStartWrapper = (e: React.DragEvent, layer: any, columnId: string) => {
  //   handleLayerReorderDragStart(e, layer, columnId, setDraggedLayer);
  // };

  const handleLayerReorderDragOverWrapper = (e: React.DragEvent, targetColumnId: string, targetLayerNum: number) => {
    handleLayerReorderDragOver(e, targetColumnId, targetLayerNum, draggedLayer, setDragOverLayer);
  };

  const handleLayerReorderDropWrapper = (e: React.DragEvent, targetColumnId: string, targetLayerNum: number) => {
    handleLayerReorderDrop(e, targetColumnId, targetLayerNum, draggedLayer, currentScene, currentSceneId, updateScene);
  };

  // Helpers to robustly match effect ids/names between timeline clips and scene layers
  const normalize = (s?: string) => (s || '').toString().trim();
  const toVariants = (id?: string) => {
    const raw = normalize(id);
    if (!raw) return [] as string[];
    const dashed = raw.replace(/([A-Z])/g, '-$1').replace(/^-/, '').toLowerCase();
    const noEffect = raw.replace(/Effect$/i, '');
    const withEffect = raw.match(/Effect$/i) ? raw : `${raw}Effect`;
    return Array.from(new Set([
      raw,
      raw.toLowerCase(),
      raw.toUpperCase(),
      dashed,
      dashed.replace(/-effect$/, ''),
      noEffect,
      noEffect.toLowerCase(),
      withEffect,
      withEffect.toLowerCase(),
    ]));
  };
  const getAssetId = (asset: any) => normalize(asset?.id || asset?.name || asset?.effectId || '');
  const layerEffectId = (layer: any) => normalize(layer?.asset?.id || layer?.asset?.name || '');
  const effectMatches = (layer: any, clipAsset: any) => {
    const lv = toVariants(layerEffectId(layer));
    const cv = toVariants(getAssetId(clipAsset));
    return lv.some((a) => cv.includes(a));
  };

  // Render preview content
  const renderPreviewContent = () => {
    console.log('🎨 renderPreviewContent called');
    console.log('🎨 previewContent:', previewContent);
    console.log('🎨 isPlaying:', isPlaying);
    
    if (!previewContent) {
      console.log('🎨 No preview content, showing placeholder');
      return (
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
          {(() => {
            const w = Math.max(1, Number(compositionSettings?.width) || 1920);
            const h = Math.max(1, Number(compositionSettings?.height) || 1080);
            const aspectRatio = w / h;
            const bg = (compositionSettings as any)?.backgroundColor || '#000000';
            return (
              <div
                className="tw-relative tw-w-full"
                data-aspect-ratio={`${w}:${h}`}
                style={{ aspectRatio }}
              >
                <div className="tw-absolute tw-inset-0" style={{ backgroundColor: bg }} aria-label="Composition placeholder" title="Composition" />
              </div>
            );
          })()}
        </div>
      );
    }

    // Render timeline preview using the exact same component as column preview
    if (previewContent.type === 'timeline') {
      console.log('🎬 Rendering timeline preview via ColumnPreview');
      const activeClips = previewContent.activeClips || [];
      // Prepare scene layers for parameter resolution so timeline reflects live edits
      const sceneAllLayers = (currentScene?.columns || []).flatMap((c: any) => c.layers || []);
      // Convert active clips into a temporary column structure
      const tempLayers = activeClips.map((clip: any) => {
        const trackNumber = parseInt((clip.trackId || 'track-1').split('-')[1] || '1', 10);
        let matchedLayer: any = null;
        // 1) If the selected timeline clip matches this clip, prefer exact layerId
        if (selectedTimelineClip && selectedTimelineClip.id === clip.id && selectedTimelineClip.layerId) {
          matchedLayer = sceneAllLayers.find((l: any) => l.id === selectedTimelineClip.layerId) || null;
        }
        // 2) If not found, try deterministic mapping: Track N => Layer N
        if (!matchedLayer) {
          matchedLayer = sceneAllLayers.find((l: any) => l.layerNum === trackNumber && (l?.asset?.isEffect || l?.type === 'effect')) || null;
        }
        // 3) Fallback to effect id/name match
        if (!matchedLayer) {
          matchedLayer = sceneAllLayers.find((l: any) => (l?.asset?.isEffect || l?.type === 'effect') && effectMatches(l, clip?.asset)) || null;
        }
        // Timeline clips should remain separate from column view; prefer clip params
        const resolvedParams = clip.params || matchedLayer?.params || {};
        // Resolve effective fit mode: use matched layer if present, else global default
        let effectiveFitMode: 'cover' | 'contain' | 'stretch' | 'none' | 'tile' | undefined = undefined;
        try {
          if (clip.type !== 'effect') {
            effectiveFitMode = (matchedLayer as any)?.fitMode;
            if (!effectiveFitMode) {
              const storeModule: any = require('../store/store');
              const useStore = (storeModule && (storeModule.useStore || storeModule.default?.useStore)) || storeModule.useStore;
              effectiveFitMode = useStore?.getState?.().defaultVideoFitMode || 'cover';
            }
          }
        } catch {}
        // Tile needs repeat hints to EffectChain
        const backgroundProps = (() => {
          if (effectiveFitMode === 'tile') {
            return { backgroundRepeat: 'repeat' as const, backgroundSizeMode: 'contain' as const };
          }
          return {} as any;
        })();
        return {
          id: `timeline-layer-${clip.id}`,
          name: `Layer ${trackNumber}`,
          layerNum: trackNumber,
          type: clip.type === 'effect' ? 'effect' : 'video',
          asset: clip.asset,
          opacity: 1,
          blendMode: 'add',
          params: resolvedParams,
          effects: clip.type === 'effect' ? [clip.asset] : undefined,
          ...(clip.type !== 'effect' ? { fitMode: effectiveFitMode, ...backgroundProps } : {})
        };
      });

      const tempColumn = {
        id: 'timeline-preview',
        name: 'Timeline Preview',
        layers: tempLayers,
      } as any;

      const aspectRatio = compositionSettings.width / compositionSettings.height;
      return (
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
          <div
            className="tw-relative tw-w-full"
            data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
            style={{ aspectRatio }}
          >
            <ColumnPreview
              column={tempColumn}
              width={compositionSettings.width}
              height={compositionSettings.height}
              isPlaying={Boolean(previewContent.isPlaying)}
              bpm={bpm}
              globalEffects={currentScene?.globalEffects || []}
            />
          </div>
        </div>
      );
    }

    if (previewContent.type === 'column') {
      console.log('🎨 Rendering column preview');
      // Always resolve the latest column from the store so updates are live
      const liveColumn = currentScene?.columns?.find((col: any) => col.id === previewContent.columnId) || previewContent.column;

      // Show the first layer with content as the main preview
      const layersWithContent = (liveColumn?.layers || []).filter((layer: any) => layer.asset);
      console.log('🎨 Layers with content (live):', layersWithContent);
      
      // Check if this is an empty column
      if (previewContent.isEmpty || layersWithContent.length === 0) {
        console.log('🎨 No layers with content, showing empty column message');
        return (
          <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden">
            <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
              <h4 className="tw-text-sm tw-text-white">Column Preview</h4>
              <span className="tw-text-xs tw-text-neutral-400">Empty</span>
            </div>
            <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-1 tw-p-4">
              <p className="tw-text-neutral-300">No media content</p>
              <small className="tw-text-neutral-500">Drag assets from the Media Library to layers to see preview</small>
              <div className="tw-mt-2 tw-text-neutral-400 tw-text-xs tw-space-y-1">
                <p className="tw-font-semibold">How to add content:</p>
                <ol className="tw-list-decimal tw-list-inside tw-space-y-0.5">
                  <li>Open the Media Library (bottom right)</li>
                  <li>Import or drag media files</li>
                  <li>Drag assets from Media Library to layer cells</li>
                  <li>Click the play button to preview</li>
                </ol>
              </div>
            </div>
          </div>
        );
      }

        // Use the ColumnPreview component with the live column for combined layer rendering
      console.log('🎨 Rendering combined column preview with p5.js');
        console.log('🎨 Column data (live):', liveColumn);
      console.log('🎨 Composition settings:', compositionSettings);
      
              // Calculate aspect ratio dynamically
        const aspectRatio = compositionSettings.width / compositionSettings.height;
        
        const previewElement = (
          <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
            <div 
              className="tw-relative tw-w-full"
              data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
              style={{ aspectRatio: aspectRatio }}
            >
              <ColumnPreview
                column={liveColumn}
                width={compositionSettings.width}
                height={compositionSettings.height}
                isPlaying={isPlaying && playingColumnId === previewContent.columnId}
                bpm={bpm}
                globalEffects={currentScene?.globalEffects || []}
              />
            </div>
                     {debugMode && (
             <div className="tw-px-3 tw-py-2">
               <h5 className="tw-text-sm tw-font-semibold tw-text-white">Layers in Column:</h5>
               {layersWithContent.map((layer: any) => (
                 <div key={layer.id} className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-neutral-300 tw-border-b tw-border-neutral-800 tw-py-1">
                   <div className="tw-font-medium">{layer.name}</div>
                   <div className="tw-text-neutral-400">{layer.asset.type}</div>
                 </div>
               ))}
             </div>
           )}
          </div>
        );
      
      console.log('🎨 Returning column preview element:', previewElement);
      return previewElement;
    }

    if (previewContent.type === 'layer') {
      return (
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
          <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
            <h4 className="tw-text-sm tw-text-white">Layer Preview</h4>
            <span className="tw-text-xs tw-text-neutral-400">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="tw-p-2">
            <div className="tw-text-sm tw-text-neutral-200 tw-mb-2">{previewContent.layer.name}</div>
            {previewContent.asset && (
              <div className="tw-rounded tw-border tw-border-neutral-800 tw-bg-black">
                <CanvasRenderer
                  assets={[{
                    type: previewContent.asset.type === 'image' ? 'image' : 
                           previewContent.asset.type === 'video' ? 'video' : 'effect',
                    asset: previewContent.asset,
                    layer: previewContent.layer
                  }]}
                  width={compositionSettings.width}
                  height={compositionSettings.height}
                  bpm={bpm}
                  isPlaying={isPlaying}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (previewContent.type === 'timeline') {
      const activeClips = previewContent.activeClips || [];
      
      return (
        <div className="tw-h-full tw-flex tw-flex-col">
          <div className="tw-flex tw-items-center tw-gap-3 tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
            <h4 className="tw-text-sm tw-text-white">Timeline Preview</h4>
            <span className="tw-text-xs tw-text-neutral-400">{isPlaying ? 'Playing' : 'Stopped'}</span>
            <div className="tw-text-xs tw-text-neutral-400">
              Time: {Math.floor(previewContent.currentTime)}s / {Math.floor(previewContent.duration)}s
            </div>
          </div>
          
          <div className="tw-flex tw-flex-col tw-gap-2 tw-flex-1 tw-p-2 tw-rounded-md tw-bg-neutral-900 tw-border tw-border-neutral-800">
            {activeClips.length === 0 ? (
              <div className="tw-flex tw-items-center tw-justify-center tw-h-48 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded">
                <div className="tw-text-center tw-text-neutral-300">
                  <div className="tw-text-sm">No clips playing at current time</div>
                  <div className="tw-mt-1 tw-text-xs tw-text-neutral-400">{Math.floor(previewContent.currentTime)}s</div>
                </div>
              </div>
            ) : (
              <div className="tw-flex tw-flex-col tw-gap-2">
                <div 
                  className="tw-relative tw-rounded tw-border tw-border-neutral-800 tw-bg-black"
                  data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
                  style={{ aspectRatio: compositionSettings.width / compositionSettings.height }}
                >
                  <TimelineComposer
                    activeClips={activeClips}
                    isPlaying={isPlaying}
                    currentTime={previewContent.currentTime}
                    width={compositionSettings.width}
                    height={compositionSettings.height}
                    bpm={bpm}
                    globalEffects={[]} // Add global effects support here if needed
                  />
                </div>
                
                <div className="tw-mt-2">
                  <h5 className="tw-text-sm tw-font-semibold tw-text-white">Active Timeline Clips:</h5>
                  {activeClips.map((clip: any) => (
                    <div key={`info-${clip.id}`} className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-neutral-300 tw-border-b tw-border-neutral-800 tw-py-1">
                      <div className="tw-font-medium">Track {clip.trackId.split('-')[1]}</div>
                      <div className="tw-text-neutral-400">{clip.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="tw-w-full tw-h-full tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-text-sm tw-py-4">
        <div>Preview not available</div>
      </div>
    );
  };

  if (!currentScene) {
    return (
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col lg:tw-overflow-hidden tw-overflow-auto">
        <div className="tw-flex tw-flex-col tw-h-full lg:tw-overflow-hidden tw-overflow-auto">
          <div className="tw-flex tw-items-center tw-justify-between tw-h-12 tw-px-4 tw-py-2 tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
            <h2>No Scene Selected</h2>
            <div className="scene-controls">
              <button onClick={addScene} className="add-scene-btn">
                + Create Scene
              </button>
            </div>
          </div>
          <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center">
            <div className="tw-text-center tw-space-y-2">
              <h3 className="tw-text-lg">Welcome to VJ</h3>
              <p className="tw-text-sm tw-text-neutral-300">Create your first scene to get started</p>
              <button onClick={addScene} className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-text-white tw-px-3 tw-py-1.5" style={{ backgroundColor: 'var(--accent)' }}>Create New Scene</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Resolve layer from selectedTimelineClip if present
  let effectiveSelectedLayer = selectedLayer;
  if (selectedTimelineClip) {
    // When a timeline clip is selected, prefer timeline-driven resolution over prior grid selection
    effectiveSelectedLayer = null as any;
  }
  if (selectedTimelineClip && currentSceneId) {
    const scene = scenes.find((s: any) => s.id === currentSceneId);
    if (scene) {
      const allLayers = scene.columns.flatMap((c: any) => c.layers);
      // Prefer an explicit layerId supplied by timeline selection
      if (selectedTimelineClip.layerId) {
        const layer = allLayers.find((l: any) => l.id === selectedTimelineClip.layerId);
        if (layer) effectiveSelectedLayer = layer;
      }
      if (!effectiveSelectedLayer) {
        const assetId = selectedTimelineClip?.data?.asset?.id || selectedTimelineClip?.data?.asset?.name || selectedTimelineClip?.data?.name;
        const isVideo = selectedTimelineClip?.data?.type === 'video' || selectedTimelineClip?.data?.asset?.type === 'video';
        const match = isVideo
          ? allLayers.find((l: any) => l?.asset?.type === 'video' && (l?.asset?.id === assetId || l?.asset?.name === assetId))
          : allLayers.find((l: any) => (l?.asset?.isEffect || l?.type === 'effect') && (l?.asset?.id === assetId || l?.asset?.name === assetId));
        if (match) effectiveSelectedLayer = match;
      }
      if (!effectiveSelectedLayer) {
        // Try deterministic mapping: Track N => Layer N
        const trackNum = parseInt((selectedTimelineClip.trackId || 'track-1').split('-')[1] || '1', 10);
        const byNum = allLayers.find((l: any) => l.layerNum === trackNum);
        if (byNum) effectiveSelectedLayer = byNum;
      }
      if (!effectiveSelectedLayer) {
        const effectLayer = allLayers.find((l: any) => l?.asset?.isEffect || l?.type === 'effect');
        if (effectLayer) effectiveSelectedLayer = effectLayer;
      }
    }
  }

  // If no real layer resolved but a timeline clip is selected, construct a memoized pseudo layer so Layer Options can render without loops
  const memoPseudoLayer = React.useMemo(() => {
    if (!selectedTimelineClip || !selectedTimelineClip.data) return null;
    const clip: any = selectedTimelineClip.data;
    const trackNumber = parseInt((selectedTimelineClip.trackId || 'track-1').split('-')[1] || '1', 10);
    return {
      id: `timeline-layer-${selectedTimelineClip.id}`,
      name: clip.name || `Layer ${trackNumber}`,
      layerNum: trackNumber,
      type: clip.type === 'effect' ? 'effect' : 'video',
      asset: clip.asset,
      opacity: 1,
      blendMode: 'add',
      // Keep reference stable to clip.params to avoid triggering effects on each render
      params: clip.params || {},
      effects: clip.type === 'effect' ? [clip.asset] : undefined,
    } as any;
  }, [
    selectedTimelineClip?.id,
    selectedTimelineClip?.trackId,
    selectedTimelineClip?.data?.name,
    selectedTimelineClip?.data?.type,
    selectedTimelineClip?.data?.asset?.id,
    selectedTimelineClip?.data?.params,
  ]);

  if (!effectiveSelectedLayer && memoPseudoLayer) {
    effectiveSelectedLayer = memoPseudoLayer;
  }

  // Auto-focus Layer tab and select resolved layer when a timeline clip is chosen
  useEffect(() => {
    if (!selectedTimelineClip) return;
    try {
      setMiddlePanelTab('layer');
      const scene = scenes.find((s: any) => s.id === currentSceneId);
      const allLayers = scene ? scene.columns.flatMap((c: any) => c.layers) : [];
      let resolved: any = null;
      if (selectedTimelineClip.layerId) {
        resolved = allLayers.find((l: any) => l.id === selectedTimelineClip.layerId) || null;
      }
      if (!resolved && typeof selectedTimelineClip.trackNum === 'number') {
        const byNum = allLayers.find((l: any) => l.layerNum === selectedTimelineClip.trackNum);
        if (byNum) resolved = byNum;
      }
      if (!resolved) {
        const assetId = selectedTimelineClip?.data?.asset?.id || selectedTimelineClip?.data?.asset?.name || selectedTimelineClip?.data?.name;
        if (selectedTimelineClip?.data?.type === 'video') {
          resolved = allLayers.find((l: any) => l?.asset?.type === 'video' && (l?.asset?.id === assetId || l?.asset?.name === assetId)) || null;
        } else {
          resolved = allLayers.find((l: any) => (l?.asset?.isEffect || l?.type === 'effect') && (l?.asset?.id === assetId || l?.asset?.name === assetId)) || null;
        }
      }
      if (!resolved) {
        resolved = allLayers.find((l: any) => l?.asset?.isEffect || l?.type === 'effect') || null;
      }
      if (resolved) setSelectedLayer(resolved);
    } catch {}
  }, [selectedTimelineClip, scenes, currentSceneId]);

  // Ensure we have at least 30 columns
  const columns = [...currentScene.columns];
  let columnsAdded = 0;
  while (columns.length < 30) {
    const newCol = createColumn();
    newCol.name = `Column ${columns.length + 1}`;
    columns.push(newCol);
    columnsAdded++;
  }
  // Persist newly-added columns once
  if (columnsAdded > 0) {
    console.log('➕ Added', columnsAdded, 'columns to scene', currentSceneId);
    updateScene(currentSceneId, { columns });
  }

  // Migrate global effects to new format if needed
  if (currentScene.globalEffects) {
    let effectsMigrated = false;
    const migratedEffects = (currentScene.globalEffects as any[])
      .map((effect: any) => {
        // Drop null/undefined entries safely
        if (effect == null) {
          effectsMigrated = true;
          return null;
        }
        // Old format: just a string ID
        if (typeof effect === 'string') {
          effectsMigrated = true;
          return {
            id: uuidv4(),
            effectId: effect,
            enabled: true,
            params: {}
          };
        }
        // New format object but missing id
        if (typeof effect === 'object') {
          if (!('id' in effect) || !effect.id) {
            effectsMigrated = true;
            return {
              ...effect,
              id: uuidv4()
            };
          }
          return effect;
        }
        // Unknown type, drop it
        effectsMigrated = true;
        return null;
      })
      .filter((e: any) => e != null);

    if (effectsMigrated) {
      console.log('🔄 Migrating global effects to new format');
      updateScene(currentSceneId, { globalEffects: migratedEffects });
    }
  }

  try {
    console.log('LayerManager about to render main content');
    
    return (
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col lg:tw-overflow-hidden tw-overflow-auto">
        <div className="tw-flex tw-flex-col tw-h-full lg:tw-min-h-0 lg:tw-overflow-y-auto lg:tw-pb-0">
          <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
            <div className="header-left tw-flex tw-items-center tw-gap-2 tw-flex-wrap">

              <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap tw-w-full">
                {/* BPM Controls moved to the far left (before global playback controls) */}
                <div className="tw-flex tw-items-center tw-gap-2">
                  <button 
                    onClick={() => {
                      const bpmManager = BPMManager.getInstance();
                      bpmManager.tap();
                      const newBpm = bpmManager.getBPM();
                      setBpm(newBpm);
                    }}
                    className="tw-inline-flex tw-items-center tw-justify-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-w-8 tw-h-10 tw-rounded-full hover:tw-bg-neutral-800"
                    title="Tap to set BPM"
                  >
                    <span
                      className={`tw-block tw-rounded-full tw-w-2 tw-h-2 tw-transition-transform tw-duration-150 tw-ease-out ${isBeatPulse ? 'tw-scale-125' : 'tw-scale-100'}`}
                      style={{ backgroundColor: 'var(--accent)' }}
                      aria-hidden="true"
                    />
                  </button>
                  <input
                    id="bpm-input"
                    type="number"
                    min="30"
                    max="999"
                    value={bpmInputValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBpmInputValue(value);
                      if (value === '') return;
                      const newBpm = parseInt(value);
                      if (!isNaN(newBpm) && newBpm >= 30 && newBpm <= 999) {
                        setBpm(newBpm);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value === '' || isNaN(parseInt(value))) {
                        setBpm(120);
                        setBpmInputValue('120');
                      } else {
                        setBpmInputValue(bpm.toString());
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="tw-w-16 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-2 focus:tw-ring-2 focus:tw-ring-purple-600"
                    placeholder="120"
                  />
                </div>
                
                {/* Global playback controls */}
                {!showTimeline && (
                  <div className="tw-flex tw-items-center tw-gap-2 tw-px-2 tw-h-10 tw-my-2 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
                    <button
                      onClick={globalPlay}
                      className={`tw-inline-flex tw-items-center tw-justify-center tw-px-3 tw-py-2 tw-border tw-text-sm tw-rounded ${isGlobalPlaying ? 'tw-bg-blue-600 tw-text-white tw-border-blue-600' : 'tw-bg-neutral-800 tw-text-neutral-300 tw-border-neutral-700'} hover:tw-bg-blue-600 hover:tw-text-white`}
                      title="Play - Resume all videos"
                    >
                      <PlayIcon className="tw-w-4 tw-h-4" />
                    </button>
                    <button
                      onClick={globalPause}
                      className={`tw-inline-flex tw-items-center tw-justify-center tw-px-3 tw-py-2 tw-border tw-text-sm tw-rounded ${!isGlobalPlaying ? 'tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-300 tw-border-neutral-700'}`}
                      style={!isGlobalPlaying ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                      title="Pause - Pause all videos"
                    >
                      <PauseIcon className="tw-w-4 tw-h-4" />
                    </button>
                    <button
                      onClick={globalStop}
                      className="tw-inline-flex tw-items-center tw-justify-center tw-px-3 tw-py-2 tw-border tw-text-sm tw-rounded tw-bg-neutral-800 tw-text-neutral-300 tw-border-neutral-700 hover:tw-bg-red-600 hover:tw-text-white hover:tw-border-red-600"
                      title="Stop - Stop all videos"
                    >
                      <StopIcon className="tw-w-4 tw-h-4" />
                    </button>
                  </div>
                )}
                {showTimeline && (
                  <div className="tw-mr-3">
                    <TimelineControls />
                  </div>
                )}
                {/* Unified scene navigator: desktop shows list; mobile centers current scene with arrows */}
                <div className="tw-flex tw-items-center tw-gap-2 tw-basis-full tw-order-last lg:tw-order-none lg:tw-basis-auto tw-mt-2 lg:tw-mt-0 tw-w-full lg:tw-w-auto tw-justify-between lg:tw-justify-start">
                <button
                  onClick={() => {
                    const currentIndex = scenes.findIndex((s: any) => s.id === currentSceneId);
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : scenes.length - 1;
                    setCurrentScene(scenes[prevIndex].id);
                  }}
                  disabled={scenes.length <= 1}
                  className="tw-inline-flex lg:tw-hidden tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-300 tw-rounded hover:tw-bg-neutral-800 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                  title="Previous scene"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                {/* Mobile: single current scene label centered */}
                <div className="tw-flex-1 tw-flex tw-justify-center lg:tw-hidden">
                  <button
                    className={`tw-text-xs tw-rounded tw-bg-neutral-900 tw-text-neutral-200 hover:tw-bg-neutral-800 tw-border tw-border-neutral-800 tw-px-2 tw-py-2 tw-max-w-[60%] tw-truncate focus:tw-outline-none focus:tw-ring-0 focus:tw-ring-offset-0 ${'tw-text-white'}`}
                    style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' }}
                    title={currentScene?.name || 'Current scene'}
                  >
                    {currentScene?.name || 'Scene'}
                  </button>
                </div>

                <div className="tw-hidden lg:tw-flex tw-items-center tw-gap-2 tw-overflow-x-auto tw-whitespace-nowrap tw-flex-1 tw-basis-full tw-order-last lg:tw-order-none lg:tw-basis-auto tw-mt-2 lg:tw-mt-0">
                  {scenes.map((scene: any, index: number) => (
                    <ContextMenu key={scene.id}>
                      <ContextMenuTrigger asChild>
                        <button
                          className={`tw-text-xs tw-rounded tw-bg-neutral-900 tw-text-neutral-200 hover:tw-bg-neutral-800 tw-border tw-border-neutral-800 tw-px-2 tw-py-2 focus:tw-outline-none focus:tw-ring-0 focus:tw-ring-offset-0 ${scene.id === currentSceneId ? 'tw-text-white' : ''}`}
                          style={scene.id === currentSceneId ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                          onClick={() => setCurrentScene(scene.id)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-scene-index', String(index));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            const fromStr = e.dataTransfer.getData('application/x-scene-index');
                            if (fromStr) {
                              const from = parseInt(fromStr, 10);
                              if (!Number.isNaN(from)) reorderScenes(from, index);
                            }
                          }}
                          title={"Right-click to rename, duplicate, or delete"}
                        >
                          {scene.name}
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => handleSceneRename(scene, updateScene)}>Rename</ContextMenuItem>
                        <ContextMenuItem onSelect={() => duplicateScene(scene.id)}>Duplicate</ContextMenuItem>
                        {scenes.length > 1 && (
                          <ContextMenuItem className="tw-text-red-400" onSelect={() => removeScene(scene.id)}>Delete</ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                  <button onClick={addScene} className="tw-ml-2 tw-inline-flex tw-items-center tw-justify-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-w-8 tw-h-10 hover:tw-bg-neutral-800" title="Add new scene">
                    +
                  </button>
                </div>
                <button
                  onClick={() => {
                    const currentIndex = scenes.findIndex((s: any) => s.id === currentSceneId);
                    const nextIndex = currentIndex < scenes.length - 1 ? currentIndex + 1 : 0;
                    setCurrentScene(scenes[nextIndex].id);
                  }}
                  disabled={scenes.length <= 1}
                  className="tw-inline-flex lg:tw-hidden tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-300 tw-rounded hover:tw-bg-neutral-800 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                  title="Next scene"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
                </button>
                </div>
              </div>
            </div>
            <div className="tw-flex tw-items-center tw-gap-4"></div>

          </div>

          <div className="tw-w-full">
            {showTimeline ? (
              <Timeline 
                onClose={() => setShowTimeline(false)} 
                onPreviewUpdate={handleTimelinePreviewUpdate}
              />
            ) : (
              <>
                {/* Global Effects Row removed - moved into Global tab */}

            {/* Columns + Layers: fixed column width; custom scroll (horizontal) */}
            <ScrollArea.Root className="vj-scroll-root tw-w-full" type="always">
              <ScrollArea.Viewport className="vj-scroll-viewport tw-w-full tw-pr-3 tw-pb-3" ref={gridWrapperRef}>
              <div className="tw-space-y-2">
                {/* Composition Row */}
                <div className="tw-grid tw-gap-2" style={{ gridTemplateColumns: columnWidth ? `repeat(${columns.length}, ${columnWidth}px)` : undefined }}>
                {columns.map((column: any) => {
                const isColumnPlaying = playingColumnId === column.id;
                // Consider column playable if any layer has an asset
                const hasClips = column.layers.some((layer: any) => Boolean(layer?.asset));
                
                return (
                  <div key={column.id} className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-overflow-hidden">
                    <div 
                      className={`tw-flex tw-items-center tw-justify-between tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800 ${isColumnPlaying ? 'tw-bg-[hsl(var(--accent))/0.18]' : 'tw-bg-neutral-800'} ${hasClips ? 'tw-cursor-pointer' : 'tw-cursor-default'} ${!hasClips ? 'tw-opacity-60' : ''}`}
                      onClick={() => {
                        // Only allow play functionality if column has clips
                        if (hasClips) {
                          console.log('Column header clicked for column:', column.id);
                          console.log('Starting/restarting column playback from header');
                          handleColumnPlayWrapper(column.id);
                        }
                      }}
                      title={hasClips ? "Click anywhere to play/restart column" : "Column has no clips"}
                    >
                      <h4
                        className={`tw-text-sm ${isColumnPlaying ? 'tw-text-[hsl(var(--accent))]' : 'tw-text-white'}`}
                        style={isColumnPlaying ? { color: 'hsl(var(--accent))' } : undefined}
                      >
                        {columns.findIndex(c => c.id === column.id) + 1}
                      </h4>
                      <div
                        className={isColumnPlaying ? 'tw-text-[hsl(var(--accent))]' : 'tw-text-neutral-300'}
                        style={isColumnPlaying ? { color: 'hsl(var(--accent))' } : undefined}
                      >
                        {hasClips ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
                </div>

                {/* Layer Rows */}
                {[3, 2, 1].map((layerNum) => (
                  <div key={layerNum} className="tw-grid tw-gap-2" style={{ gridTemplateColumns: columnWidth ? `repeat(${columns.length}, ${columnWidth}px)` : undefined }}>
                  {columns.map((column: any) => {
                   // Find layer by layer number or name fallback
                   const layer = column.layers.find((l: any) => l.layerNum === layerNum || l.name === `Layer ${layerNum}`);
                   const displayName = layer?.asset?.name || layer?.asset?.metadata?.name || layer?.asset?.effect?.name || '';
                   const displayNameClean = (displayName || '').replace(/\.[^/.]+$/, '');
                   const hasAsset = Boolean(layer?.asset);
                   const cellId = `${column.id}-${layerNum}`;
                   const isDragOver = dragOverCell === cellId;
                   const isDragOverLayer = dragOverLayer === cellId;
 
                   return (
                     <div
                       key={cellId}
                                               className={`tw-rounded-md tw-overflow-hidden ${hasAsset ? 'tw-border tw-border-neutral-800 tw-bg-neutral-900' : 'tw-border tw-border-dashed tw-border-neutral-800 tw-bg-neutral-900/50'} ${(isDragOver || isDragOverLayer) ? 'tw-ring-2 tw-ring-sky-600' : ''} ${contextHighlightedCell === cellId ? 'tw-bg-neutral-800/60' : ''}`}
                       data-system-files={isDragOver && (() => {
                         const dragData = (window as any).currentDragData;
                         return dragData && dragData.files && dragData.files.length > 0 ? 'true' : 'false';
                       })()}
                       onClick={() => hasAsset && handleLayerClickWrapper(layer, column.id)}
                       onContextMenu={(e) => {
                         if (hasAsset) {
                           handleCellRightClick(e, layer, column.id);
                         }
                       }}
                       onDragStart={(e) => {
                         if (hasAsset) {
                           handleLayerReorderDragStart(e, layer, column.id, setDraggedLayer);
                         }
                       }}
                       onDragEnd={handleDragEnd}
                       onDragOver={(e) => {
                         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                           (window as any).currentDragData = { files: e.dataTransfer.files };
                         }
                         if (draggedLayer) {
                           // If we're dragging any layer, treat it as a reorder operation
                           // This allows cross-column dragging
                           handleLayerReorderDragOverWrapper(e, column.id, layerNum);
                         } else {
                           // Otherwise handle external asset/file drag
                           handleDragOverWrapper(e, cellId);
                         }
                       }}
                       onDragLeave={(e) => handleDragLeaveWrapper(e)}
                       onDrop={(e) => {
                         (window as any).currentDragData = null;
                         const dragData = e.dataTransfer.getData('application/json');
                         if (dragData) {
                           try {
                             const data = JSON.parse(dragData);
                             if (data.type === 'layer-reorder') {
                               handleLayerReorderDropWrapper(e, column.id, layerNum);
                             } else {
                               handleDropWrapper(e, column.id, layerNum);
                             }
                           } catch (error) {
                             handleDropWrapper(e, column.id, layerNum);
                           }
                         } else {
                           handleDropWrapper(e, column.id, layerNum);
                         }
                       }}
                       draggable={hasAsset}
                     >
                       {hasAsset ? (
                         <div 
                           className="tw-p-2 tw-space-y-1"
                           onDragOver={(e) => {
                             e.preventDefault();
                             e.currentTarget.classList.add('drag-over');
                           }}
                           onDragLeave={(e) => {
                             e.currentTarget.classList.remove('drag-over');
                           }}
                           onDrop={(e) => {
                             e.preventDefault();
                             e.currentTarget.classList.remove('drag-over');
                             try {
                               const raw = e.dataTransfer.getData('application/json');
                               const data = raw ? JSON.parse(raw) : null;
                               if (data && data.type === 'layer-reorder') {
                                 handleLayerReorderDropWrapper(e, column.id, layerNum);
                               } else {
                                 handleDropWrapper(e, column.id, layerNum);
                               }
                             } catch {
                               handleDropWrapper(e, column.id, layerNum);
                             }
                           }}
                         >
                           <div className="tw-mb-1">
                             {layer.asset.type === 'image' && (
                               <img
                                 src={getAssetPath(layer.asset)}
                                 alt={displayNameClean}
                                 className="tw-w-full tw-aspect-video tw-object-cover tw-rounded"
                                 onLoad={() => {
                                   console.log('Image loaded successfully:', layer.asset.name, 'Path:', getAssetPath(layer.asset));
                                 }}
                                 onError={(e) => {
                                   console.error('Failed to load image:', layer.asset.name, 'Path:', getAssetPath(layer.asset));
                                   e.currentTarget.style.display = 'none';
                                   const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                   if (fallback) {
                                     fallback.style.display = 'flex';
                                   }
                                 }}
                               />
                             )}
                             {layer.asset.type === 'video' && (
                               <div className="tw-w-full tw-aspect-video tw-rounded tw-overflow-hidden">
                                 <video
                                   src={getAssetPath(layer.asset, true)}
                                   className="tw-w-full tw-h-full tw-object-cover"
                                   muted
                                   onLoadStart={() => console.log('Layer video loading:', layer.asset.name)}
                                   onLoadedData={() => console.log('Layer video loaded:', layer.asset.name)}
                                   onError={(e) => console.error('Layer video error:', layer.asset.name, e)}
                                 />
                               </div>
                             )}
                             {(layer.asset.isEffect || layer.asset.type === 'effect' || layer.asset.type === 'p5js' || layer.asset.type === 'threejs') && (
                               <div className="tw-w-full tw-aspect-video tw-bg-black tw-rounded tw-flex tw-items-center tw-justify-center">
                                 <div className="tw-w-2 tw-h-2 tw-rounded-full tw-bg-white/90" />
                               </div>
                             )}
                           </div>
                           <div 
                              className="tw-text-xs tw-text-neutral-200 tw-cursor-grab tw-truncate tw-whitespace-nowrap tw-overflow-hidden"
                              draggable={true}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                handleLayerReorderDragStart(e, layer, column.id, setDraggedLayer);
                              }}
                            >
                             {displayNameClean || 'Empty'}
                           </div>
                           {/* Blend mode label removed per UI cleanup */}
                         </div>
                       ) : (
                         <div 
                           className="tw-p-2 tw-min-h-[48px] tw-flex tw-flex-col tw-justify-center tw-items-center"
                           onDragOver={(e) => {
                             e.preventDefault();
                             e.currentTarget.classList.add('drag-over');
                           }}
                           onDragLeave={(e) => {
                             e.currentTarget.classList.remove('drag-over');
                           }}
                           onDrop={(e) => {
                             e.preventDefault();
                             e.currentTarget.classList.remove('drag-over');
                             try {
                               const raw = e.dataTransfer.getData('application/json');
                               const data = raw ? JSON.parse(raw) : null;
                               if (data && data.type === 'layer-reorder') {
                                 handleLayerReorderDropWrapper(e, column.id, layerNum);
                               } else {
                                 handleDropWrapper(e, column.id, layerNum);
                               }
                             } catch {
                               handleDropWrapper(e, column.id, layerNum);
                             }
                           }}
                           onContextMenu={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             setContextMenu({
                               visible: true,
                               x: e.clientX,
                               y: e.clientY,
                               layerId: `empty-${layerNum}`,
                               columnId: column.id
                             });
                             setContextHighlightedCell(`${column.id}-${layerNum}`);
                           }}
                         >
                           <div className="tw-h-6 tw-w-full tw-rounded tw-border tw-border-dashed tw-border-neutral-700"></div>
                           <div className="tw-text-[10px] tw-text-neutral-500"></div>
                         </div>
                       )}
                     </div>
                   );
                 })}
                 </div>
               ))}
              </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar forceMount
                className="tw-z-10 tw-flex tw-h-2.5 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out tw-mt-1"
                orientation="horizontal"
              >
                <ScrollArea.Thumb className="tw-bg-neutral-600 tw-rounded-[10px] tw-relative tw-cursor-pointer hover:tw-bg-neutral-500 tw-min-w-[28px]" />
              </ScrollArea.Scrollbar>
              <ScrollArea.Scrollbar forceMount
                className="tw-z-10 tw-flex tw-w-2.5 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out"
                orientation="vertical"
              >
                <ScrollArea.Thumb className="tw-bg-neutral-600 tw-rounded-[10px] tw-relative tw-cursor-pointer hover:tw-bg-neutral-500 tw-min-h-[28px]" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            </>
            )}
          </div>



                     

           {/* Resize Handle */}
           <div 
             className={`tw-bg-transparent tw-h-2.5`}
           />

          {/* Bottom Section with Preview, Layer Options, and Media Library */}
          <div 
            className="tw-flex tw-flex-col lg:tw-flex-row tw-gap-3 tw-px-3 tw-pb-3 tw-pt-0 tw-flex-1 lg:tw-sticky lg:tw-top-0 lg:tw-z-30 lg:tw-bg-neutral-900 lg:tw-border-t lg:tw-border-neutral-800 lg:tw-h-[360px]"
          >
            {/* Preview Window - Bottom Left */}
            <div 
              className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden lg:tw-basis-[30%] lg:tw-flex-none tw-min-w-[200px] tw-w-full"
              ref={previewContainerRef}
              style={fsFallbackActive ? { position: 'fixed', inset: 0, zIndex: 9999, width: '100vw', height: '100dvh' as any } : undefined}
            >
              {!(isPreviewFullscreen || fsFallbackActive) && (
                <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800" ref={previewHeaderRef}>
                  <h3>Preview</h3>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <button
                      className="tw-inline-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-rounded tw-text-neutral-300 tw-bg-neutral-900 hover:tw-text-white hover:tw-bg-neutral-800 tw-border tw-border-neutral-700"
                      onClick={() => {
                        try {
                          // Start or show mirror window
                          const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
                          if (!canvas) return;
                          if (!mirrorStreamRef.current) {
                            mirrorStreamRef.current = new CanvasStreamManager(canvas);
                          } else {
                            mirrorStreamRef.current.updateCanvas(canvas);
                          }
                          mirrorStreamRef.current.openMirrorWindow().catch(() => {});
                        } catch {}
                      }}
                      title="Mirror"
                      aria-label="Mirror"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M4 6h8v2H4V6zm0 4h8v2H4v-2zm0 4h8v2H4v-2zm10-8h6v2h-6V6zm0 4h6v2h-6v-2zm0 4h6v2h-6v-2z"/>
                      </svg>
                    </button>
                    <button
                      className="tw-inline-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-rounded tw-text-neutral-300 tw-bg-neutral-900 hover:tw-text-white hover:tw-bg-neutral-800 tw-border tw-border-neutral-700"
                      onClick={togglePreviewFullscreen}
                      title="Fullscreen Preview"
                      aria-label="Fullscreen Preview"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M7 3H3v4h2V5h2V3zm12 0h-4v2h2v2h2V3zM5 17H3v4h4v-2H5v-2zm14 0h-2v2h-2v2h4v-4z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              <div 
                className="tw-flex tw-items-center tw-justify-center tw-bg-neutral-900 tw-w-full tw-flex-1"
              >
                <div
                  style={
                    (isPreviewFullscreen || fsFallbackActive)
                      ? ({ width: '100vw', height: '100dvh' } as any)
                      : ({ width: previewSize.width || undefined, height: previewSize.height || undefined } as any)
                  }
                >
                  {(() => {
                    console.log('🎭 Rendering preview content in preview window');
                    const content = renderPreviewContent();
                    console.log('🎭 Preview content rendered:', content);
                    return content;
                  })()}
                </div>
              </div>
            </div>

            {/* Layer Options / Global - Bottom Center */}
            <div className="tw-flex-1 tw-min-w-[260px] tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-flex tw-flex-col tw-h-full tw-overflow-hidden">
              <div className="tw-border-b tw-border-neutral-800 tw-px-3 tw-py-2">
                <Tabs value={middlePanelTab} onValueChange={(value) => { setMiddlePanelTab(value as 'global' | 'layer'); try { localStorage.setItem('vj-ui-middle-tab', value); } catch {} }} className="tw-w-full">
                  <TabsList className="tw-grid tw-w-full tw-grid-cols-2">
                    <TabsTrigger value="global">Global</TabsTrigger>
                    <TabsTrigger value="layer">Layer</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
                             <div className="tw-flex-1 tw-min-h-0 tw-px-3">
                 <ScrollArea.Root className="vj-scroll-root tw-h-full scroll-touch" type="always">
                   {(() => {
                     const viewportRef = useRef<HTMLDivElement | null>(null);
                     useEffect(() => {
                       const el = viewportRef.current;
                       if (!el) return;

                       let isDown = false;
                       let startX = 0;
                       let startY = 0;
                       let scrollLeft = 0;
                       let scrollTop = 0;

                       const onMouseDown = (e: MouseEvent) => {
                         if (e.button !== 0) return; // left only
                         isDown = true;
                         startX = e.pageX - el.offsetLeft;
                         startY = e.pageY - el.offsetTop;
                         scrollLeft = el.scrollLeft;
                         scrollTop = el.scrollTop;
                         el.classList.add('dragging');
                       };
                       const onMouseLeave = () => { isDown = false; el.classList.remove('dragging'); };
                       const onMouseUp = () => { isDown = false; el.classList.remove('dragging'); };
                       const onMouseMove = (e: MouseEvent) => {
                         if (!isDown) return;
                         e.preventDefault();
                         const x = e.pageX - el.offsetLeft;
                         const y = e.pageY - el.offsetTop;
                         const walkX = (x - startX) * 1; // multiplier for sensitivity
                         const walkY = (y - startY) * 1;
                         el.scrollLeft = scrollLeft - walkX;
                         el.scrollTop = scrollTop - walkY;
                       };

                       el.addEventListener('mousedown', onMouseDown);
                       el.addEventListener('mouseleave', onMouseLeave);
                       el.addEventListener('mouseup', onMouseUp);
                       el.addEventListener('mousemove', onMouseMove);
                       return () => {
                         el.removeEventListener('mousedown', onMouseDown);
                         el.removeEventListener('mouseleave', onMouseLeave);
                         el.removeEventListener('mouseup', onMouseUp);
                         el.removeEventListener('mousemove', onMouseMove);
                       };
                     }, []);
                     return (
                       <ScrollArea.Viewport ref={viewportRef as any} className="vj-scroll-viewport tw-h-full tw-w-full tw-overflow-auto scroll-touch drag-scroll tw-pr-0 sm:tw-pr-3 tw-pb-8" style={{ scrollbarGutter: 'stable' }}>
                         {middlePanelTab === 'global' ? (
                           <div className="tw-h-full">
                             <GlobalEffectsTab className="tw-h-full" />
                           </div>
                         ) : (
                           <div className="tw-h-full tw-min-h-0">
                             <LayerOptions 
                               key={(effectiveSelectedLayer || selectedLayer)?.id || 'none'}
                               selectedLayer={effectiveSelectedLayer || selectedLayer}
                               onUpdateLayer={handleUpdateSelectedLayer}
                             />
                           </div>
                         )}
                       </ScrollArea.Viewport>
                     );
                   })()}
                   <ScrollArea.Scrollbar
                     className="tw-z-10 tw-flex tw-w-2 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out tw-data-[orientation=vertical]:tw-w-2.5 tw-data-[orientation:horizontal]:tw-flex-col tw-data-[orientation:horizontal]:tw-h-2.5"
                     orientation="vertical"
                   >
                     <ScrollArea.Thumb className="tw-flex-1 tw-bg-neutral-500 tw-rounded-[10px] tw-relative tw-cursor-pointer hover:tw-bg-neutral-400" />
                   </ScrollArea.Scrollbar>
                 </ScrollArea.Root>
              </div>
            </div>

            {/* Media Library / MIDI Mapper - Bottom Right */}
            <div className="lg:tw-w-1/3 tw-w-full tw-min-w-[260px] tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-flex tw-flex-col tw-h-full tw-overflow-hidden">
              {/* Tab Navigation */}
              <div className="tw-border-b tw-border-neutral-800 tw-px-3 tw-py-2">
                               <Tabs value={showMediaLibrary ? String(showMediaLibrary) : (localStorage.getItem('vj-ui-right-tab') || 'effects')} onValueChange={(val) => { setShowMediaLibrary(val === 'media' ? false : (val as any)); try { localStorage.setItem('vj-ui-right-tab', String(val)); } catch {} }}>
                <TabsList>
                  <TabsTrigger value="effects">Bank</TabsTrigger>
                  <TabsTrigger value="media">Media</TabsTrigger>
                  <TabsTrigger value="files">Files</TabsTrigger>
                  <TabsTrigger value="midi">MIDI</TabsTrigger>
                  <TabsTrigger value="lfo">LFO</TabsTrigger>
                </TabsList>
              </Tabs>
              </div>
               
                             {/* Tab Content */}
              <div className="tw-p-3 tw-flex-1 tw-min-h-0">
                <ScrollArea.Root className="vj-scroll-root tw-h-full" type="always">
                  <ScrollArea.Viewport className="vj-scroll-viewport tw-h-full tw-w-full tw-pr-3 tw-pb-3">
                    <Tabs value={showMediaLibrary ? String(showMediaLibrary) : (localStorage.getItem('vj-ui-right-tab') || 'effects')} onValueChange={(val) => { setShowMediaLibrary(val === 'media' ? false : (val as any)); try { localStorage.setItem('vj-ui-right-tab', String(val)); } catch {} }}>
                      <TabsContent value="effects">
                        <div className="tw-space-y-2">
                          <EffectsBrowser />
                        </div>
                      </TabsContent>
                      <TabsContent value="media">
                        <MemoMediaLibrary onClose={handleMediaLibClose} isEmbedded={true} />
                      </TabsContent>
                      <TabsContent value="files">
                        <div className="tw-h-full">
                          <FileBrowser />
                        </div>
                      </TabsContent>
                      <TabsContent value="midi">
                        <div className="midi-tab">
                          <MIDIMapper />
                        </div>
                      </TabsContent>
                      <TabsContent value="lfo">
                        <div className="lfo-tab">
                          <LFOMapper 
                            selectedLayer={effectiveSelectedLayer || selectedLayer}
                            onUpdateLayer={handleUpdateSelectedLayer}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </ScrollArea.Viewport>
                  <ScrollArea.Scrollbar
                    className="tw-z-10 tw-flex tw-w-2 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out tw-data-[orientation=vertical]:tw-w-2.5 tw-data-[orientation=horizontal]:tw-flex-col tw-data-[orientation=horizontal]:tw-h-2.5"
                    orientation="vertical"
                  >
                    <ScrollArea.Thumb className="tw-flex-1 tw-bg-neutral-500 tw-rounded-[10px] tw-relative tw-cursor-pointer hover:tw-bg-neutral-400" />
                  </ScrollArea.Scrollbar>
                </ScrollArea.Root>
                {/* Keep LFO engine mounted so Random/LFO continue across app tab switches */}
                <div style={{ display: 'none' }} aria-hidden>
                  <LFOMapper selectedLayer={effectiveSelectedLayer || selectedLayer} onUpdateLayer={handleUpdateSelectedLayer} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Context Menu for Column Clips */}
        {contextMenu.visible && (
          <div
            className="context-menu tw-fixed tw-z-[10000]"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 150), top: Math.min(contextMenu.y, window.innerHeight - 60) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tw-min-w-[160px] tw-overflow-hidden tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-lg">
            {/* Clip options for layers */}
            {contextMenu.layerId && !contextMenu.layerId.startsWith('empty-') && (
              <>
                <div className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5" onClick={handleCopyClip}>Copy Clip</div>
              </>
            )}
            
            {/* Clip paste option - show if we have a clip in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'clip' && (
              <div
                className="context-menu-item tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                onClick={handlePasteClip}
              >
                  Paste Clip
              </div>
            )}
            
            {/* Column options - always show */}
            <div className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5" onClick={handleCopyColumn}>Copy Column</div>
            
            <div className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + ((clipboard && clipboard.type === 'column') ? 'tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700' : 'tw-cursor-default tw-text-neutral-500 tw-opacity-50')} onClick={clipboard && clipboard.type === 'column' ? handlePasteColumn : undefined}>Paste Column</div>
            
            {/* Delete option - show different text based on context */}
            <div className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-py-3 tw-px-5" onClick={handleDeleteLayer}>{contextMenu.layerId && !String(contextMenu.layerId).startsWith('empty-') ? 'Delete Clip' : 'Delete Column'}</div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('❌ Error rendering LayerManager:', error);
    return (
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col tw-overflow-hidden tw-pt-4">
        <div className="tw-flex tw-flex-col tw-h-full tw-overflow-hidden">
          <div className="tw-flex tw-items-center tw-justify-between tw-min-h-8 tw-px-4 tw-py-1 tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
            <h2>Error Loading Layer Manager</h2>
            <p>Could not load the layer manager content.</p>
            <button onClick={onClose} className="close-btn">Close</button>
          </div>
        </div>

        {/* Context Menu for Column Clips */}
        {(() => {
          console.log('🖱️ Rendering context menu:', contextMenu);
          return null;
        })()}
        {contextMenu.visible && (
          <div
            className="context-menu tw-fixed tw-z-[10000] tw-bg-neutral-800 tw-border-2 tw-border-neutral-600 tw-rounded tw-py-2 tw-min-w-[140px] tw-shadow-2xl"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 150), // Ensure it doesn't go off-screen
              top: Math.min(contextMenu.y, window.innerHeight - 60)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cell-specific options - only show if we have a layer selected (not empty cells) */}
            {contextMenu.layerId && !contextMenu.layerId.startsWith('empty-') && (
              <>
                <div
                  className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                  onClick={handleCopyCell}
                >
                  📋 Copy Cell
                </div>
                
                <div
                  className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + ((clipboard && clipboard.type === 'cell') ? 'tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700' : 'tw-cursor-default tw-text-neutral-500 tw-opacity-50')}
                  onClick={clipboard && clipboard.type === 'cell' ? handlePasteCell : undefined}
                >
                  📋 Paste Cell
                </div>

                {/* Clip options - for actual media/effects */}
                <div
                  className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                  onClick={handleCopyClip}
                >
                  📋 Copy Clip
                </div>
                
                <div
                  className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + ((clipboard && clipboard.type === 'clip') ? 'tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700' : 'tw-cursor-default tw-text-neutral-500 tw-opacity-50')}
                  onClick={clipboard && clipboard.type === 'clip' ? handlePasteClip : undefined}
                >
                  📋 Paste Clip
                </div>
              </>
            )}
            
            {/* Cell paste option - show if we have a cell in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'cell' && (
              <div
                className="context-menu-item"
                style={{
                  padding: '12px 20px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  borderBottom: '1px solid #444',
                  userSelect: 'none'
                }}
                onClick={handlePasteCell}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 Paste Cell
              </div>
            )}

            {/* Clip paste option - show if we have a clip in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'clip' && (
              <div
                className="context-menu-item"
                style={{
                  padding: '12px 20px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  borderBottom: '1px solid #444',
                  userSelect: 'none'
                }}
                onClick={handlePasteClip}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 Paste Clip
              </div>
            )}
            
            {/* Column options - always show */}
            <div
              className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
              onClick={handleCopyColumn}
            >
              📋 Copy Column
            </div>
            
            <div
              className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + ((clipboard && clipboard.type === 'column') ? 'tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700' : 'tw-cursor-default tw-text-neutral-500 tw-opacity-50')}
              onClick={clipboard && clipboard.type === 'column' ? handlePasteColumn : undefined}
            >
              📋 Paste Column
            </div>
            
            {/* Delete option - show different text based on context */}
            <div className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-py-3 tw-px-5" onClick={handleDeleteLayer}>{contextMenu.layerId && !String(contextMenu.layerId).startsWith('empty-') ? 'Delete Clip' : 'Delete Column'}</div>
          </div>
        )}
      </div>
    );
  }
};
