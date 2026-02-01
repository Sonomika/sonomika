import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasStreamManager } from '../utils/CanvasStream';
import { useStore } from '../store/store';
import { useVideoOptionsStore } from '../store/videoOptionsStore';
import { LayerOptions } from './LayerOptions';
import { CanvasRenderer } from './CanvasRenderer';
import { ColumnPreview } from './ColumnPreview';
// import { MediaBrowser } from './MediaBrowser';
import { MediaLibrary } from './MediaLibrary';
import { Timeline } from './Timeline';
import TimelineComposer from './TimelineComposer';
import { getClock } from '../engine/Clock';
import { v4 as uuidv4 } from 'uuid';
import { getAssetPath, createColumn, handleDragOver, handleDragLeave, handleLayerClick } from '../utils/LayerManagerUtils';
import { handleDrop, handleLayerReorderDragStart, handleLayerReorderDragOver, handleLayerReorderDrop } from '../utils/DragDropHandlers';
import { handleColumnPlay, handleUpdateLayer } from '../utils/LayerManagementHandlers';
import { handleSceneRename } from '../utils/SceneManagementHandlers';
import EffectsBrowser from './EffectsBrowser';
import { MIDIMapper } from './MIDIMapper';
import { LFOMapper } from './LFOMapper';
import { Button } from './ui';
import AIEffectsLab from './AIEffectsLab';
import { useFocusMode } from '../hooks/useFocusMode';
// Scenes header now uses ContextMenu for actions
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from './ui/ContextMenu';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { ScrollArea as AppScrollArea } from './ui';
import { Tabs, TabsList, TabsTrigger, TabsContent, Dialog, DialogContent, DialogHeader, DialogTitle } from './ui';
import { GlobalEffectsTab } from './GlobalEffectsTab';
import SequenceTab from './SequenceTab';
import { EnterFullScreenIcon, HamburgerMenuIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, PauseIcon, StopIcon, GlobeIcon } from '@radix-ui/react-icons';
import TimelineControls from './TimelineControls';
import FileBrowser from './FileBrowser';
import { debounce } from '../utils/debounce';
import { Equirectangular360Preview, isEquirectangularAspectRatio } from './Equirectangular360Preview';


interface LayerManagerProps {
  onClose: () => void;
  debugMode?: boolean;
}

// Memoized at module scope to preserve component identity across renders
const MemoMediaLibrary = React.memo(MediaLibrary);

// Component to render video thumbnails that never play
const VideoThumbnailPreview: React.FC<{ src: string; assetName: string }> = React.memo(({ src, assetName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Ensure video never plays - pause immediately on any play attempt
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Pause on mount
    video.pause();

    // Prevent play attempts
    const handlePlay = (e: Event) => {
      e.preventDefault();
      video.pause();
    };

    const handlePlaying = () => {
      video.pause();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlaying);

    // Also pause periodically to catch any edge cases
    const intervalId = setInterval(() => {
      if (video && !video.paused) {
        video.pause();
      }
    }, 100);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('playing', handlePlaying);
      clearInterval(intervalId);
      video.pause();
    };
  }, []);

  // Load first frame for preview when metadata is available
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      // Seek to first frame to show preview
      video.currentTime = 0;
      // Ensure it's paused
      video.pause();
    }
  };

  const handleLoadedData = () => {
    const video = videoRef.current;
    if (video) {
      // Ensure paused and at first frame
      video.currentTime = 0;
      video.pause();
    }
  };

  return (
    <div className="tw-w-full tw-aspect-video tw-rounded tw-overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        draggable={false}
        className="tw-w-full tw-h-full tw-object-cover"
        muted
        preload="metadata"
        playsInline
        onLoadStart={() => console.log('Layer video loading:', assetName)}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedData}
        onError={(e) => console.error('Layer video error:', assetName, e)}
        onPlay={(e) => {
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.pause();
          }
        }}
      />
    </div>
  );
});

VideoThumbnailPreview.displayName = 'VideoThumbnailPreview';

export const LayerManager: React.FC<LayerManagerProps> = ({ onClose, debugMode = false }) => {
  // console.log('LayerManager component rendering');
  
  const { scenes, currentSceneId, timelineScenes, currentTimelineSceneId, setCurrentScene, addScene, removeScene, updateScene, duplicateScene, reorderScenes, setCurrentTimelineScene, addTimelineScene, removeTimelineScene, updateTimelineScene, duplicateTimelineScene, reorderTimelineScenes, compositionSettings, bpm, setBpm, playingColumnId, isGlobalPlaying, playColumn, stopColumn, globalPlay, globalPause, globalStop, selectedTimelineClip, setSelectedTimelineClip, selectedLayerId: persistedSelectedLayerId, setSelectedLayer: setSelectedLayerId, activeLayerOverrides, showTimeline, setShowTimeline, columnCrossfadeEnabled, setColumnCrossfadeEnabled, columnCrossfadeDuration, setColumnCrossfadeDuration, cellCrossfadeEnabled } = useStore() as any;

  // Track transport state to style Play/Pause/Stop buttons with accent for the active control.
  // Derive from store so refresh/rehydrate reliably shows Stop when fully stopped.
  const derivedTransportState: 'play' | 'pause' | 'stop' = isGlobalPlaying
    ? 'play'
    : (playingColumnId ? 'pause' : 'stop');
  const [transportState, setTransportState] = useState<'play' | 'pause' | 'stop'>(derivedTransportState);
  useEffect(() => {
    if (!showTimeline) setTransportState(derivedTransportState);
  }, [derivedTransportState, showTimeline]);
  useEffect(() => {
    const onPlay = () => setTransportState('play');
    const onPause = () => setTransportState('pause');
    const onStop = () => setTransportState('stop');
    document.addEventListener('globalPlay', onPlay as any);
    document.addEventListener('globalPause', onPause as any);
    document.addEventListener('globalStop', onStop as any);
    return () => {
      document.removeEventListener('globalPlay', onPlay as any);
      document.removeEventListener('globalPause', onPause as any);
      document.removeEventListener('globalStop', onStop as any);
    };
  }, []);
  
  // Video options store
  const getVideoOptionsForLayer = useVideoOptionsStore((state) => state.getVideoOptionsForLayer);
  const ensureVideoOptionsForLayer = useVideoOptionsStore((state) => state.ensureVideoOptionsForLayer);
  
  
  // Debug logging for playingColumnId
  useEffect(() => {
    console.log('🎵 LayerManager playingColumnId changed:', playingColumnId);
  }, [playingColumnId]);

  // Global focus mode: auto-select layer at specified row when column/clip changes
  // This runs globally even when MIDI tab is not active
  useFocusMode();
  const [bpmInputValue, setBpmInputValue] = useState(bpm.toString());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(false);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState<number>(96);
  const [gridHasOverflowX, setGridHasOverflowX] = useState<boolean>(false);
  const [gridHasOverflowY, setGridHasOverflowY] = useState<boolean>(false);
  // Ensure consistent cell height across all layer cells, even when empty
  const CELL_HEIGHT_PX = 80;
  
  // Sync local BPM input with store BPM
  useEffect(() => {
    setBpmInputValue(bpm.toString());
  }, [bpm]);
  
  // Keep central Clock BPM in sync with store BPM
  useEffect(() => {
    try { getClock().setBpm(bpm); } catch {}
  }, [bpm]);

  // Subscribe to Clock beat ticks to trigger a short pulse animation
  useEffect(() => {
    const clock = getClock();
    const onBeat = (_beatInBar: number) => {
      setIsBeatPulse(true);
      if (beatPulseTimeoutRef.current != null) {
        clearTimeout(beatPulseTimeoutRef.current);
      }
      const clamped = Math.max(30, Math.min(300, Number(clock.smoothedBpm || clock.bpm || 120)));
      const beatMs = (60 / clamped) * 1000;
      const duration = Math.max(80, Math.min(200, beatMs * 0.15));
      beatPulseTimeoutRef.current = window.setTimeout(() => setIsBeatPulse(false), duration);
    };
    try { clock.onNewBeatListener(onBeat); } catch {}
    return () => {
      try { clock.onNewBeatListener(undefined); } catch {}
      if (beatPulseTimeoutRef.current != null) clearTimeout(beatPulseTimeoutRef.current);
    };
  }, []);

  // Listen for mirror window close events to sync state
  useEffect(() => {
    if (window.electron) {
      const handleMirrorWindowClosed = () => {
        console.log('LayerManager: Mirror window closed event received, updating state');
        setIsPreviewMirrorOpen(false);
        // Clean up stream manager
        if (mirrorStreamRef.current) {
          mirrorStreamRef.current.closeMirrorWindow();
          mirrorStreamRef.current = null;
        }
      };
      
      window.electron.onMirrorWindowClosed(handleMirrorWindowClosed);
      
      // Cleanup listener on unmount
      return () => {
        if (window.electron) {
          // Note: There's no removeListener method in the current preload API
          // The listener will be cleaned up when the component unmounts
        }
      };
    }
  }, []);

  // Keep a fixed per-column width across all breakpoints (desktop-sized columns)
  useEffect(() => {
    const el = gridWrapperRef.current;
    if (!el) return;
    const compute = () => {
      try {
        const next = 96;
        setColumnWidth(next);
        // Update overflow states
        try {
          setGridHasOverflowX(el.scrollWidth - el.clientWidth > 1);
          setGridHasOverflowY(el.scrollHeight - el.clientHeight > 1);
        } catch {}
      } catch {}
    };
    compute();
    const ro = new ResizeObserver(debounce(() => compute(), 200));
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
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [, setRefreshTrigger] = useState(0);
  const [isBeatPulse, setIsBeatPulse] = useState(false);
  const beatPulseTimeoutRef = React.useRef<number | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewHeaderRef = useRef<HTMLDivElement | null>(null);
  const prevShowTimelineRef = useRef<boolean>(Boolean(showTimeline));
  const timelineStopOnFirstUpdateRef = useRef<boolean>(Boolean(showTimeline));
  const timelineAllowPlayRef = useRef<boolean>(false);
  
  // Crossfade state management
  const [previousPreviewContent, setPreviousPreviewContent] = useState<any>(null);
  const [crossfadeProgress, setCrossfadeProgress] = useState<number>(1); // 0 = old visible, 1 = new visible
  const [isCrossfading, setIsCrossfading] = useState<boolean>(false);
  const [showPreviousContent, setShowPreviousContent] = useState<boolean>(false); // Extended visibility for smooth cleanup
  const crossfadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cancelCrossfadeRef = useRef<(() => void) | null>(null); // Function to cancel active animation
  // Track last override map so we can crossfade row-override ("cell") changes
  const lastOverridesRef = useRef<Record<number, string>>((activeLayerOverrides || {}) as any);
  
  // Handle crossfade transitions when previewContent changes
  useEffect(() => {
    // Skip if no content change
    if (!previewContent || previewContent === previousPreviewContent) {
      console.log('🎨 Crossfade check: no content change', { previewContent, previousPreviewContent });
      return;
    }
    
    // Check if we should crossfade for this transition
    const isColumnSwitch =
      columnCrossfadeEnabled &&
      !showTimeline &&
      previewContent?.type === 'column' &&
      previousPreviewContent?.type === 'column' &&
      previewContent?.columnId !== previousPreviewContent?.columnId;
    const isCellOverrideSwitch =
      cellCrossfadeEnabled &&
      !showTimeline &&
      previewContent?.type === 'column' &&
      previousPreviewContent?.type === 'column' &&
      previewContent?.columnId === previousPreviewContent?.columnId &&
      Boolean((previewContent as any)?.overrideVersion) &&
      (previewContent as any)?.overrideVersion !== (previousPreviewContent as any)?.overrideVersion;
    const shouldCrossfade = isColumnSwitch || isCellOverrideSwitch;
    
    console.log('🎨 Crossfade check:', { 
      shouldCrossfade,
      enabled: columnCrossfadeEnabled,
      isTimeline: showTimeline,
      prevType: previousPreviewContent?.type,
      newType: previewContent?.type,
      prevId: previousPreviewContent?.columnId,
      newId: previewContent?.columnId
    });
    
    if (shouldCrossfade) {
      console.log('✅ Starting crossfade transition', { from: previousPreviewContent?.columnId, to: previewContent?.columnId });
      
      // Cancel any active crossfade animation
      if (cancelCrossfadeRef.current) {
        console.log('⚡ Canceling previous crossfade to start new one');
        cancelCrossfadeRef.current();
        cancelCrossfadeRef.current = null;
      }
      
      // Clear any existing crossfade timeout
      if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
        crossfadeTimeoutRef.current = null;
      }
      
      // When switching rapidly, use the CURRENT displayed content as the "old" content
      // This makes the transition smooth even if interrupted mid-fade
      const effectivePreviousContent = isCrossfading ? previewContent : previousPreviewContent;
      const effectiveStartProgress = isCrossfading ? crossfadeProgress : 0;
      
      // Capture the target content at start of animation to avoid race conditions
      const targetContent = previewContent;
      
      // If we're interrupting a crossfade, immediately update previousContent
      if (isCrossfading) {
        setPreviousPreviewContent(effectivePreviousContent);
      }
      
      // Start new crossfade
      setIsCrossfading(true);
      setShowPreviousContent(true);
      
      // Start with both visible (or continue from where we left off if interrupted)
      const startProgress = Math.max(0.05, effectiveStartProgress);
      setCrossfadeProgress(startProgress);
      
      // Animate crossfade using configured duration (linear)
      const duration = columnCrossfadeDuration || 400;
      const startTime = Date.now();
      const prerollDelay = 50; // Give new content 50ms to initialize
      
      let cancelled = false;
      
      // Store cancel function
      cancelCrossfadeRef.current = () => {
        cancelled = true;
        console.log('🛑 Crossfade cancelled');
      };
      
      const animate = () => {
        if (cancelled) return; // Stop animation if cancelled
        
        const elapsed = Date.now() - startTime;
        // Don't start actual fade until after preroll delay
        const fadeElapsed = Math.max(0, elapsed - prerollDelay);
        const progress = Math.min(1, fadeElapsed / duration);
        
        // Linear progress from startProgress to 1.0
        const progressRange = 1.0 - startProgress;
        const mappedProgress = startProgress + (progress * progressRange);
        setCrossfadeProgress(mappedProgress);
        
        if (progress < 1 && !cancelled) {
          requestAnimationFrame(animate);
        } else if (!cancelled) {
          // Ensure we're at exactly 1.0 for final frame
          setCrossfadeProgress(1);
          
          // Wait one more frame before updating state
          requestAnimationFrame(() => {
            if (cancelled) return;
            console.log('✅ Crossfade complete, updating previous content to:', targetContent?.columnId);
            // Mark crossfade as complete
            setIsCrossfading(false);
            cancelCrossfadeRef.current = null;
            // Update previous content to the captured target (ready for next crossfade)
            setPreviousPreviewContent(targetContent);
          });
        }
      };
      
      requestAnimationFrame(animate);
    } else {
      // No crossfade - just update previous content immediately for next potential transition
      console.log('⏭️ No crossfade, updating previous content to:', previewContent?.columnId);
      setPreviousPreviewContent(previewContent);
      setCrossfadeProgress(1);
      setIsCrossfading(false);
      setShowPreviousContent(false);
    }
  }, [previewContent, columnCrossfadeEnabled, cellCrossfadeEnabled, showTimeline, columnCrossfadeDuration]);

  // Crossfade when selecting cells in other columns (row override changes).
  // This preserves the ability to select any cell, but fades the preview between the old and new override state.
  useEffect(() => {
    const nextOverrides = (activeLayerOverrides || {}) as Record<number, string>;
    const prevOverrides = (lastOverridesRef.current || {}) as Record<number, string>;
    // Always keep ref updated
    lastOverridesRef.current = nextOverrides;

    if (showTimeline) return;
    if (!cellCrossfadeEnabled) return;
    if (!previewContent || previewContent.type !== 'column') return;

    // Only crossfade when overrides actually changed
    const prevJson = JSON.stringify(prevOverrides || {});
    const nextJson = JSON.stringify(nextOverrides || {});
    if (prevJson === nextJson) return;

    // Snapshot current preview into "previous" slot with the old override map
    const prevSnapshot = { ...(previewContent as any), overrideMap: prevOverrides, overrideVersion: (previewContent as any).overrideVersion || 0 };
    setPreviousPreviewContent(prevSnapshot);

    // Update previewContent to include the new override map and a monotonically increasing version
    setPreviewContent((cur: any) => {
      if (!cur || cur.type !== 'column') return cur;
      return { ...cur, overrideMap: nextOverrides, overrideVersion: Date.now() };
    });
  }, [activeLayerOverrides, cellCrossfadeEnabled, showTimeline, previewContent]);

  // Always default to STOP when switching between column and timeline modes.
  useEffect(() => {
    if (prevShowTimelineRef.current === Boolean(showTimeline)) return;
    prevShowTimelineRef.current = Boolean(showTimeline);
    try { setIsPlaying(false); } catch {}
    try { globalStop({ source: 'mode-switch', force: true } as any); } catch {}
    try { stopColumn(); } catch {}
    try { setPreviewContent(null); } catch {}
    try { timelineStopOnFirstUpdateRef.current = true; } catch {}
    try { timelineAllowPlayRef.current = false; } catch {}
  }, [showTimeline, globalStop, stopColumn]);

  useEffect(() => {
    const onTimelinePlay = () => { timelineAllowPlayRef.current = true; };
    const onTimelineStop = () => {
      timelineAllowPlayRef.current = false;
      try { setIsPlaying(false); } catch {}
      try {
        setPreviewContent((prev: any) => (prev && prev.type === 'timeline' ? { ...prev, isPlaying: false } : prev));
      } catch {}
    };
    try { document.addEventListener('timelinePlay', onTimelinePlay as any); } catch {}
    try { document.addEventListener('timelineStop', onTimelineStop as any); } catch {}
    return () => {
      try { document.removeEventListener('timelinePlay', onTimelinePlay as any); } catch {}
      try { document.removeEventListener('timelineStop', onTimelineStop as any); } catch {}
    };
  }, []);

  const pushDebug = (msg: string) => {
    try {
      setDebugLines((prev) => {
        const next = [...prev, msg];
        return next.length > 8 ? next.slice(next.length - 8) : next;
      });
    } catch {}
  };

  useEffect(() => {
    const onDebug = (evt: any) => {
      const msg = evt?.detail?.msg;
      if (!msg) return;
      pushDebug(String(msg));
    };
    try { window.addEventListener('vjDebug', onDebug as any); } catch {}
    return () => {
      try { window.removeEventListener('vjDebug', onDebug as any); } catch {}
    };
  }, []);

  const resumeAllVideos = () => {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach((video) => {
        try {
          const p = (video as HTMLVideoElement).play();
          if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {});
        } catch {}
      });
    } catch {}
  };

  // Sync local column-mode playing state with global transport
  useEffect(() => {
    const onPlay = () => { if (!showTimeline) setIsPlaying(true); };
    const onPause = () => { if (!showTimeline) setIsPlaying(false); };
    const onStop = () => { if (!showTimeline) setIsPlaying(false); };
    document.addEventListener('globalPlay', onPlay as any);
    document.addEventListener('globalPause', onPause as any);
    document.addEventListener('globalStop', onStop as any);
    return () => {
      document.removeEventListener('globalPlay', onPlay as any);
      document.removeEventListener('globalPause', onPause as any);
      document.removeEventListener('globalStop', onStop as any);
    };
  }, [showTimeline]);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const mirrorStreamRef = useRef<CanvasStreamManager | null>(null);
  const [isPreviewMirrorOpen, setIsPreviewMirrorOpen] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [fsFallbackActive, setFsFallbackActive] = useState(false);
  // 360 preview mode for equirectangular compositions
  const [is360PreviewMode, setIs360PreviewMode] = useState(false);
  const [sphereSourceCanvas, setSphereSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  // In 360 mode, the sphere can only consume a SINGLE canvas. During column crossfades the flat preview
  // is a DOM blend of two canvases, so we composite them into one canvas for the sphere.
  const sphereCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sphereCompositeRafRef = useRef<number | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewWrapperRef = useRef<HTMLDivElement | null>(null);
  const isEquirectangular = isEquirectangularAspectRatio(
    compositionSettings?.width || 1920, 
    compositionSettings?.height || 1080
  );
  
  // Composite the "current" + "previous" preview canvases into one source canvas for the 360 sphere.
  // Without this, 360 mode will show hard cuts because it can only sample one canvas element.
  useEffect(() => {
    if (!is360PreviewMode || !isEquirectangular) {
      if (sphereCompositeRafRef.current != null) {
        try { cancelAnimationFrame(sphereCompositeRafRef.current); } catch {}
        sphereCompositeRafRef.current = null;
      }
      return;
    }

    // Ensure composite canvas exists and matches composition size initially.
    const compW = Math.max(1, Number(compositionSettings?.width) || 1920);
    const compH = Math.max(1, Number(compositionSettings?.height) || 1080);
    if (!sphereCompositeCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = compW;
      c.height = compH;
      try { c.dataset.vj360Composite = 'true'; } catch {}
      sphereCompositeCanvasRef.current = c;
    } else {
      const c = sphereCompositeCanvasRef.current;
      if (c.width !== compW || c.height !== compH) {
        c.width = compW;
        c.height = compH;
      }
    }

    const composite = sphereCompositeCanvasRef.current!;
    // Ensure 360 preview uses the composite canvas as its source.
    setSphereSourceCanvas((prev) => (prev === composite ? prev : composite));

    const ctx = composite.getContext('2d', { alpha: false });
    if (!ctx) return;

    let stopped = false;
    const tick = () => {
      if (stopped) return;

      // Find the two canvases we render for crossfade. These wrappers are always present.
      const container = previewContainerRef.current;
      const currentCanvas = (container?.querySelector('[data-preview-slot="current"] canvas') as HTMLCanvasElement | null) || null;
      const previousCanvas = (container?.querySelector('[data-preview-slot="previous"] canvas') as HTMLCanvasElement | null) || null;

      // Prefer matching the actual WebGL internal buffer size (not CSS size).
      const w = Math.max(1, Number(currentCanvas?.width || composite.width || compW));
      const h = Math.max(1, Number(currentCanvas?.height || composite.height || compH));
      if (composite.width !== w || composite.height !== h) {
        composite.width = w;
        composite.height = h;
      }

      const bg = (compositionSettings?.backgroundColor || '#000000');
      const isActivelyCrossfading = Boolean((isCrossfading || showPreviousContent) && previousPreviewContent);
      const newA = Math.max(0, Math.min(1, Number(isActivelyCrossfading ? crossfadeProgress : 1)));
      const oldA = Math.max(0, Math.min(1, 1 - newA));

      try {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        if (currentCanvas) {
          if (isActivelyCrossfading && previousCanvas && oldA > 0.0001) {
            ctx.globalAlpha = oldA;
            ctx.drawImage(previousCanvas, 0, 0, w, h);
            ctx.globalAlpha = newA;
            ctx.drawImage(currentCanvas, 0, 0, w, h);
          } else {
            ctx.globalAlpha = 1;
            ctx.drawImage(currentCanvas, 0, 0, w, h);
          }
        }
      } catch {
        // ignore draw errors; next frame may succeed
      } finally {
        try { ctx.restore(); } catch {}
      }

      // Signal the 360 sphere to refresh its CanvasTexture even if playback is stopped.
      try { composite.dataset.needsUpdate = 'true'; } catch {}

      sphereCompositeRafRef.current = requestAnimationFrame(tick);
    };

    // Start loop (cancel any previous one first)
    if (sphereCompositeRafRef.current != null) {
      try { cancelAnimationFrame(sphereCompositeRafRef.current); } catch {}
      sphereCompositeRafRef.current = null;
    }
    sphereCompositeRafRef.current = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      if (sphereCompositeRafRef.current != null) {
        try { cancelAnimationFrame(sphereCompositeRafRef.current); } catch {}
        sphereCompositeRafRef.current = null;
      }
    };
  }, [
    is360PreviewMode,
    isEquirectangular,
    compositionSettings?.width,
    compositionSettings?.height,
    compositionSettings?.backgroundColor,
    isCrossfading,
    showPreviousContent,
    previousPreviewContent,
    crossfadeProgress,
  ]);

  // Effect to capture the R3F canvas element when 360 mode is activated
  // Also re-capture when fullscreen changes as canvas may be recreated
  useEffect(() => {
    if (!is360PreviewMode || !isEquirectangular) {
      setSphereSourceCanvas(null);
      return;
    }
    
    // Find the canvas in the preview container
    const findCanvas = () => {
      const container = previewContainerRef.current;
      if (!container) return;
      // Find the first canvas that's not part of the 360 preview itself
      const canvases = container.querySelectorAll('canvas');
      let targetCanvas: HTMLCanvasElement | null = null;
      for (const canvas of canvases) {
        // Skip if this canvas is inside the 360 preview (it's the output canvas)
        const isIn360Preview = canvas.closest('[data-360-preview]');
        if (!isIn360Preview && canvas.width > 0 && canvas.height > 0) {
          targetCanvas = canvas;
          break;
        }
      }
      if (targetCanvas) {
        previewCanvasRef.current = targetCanvas;
        // In 360 mode we prefer the composite canvas as the sphere source (see effect above).
        // Still track the real preview canvas for other consumers (mirroring, etc).
        if (!sphereCompositeCanvasRef.current) {
          // Only update state if the canvas actually changed
          setSphereSourceCanvas(prev => prev === targetCanvas ? prev : targetCanvas);
        }
      }
      // NOTE: Don't clear canvas if not found - keep the old reference during transitions
    };
    
    // Initial search with small delay to let canvas render
    const initialTimeout = setTimeout(findCanvas, 50);
    
    // Use MutationObserver to detect when canvas is added (no attributes to reduce overhead)
    const observer = new MutationObserver(() => {
      findCanvas();
    });
    
    if (previewContainerRef.current) {
      observer.observe(previewContainerRef.current, { childList: true, subtree: true });
    }
    
    // Poll less frequently to reduce overhead (500ms is enough)
    const pollInterval = setInterval(findCanvas, 500);
    
    // Also listen for resize events which happen during fullscreen
    const handleResize = () => {
      setTimeout(findCanvas, 100);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(pollInterval);
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [is360PreviewMode, isEquirectangular, isPreviewFullscreen, fsFallbackActive]);
  
  // Reset 360 mode when composition changes to non-equirectangular
  useEffect(() => {
    if (!isEquirectangular && is360PreviewMode) {
      setIs360PreviewMode(false);
    }
  }, [isEquirectangular, is360PreviewMode]);

  // Helper functions to get current scene and management functions based on mode
  const getCurrentScene = () => {
    return showTimeline 
      ? timelineScenes.find((s: any) => s.id === currentTimelineSceneId)
      : scenes.find((s: any) => s.id === currentSceneId);
  };

  const getCurrentSceneId = () => {
    return showTimeline ? currentTimelineSceneId : currentSceneId;
  };

  // When switching scenes in column mode, update preview.
  // Only auto-play when the global transport is in Play; on refresh/reload we should start stopped.
  useEffect(() => {
    try {
      const cameFromTimeline = Boolean(prevShowTimelineRef.current) && !showTimeline;
      prevShowTimelineRef.current = Boolean(showTimeline);

      if (showTimeline) return; // only for column mode
      // If the user is stopped, do NOT auto-resume when switching from timeline back to columns
      if (cameFromTimeline && !isGlobalPlaying) return;
      const sc = scenes.find((s: any) => s.id === currentSceneId);
      if (!sc) return;
      // Find a sensible column to play: current playing one if it exists in the new scene, otherwise first with clips
      let targetColumnId: string | null = null;
      const playingStillExists = sc.columns?.some((c: any) => c?.id === playingColumnId);
      if (playingStillExists && playingColumnId) {
        targetColumnId = playingColumnId;
      } else {
        const firstWithClips = (sc.columns || []).find((c: any) => (c.layers || []).some((l: any) => !!l?.asset));
        targetColumnId = firstWithClips?.id || null;
      }

      // If nothing to play, clear preview and stop
      if (!targetColumnId) {
        setPreviewContent({ type: 'scene', sceneId: sc.id, isEmpty: true } as any);
        setIsPlaying(false);
        try { stopColumn(); } catch {}
        try { (useStore as any).getState?.().clearActiveLayerOverrides?.(); } catch {}
        return;
      }

      // If transport is stopped, do NOT auto-start playback (important for refresh/reload).
      // Still update the preview to a sensible column.
      if (!isGlobalPlaying) {
        try {
          const column = sc?.columns?.find((c: any) => c?.id === targetColumnId) || null;
          const layersWithContent = (column?.layers || []).filter((l: any) => !!l?.asset);
          setPreviewContent({
            type: 'column',
            columnId: targetColumnId,
            column,
            layers: layersWithContent,
            isEmpty: layersWithContent.length === 0
          });
        } catch {}
        setIsPlaying(false);
        // Stop any lingering playback marker if present
        if (playingColumnId) {
          try { stopColumn(); } catch {}
        }
        try { (useStore as any).getState?.().clearActiveLayerOverrides?.(); } catch {}
        return;
      }

      // Reset state to avoid stale playing references across scenes
      try { (useStore as any).getState?.().setPlayingColumn?.(null); } catch {}
      try { (useStore as any).getState?.().clearActiveLayerOverrides?.(); } catch {}

      // Update preview and trigger play for the chosen column (with retry to avoid race)
      try {
        handleColumnPlay(targetColumnId, sc, setPreviewContent, setIsPlaying, playColumn);
        // Retry once on the next frame in case effects mount after first call
        requestAnimationFrame(() => {
          try { handleColumnPlay(targetColumnId as string, sc, setPreviewContent, setIsPlaying, playColumn); } catch {}
        });
      } catch {}
    } catch {}
  }, [currentSceneId, showTimeline]);

  const getScenes = () => {
    return showTimeline ? timelineScenes : scenes;
  };

  const getSceneManagementFunctions = () => {
    return showTimeline ? {
      setCurrentScene: setCurrentTimelineScene,
      addScene: addTimelineScene,
      removeScene: removeTimelineScene,
      updateScene: updateTimelineScene,
      duplicateScene: duplicateTimelineScene,
      reorderScenes: reorderTimelineScenes,
    } : {
      setCurrentScene,
      addScene,
      removeScene,
      updateScene,
      duplicateScene,
      reorderScenes,
    };
  };
  const [showMediaLibrary, setShowMediaLibrary] = useState<string | false>(false);
  const [middlePanelTab, setMiddlePanelTab] = useState<'global' | 'layer' | 'sequence'>(() => {
    try {
      const saved = localStorage.getItem('vj-ui-middle-tab');
      return (saved === 'global' || saved === 'layer' || saved === 'sequence') ? (saved as any) : 'layer';
    } catch { return 'layer'; }
  });
  // Hide Sequence tab in timeline mode by forcing a safe tab selection
  useEffect(() => {
    if (showTimeline && middlePanelTab === 'sequence') {
      setMiddlePanelTab('layer');
      try { localStorage.setItem('vj-ui-middle-tab', 'layer'); } catch {}
    }
  }, [showTimeline, middlePanelTab]);
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
  // Number of visible layer rows in the grid (top-to-bottom). Persisted per scene. Clamp 3..6.
  const [numRows, setNumRows] = useState<number>(() => {
    try {
      const sc = (useStore as any).getState?.().scenes?.find((s: any) => s.id === currentSceneId);
      const initial = Number(sc?.numRows ?? 3);
      return Math.min(6, Math.max(3, initial));
    } catch { return 3; }
  });

  // Keep scene.numRows in sync when numRows changes
  useEffect(() => {
    try {
      if (!getCurrentSceneId()) return;
      const sc = getCurrentScene();
      if (!sc) return;
      const clamped = Math.min(6, Math.max(3, numRows));
      if (sc.numRows !== clamped) {
        const { updateScene: updateSceneFn } = getSceneManagementFunctions();
        updateSceneFn(getCurrentSceneId(), { numRows: clamped });
      }
    } catch {}
  }, [numRows, getCurrentSceneId, getCurrentScene, getSceneManagementFunctions]);

  // When scene changes, load its persisted numRows
  useEffect(() => {
    try {
      const sc = getCurrentScene();
      if (sc && typeof sc.numRows === 'number') {
        setNumRows(Math.min(6, Math.max(3, sc.numRows)));
      } else {
        setNumRows(3);
      }
    } catch {}
  }, [currentSceneId]);

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
    if (!previewContent) {
      setPreviewContent(null);
      setIsPlaying(false);
      return;
    }

    // In timeline mode, default to STOP on refresh/initial load unless global play is active.
    // Allow play updates from the timeline itself.
    if (showTimeline && !timelineAllowPlayRef.current) {
      setPreviewContent({
        ...previewContent,
        isPlaying: false
      });
      setIsPlaying(false);
      timelineStopOnFirstUpdateRef.current = false;
      return;
    }

    setPreviewContent(previewContent);

    // Update isPlaying state based on previewContent.isPlaying
    if (previewContent && typeof previewContent.isPlaying === 'boolean') {
      setIsPlaying(previewContent.isPlaying);
    }
  }, [showTimeline, isGlobalPlaying]);

  // Clear timeline preview when switching to column mode
  useEffect(() => {
    if (!showTimeline) {
      // When switching to column mode, clear any lingering timeline preview
      console.log('🎭 Switched to column mode - clearing timeline preview');
      setPreviewContent(null);
      setIsPlaying(false);
    }
  }, [showTimeline]);

  console.log('LayerManager state - scenes:', scenes, 'currentSceneId:', currentSceneId);
  console.log('🎭 Preview state - previewContent:', previewContent, 'isPlaying:', isPlaying);



  const currentScene = getCurrentScene();
  console.log('Current scene:', currentScene);

  const handleLayerClickWrapper = (layer: any, columnId: string) => {
    // Clear any timeline selection when directly interacting with grid layers
    try { setSelectedTimelineClip(null); } catch {}
    // Persist selection in global store for refresh restore
    try { if (layer?.id) setSelectedLayerId(layer.id); } catch {}
    handleLayerClick(layer, columnId, setSelectedLayer, () => {});
  };

  // Function to move asset between columns on double-click
  const handleDoubleClickMove = (sourceLayer: any, sourceColumnId: string, targetColumnId: string, targetLayerNum: number) => {
    console.log('handleDoubleClickMove called with:', { sourceLayer, sourceColumnId, targetColumnId, targetLayerNum });
    try {
      if (!sourceLayer || !sourceLayer.asset) {
        console.log('No source layer or asset');
        return;
      }
      
      const currentScene = getCurrentScene();
      if (!currentScene) {
        console.log('No current scene found');
        return;
      }

      const sourceColumn = currentScene.columns.find((col: any) => col.id === sourceColumnId);
      const targetColumn = currentScene.columns.find((col: any) => col.id === targetColumnId);
      
      console.log('Source column:', sourceColumn);
      console.log('Target column:', targetColumn);
      
      if (!sourceColumn || !targetColumn) {
        console.log('Source or target column not found');
        return;
      }

      // Find the source layer index
      const sourceLayerIndex = sourceColumn.layers.findIndex((layer: any) => layer.id === sourceLayer.id);
      console.log('Source layer index:', sourceLayerIndex);
      if (sourceLayerIndex === -1) {
        console.log('Source layer not found in source column');
        return;
      }

      // Find the target layer index (or create a new layer if none exists)
      let targetLayerIndex = targetColumn.layers.findIndex((layer: any) => layer.layerNum === targetLayerNum);
      console.log('Target layer index:', targetLayerIndex);
      
      if (targetLayerIndex === -1) {
        // Create a new layer at the target position
        const newLayer = {
          ...sourceLayer,
          id: `layer-${targetColumnId}-${targetLayerNum}-${Date.now()}`,
          columnId: targetColumnId,
          layerNum: targetLayerNum
        };
        
        // Insert at the correct position based on layerNum
        const insertIndex = targetColumn.layers.filter((l: any) => l.layerNum < targetLayerNum).length;
        targetColumn.layers.splice(insertIndex, 0, newLayer);
        console.log('Created new layer at index:', insertIndex);
      } else {
        // Replace existing layer
        const newLayer = {
          ...sourceLayer,
          id: `layer-${targetColumnId}-${targetLayerNum}-${Date.now()}`,
          columnId: targetColumnId,
          layerNum: targetLayerNum
        };
        targetColumn.layers[targetLayerIndex] = newLayer;
        console.log('Replaced existing layer at index:', targetLayerIndex);
      }

      // Remove the source layer
      sourceColumn.layers.splice(sourceLayerIndex, 1);
      console.log('Removed source layer from index:', sourceLayerIndex);

      // Update the scene
      const { updateScene: updateSceneFn } = getSceneManagementFunctions();
      updateSceneFn(getCurrentSceneId(), currentScene);
      
      console.log(`Successfully moved asset from column ${sourceColumnId} to column ${targetColumnId} at layer ${targetLayerNum}`);
    } catch (error) {
      console.error('Error in handleDoubleClickMove:', error);
    }
  };

  // Hydrate local selectedLayer from persisted store selection when in column view
  useEffect(() => {
    if (showTimeline) return;
    if (!persistedSelectedLayerId) return;
    try {
      const scene = getCurrentScene();
      if (!scene) return;
      const allLayers = scene.columns.flatMap((c: any) => c.layers || []);
      const match = allLayers.find((l: any) => l.id === persistedSelectedLayerId);
      if (match) setSelectedLayer(match);
    } catch {}
  }, [showTimeline, persistedSelectedLayerId, getCurrentSceneId, getCurrentScene]);

  // const handleColumnClickWrapper = (columnId: string) => {
  //   handleColumnClick(columnId, setSelectedColumn);
  // };

  // Handle column play button - use same path as keyboard/MIDI to ensure crossfade works
  const handleColumnPlayWrapper = (columnId: string) => {
    // Manual/user-initiated: update preview and request play, and mark as manual so triggers back off briefly
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const last = (handleColumnPlayWrapper as any).__lastManualMs || 0;
    // Hard debounce manual plays to avoid double-firing from nested/bubbling handlers
    if (now - last < 300) return;
    (handleColumnPlayWrapper as any).__lastManualMs = now;
    if ((handleColumnPlayWrapper as any).__lock) return;
    (handleColumnPlayWrapper as any).__lock = true;
    try {
      document.dispatchEvent(new CustomEvent('columnPlay', { detail: { type: 'columnPlay', columnId, fromTrigger: false, origin: 'manual' } }));
    } catch {}
    // Manual play: reset per-row overrides so the new base column is visible
    try {
      const clear = (useStore as any).getState?.().clearActiveLayerOverrides as () => void;
      if (typeof clear === 'function') clear();
    } catch {}
    // Use playColumn directly (like keyboard/MIDI path) so the useEffect handles preview update
    // This ensures crossfade works properly by only calling setPreviewContent once
    try { playColumn(columnId); } catch {}
    setTimeout(() => { (handleColumnPlayWrapper as any).__lock = false; }, 300);
  };

  const updatePreviewForColumn = (columnId: string) => {
    // Programmatic column changes (from store/trigger): update preview only, do not call playColumn again
    try {
      handleColumnPlay(columnId, currentScene, setPreviewContent, setIsPlaying, ((_id: string) => {}) as any);
    } catch {}
  };

  // Keep preview content in sync when playback changes programmatically (e.g., via MIDI)
  useEffect(() => {
    try {
      if (!playingColumnId) return;
      updatePreviewForColumn(playingColumnId);
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
    // Check if this is a timeline-only layer (pseudo-layer created for timeline editing)
    const isTimelineOnlyLayer = String(layerId).startsWith('timeline-layer-');

    // In timeline preview, ALWAYS write to the selected clip data (never forward to a column layer)
    if (previewContent && previewContent.type === 'timeline' && selectedTimelineClip) {
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
      const { updateScene: updateSceneFn } = getSceneManagementFunctions();
      updateSceneFn(getCurrentSceneId(), { globalEffects: updatedEffects });
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
    
    // Snapshot sequence/global play state
    let seqOn = false;
    let wasGlobalPlaying = false;
    try {
      const st: any = useStore.getState();
      seqOn = !!st.sequenceEnabledGlobal;
      wasGlobalPlaying = !!st.isGlobalPlaying;
    } catch {}
    
    handleDrop(e, columnId, layerNum, scenes, currentSceneId, updateScene, setDragOverCell);
    
    // If sequence mode is active, ensure playback stays running
    if (seqOn) {
      try {
        const st: any = useStore.getState();
        // If this column was already playing, reassert it; otherwise keep global transport running
        const reassert = () => {
          try {
            if (wasPlayingThisColumn && typeof (st as any).playColumn === 'function') {
              (st as any).playColumn(columnId);
            }
            if (wasGlobalPlaying && typeof (st as any).globalPlay === 'function') {
              (st as any).globalPlay();
            }
          } catch (err) {
            console.warn('Failed to reassert playback after drop:', err);
          }
        };
        // Defer slightly to allow React state to settle
        setTimeout(reassert, 80);
      } catch {}
    }
    
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
        let availableHeight = Math.max(0, containerHeight - headerHeight);

        const aspect = (compositionSettings?.width || 1920) / (compositionSettings?.height || 1080);
        // Prefer fitting height, then clamp if width would overflow.
        // On single-column layout after refresh, containerHeight can be 0 on first tick.
        // In that case, fall back to sizing by container width and aspect.
        if (availableHeight <= 0) {
          const widthByContainer = Math.max(1, containerWidth);
          const heightByAspect = Math.floor(widthByContainer / aspect);
          setPreviewSize({ width: widthByContainer, height: heightByAspect });
          return;
        }

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
    const ro = new ResizeObserver(debounce(() => compute(), 200));
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
      const currentScene = getCurrentScene();
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

        const { updateScene: updateSceneFn } = getSceneManagementFunctions();
        updateSceneFn(getCurrentSceneId(), { columns: updatedColumns });
        console.log(`Deleted layer ${contextMenu.layerId} from column ${contextMenu.columnId}`);
      }
    }
    handleContextMenuClose();
  };

  // Delete column (the one the user right-clicked)
  const handleDeleteColumn = () => {
    if (!contextMenu.columnId) {
      handleContextMenuClose();
      return;
    }

    const currentScene = getCurrentScene();
    if (!currentScene) {
      handleContextMenuClose();
      return;
    }

    const targetId = contextMenu.columnId;
    // Safety: never delete the last remaining column
    if ((currentScene.columns || []).length <= 1) {
      handleContextMenuClose();
      return;
    }
    const updatedColumns = (currentScene.columns || []).filter((c: any) => c?.id !== targetId);

    // If we just deleted the currently playing column, stop playback.
    try {
      if (playingColumnId === targetId) stopColumn();
    } catch {}

    // Clear any row overrides that point to this column
    try {
      const st: any = (useStore as any).getState?.();
      const overrides: Record<number, string> = (st?.activeLayerOverrides || {}) as any;
      Object.keys(overrides || {}).forEach((k) => {
        const row = Number(k);
        if (!Number.isFinite(row)) return;
        if (String(overrides[row]) === String(targetId)) {
          try { st?.setActiveLayerOverride?.(row, null); } catch {}
        }
      });
    } catch {}

    const { updateScene: updateSceneFn } = getSceneManagementFunctions();
    updateSceneFn(getCurrentSceneId(), { columns: updatedColumns });
    console.log(`Deleted column ${targetId}`);

    handleContextMenuClose();
  };

  // Copy column
  const handleCopyColumn = () => {
    if (contextMenu.columnId) {
      const currentScene = getCurrentScene();
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

  // Paste column: insert at the right-clicked/target column
  const handlePasteColumn = () => {
    if (!(clipboard && clipboard.type === 'column' && clipboard.data)) {
      handleContextMenuClose();
      return;
    }

    const currentScene = getCurrentScene();
    if (!currentScene) {
      handleContextMenuClose();
      return;
    }

    const targetColumnId = contextMenu.columnId;
    const targetIndex = targetColumnId
      ? currentScene.columns.findIndex((c: any) => c.id === targetColumnId)
      : currentScene.columns.length - 1;
    // Insert at the target index (where user right-clicked), not one to the right.
    const insertIndex = targetIndex >= 0 ? targetIndex : currentScene.columns.length;

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
    const { updateScene: updateSceneFn } = getSceneManagementFunctions();
    updateSceneFn(getCurrentSceneId(), { columns: updatedColumns });
    console.log(`Pasted column ${pastedColumn.name} at column index ${insertIndex}`);

    handleContextMenuClose();
  };

  // Copy cell
  const handleCopyCell = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = getCurrentScene();
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
      const currentScene = getCurrentScene();
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

          const { updateScene: updateSceneFn } = getSceneManagementFunctions();
          updateSceneFn(getCurrentSceneId(), { columns: updatedColumns });
          console.log(`Pasted cell ${pastedCell.name} to column ${targetColumn.name} at row ${targetLayerNum}`);
        }
      }
    }
    handleContextMenuClose();
  };

  // Copy clip
  const handleCopyClip = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = getCurrentScene();
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
      const currentScene = getCurrentScene();
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

        const { updateScene: updateSceneFn } = getSceneManagementFunctions();
        updateSceneFn(getCurrentSceneId(), { columns: updatedColumns });
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

  // Helper to render specific preview content (used for crossfading)
  // slotId: 'current' or 'previous' to ensure unique keys for each slot
  const renderSpecificPreviewContent = (content: any, forcePlaying: boolean = false, slotId: 'current' | 'previous' = 'current') => {
    if (!content) {
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
    if (content.type === 'timeline') {
      const activeClips = content.activeClips || [];
      // Convert active clips into a temporary column structure for rendering
      // Timeline clips are completely independent - only use clip params, never column layers
      const tempLayers = activeClips.map((clip: any) => {
        const trackNumber = parseInt((clip.trackId || 'track-1').split('-')[1] || '1', 10);
        // Timeline clips are independent - only use their own params, never match to column layers
        // This ensures complete separation between timeline and column modes
        const resolvedParams = clip.params || {};
        
        // All timeline clips are independent - they always use their own data
        const timelineLayerData = clip;
        
          // Resolve effective fit mode: prefer clip.fitMode in timeline mode, then global default
          // Timeline clips never use column layer fitMode - they're completely independent
          let effectiveFitMode: 'cover' | 'contain' | 'stretch' | 'none' | 'tile' | undefined = undefined;
          try {
            if (clip.type !== 'effect') {
              // 1) Prefer fitMode coming from the clip's own data (timeline-local control)
              effectiveFitMode = (clip as any)?.fitMode as any;
              // 2) Fall back to clip.params.fitMode for backward compatibility
              if (!effectiveFitMode) effectiveFitMode = (resolvedParams as any)?.fitMode as any;
              // 3) Fall back to global default (never use column layer fitMode)
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
        // Get video options for this layer
        const layerId = `timeline-layer-${clip.id}`;
        const videoOptions = getVideoOptionsForLayer(layerId, true);

        // Timeline fade envelope (per-clip): fade-in and fade-out can be controlled separately.
        // Legacy: fadeEnabled + fadeDurationMs means both in/out enabled.
        const getParamVal = (p: any) => (p && typeof p === 'object' && 'value' in p ? p.value : p);
        const legacyEnabled = Boolean(getParamVal((resolvedParams as any)?.fadeEnabled));
        const legacyMsRaw = getParamVal((resolvedParams as any)?.fadeDurationMs ?? (resolvedParams as any)?.fadeDuration);
        const legacyMs = Number(legacyMsRaw);
        const legacySec = (Number.isFinite(legacyMs) && legacyMs > 0) ? (legacyMs / 1000) : 0;

        const inEnabledRaw = getParamVal((resolvedParams as any)?.fadeInEnabled);
        const outEnabledRaw = getParamVal((resolvedParams as any)?.fadeOutEnabled);
        const fadeInEnabled = (inEnabledRaw === undefined && outEnabledRaw === undefined) ? legacyEnabled : Boolean(inEnabledRaw);
        const fadeOutEnabled = (inEnabledRaw === undefined && outEnabledRaw === undefined) ? legacyEnabled : Boolean(outEnabledRaw);

        const inMsRaw = getParamVal((resolvedParams as any)?.fadeInDurationMs ?? (resolvedParams as any)?.fadeInDuration);
        const outMsRaw = getParamVal((resolvedParams as any)?.fadeOutDurationMs ?? (resolvedParams as any)?.fadeOutDuration);
        const inMs = Number(inMsRaw);
        const outMs = Number(outMsRaw);
        const inSec = (Number.isFinite(inMs) && inMs > 0) ? (inMs / 1000) : legacySec;
        const outSec = (Number.isFinite(outMs) && outMs > 0) ? (outMs / 1000) : legacySec;

        const rel = Number.isFinite(Number(clip.relativeTime)) ? Number(clip.relativeTime) : Math.max(0, Number(content.currentTime || 0) - Number(clip.startTime || 0));
        const dur = Math.max(0.0001, Number(clip.duration || 0.0001));

        const fdIn = (fadeInEnabled && inSec > 0) ? Math.min(inSec, dur) : 0;
        const fdOut = (fadeOutEnabled && outSec > 0) ? Math.min(outSec, dur) : 0;
        const inFactor = (fdIn > 0 && rel < fdIn) ? Math.max(0, Math.min(1, rel / fdIn)) : 1;
        const outFactor = (fdOut > 0 && (dur - rel) < fdOut) ? Math.max(0, Math.min(1, (dur - rel) / fdOut)) : 1;
        const fade = Math.max(0, Math.min(1, Math.min(inFactor, outFactor)));

        const baseOpacity = (typeof videoOptions.opacity === 'number')
          ? videoOptions.opacity
          : (typeof getParamVal((resolvedParams as any)?.opacity) === 'number' ? Number(getParamVal((resolvedParams as any)?.opacity)) : 1);
        const effectiveOpacity = Math.max(0, Math.min(1, Number(baseOpacity) * fade));
        
        return {
          id: layerId,
          name: `Layer ${trackNumber}`,
          layerNum: trackNumber,
          type: clip.type === 'effect' ? 'effect' : 'video',
          asset: clip.asset,
          opacity: effectiveOpacity,
          params: resolvedParams,
          effects: clip.type === 'effect' ? [clip.asset] : undefined,
          ...(clip.type !== 'effect' ? { 
            fitMode: videoOptions.fitMode || effectiveFitMode, 
            backgroundSizeMode: videoOptions.backgroundSizeMode,
            backgroundRepeat: videoOptions.backgroundRepeat,
            backgroundSizeCustom: videoOptions.backgroundSizeCustom,
            ...backgroundProps 
          } : {})
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
              key={`preview-${compositionSettings.width}x${compositionSettings.height}`}
              column={tempColumn}
              width={compositionSettings.width}
              height={compositionSettings.height}
              isPlaying={Boolean(content.isPlaying)}
              timelineTime={Number(content.currentTime || 0)}
              bpm={bpm}
              globalEffects={currentScene?.globalEffects || []}
              overridesKey={JSON.stringify(((useStore as any).getState?.() || {}).activeLayerOverrides || {})}
              isTimelineMode={true}
              // In timeline mode, Stop should pause effects too (freeze frameloop) while preserving last frame.
              hardFreeze={!Boolean(content.isPlaying)}
            />
          </div>
        </div>
      );
    }

    if (content.type === 'column') {
      console.log('🎨 Rendering column preview');
      // Always resolve the latest column from the store so updates are live
      const baseColumn = currentScene?.columns?.find((col: any) => col.id === content.columnId) || content.column;
      // Apply Resolume-style per-layer overrides from store (row-wise),
      // so overrides work even if base column lacks that row
      let liveColumn = baseColumn;
      try {
        const st: any = (useStore as any).getState?.();
        const overrides: Record<number, string> = ((content as any)?.overrideMap || st?.activeLayerOverrides || {}) as any;
        const byId: Record<string, any> = {};
        for (const c of currentScene?.columns || []) byId[c.id] = c;
        const getLayerFor = (col: any, ln: number) => {
          if (!col) return null;
          const layers = (col?.layers || []);
          // Prefer explicit layerNum/name
          let found = layers.find((l: any) => l?.layerNum === ln || l?.name === `Layer ${ln}`) || null;
          // Fallback to array index if metadata missing
          if (!found) {
            const idx = Math.max(0, Math.min(layers.length - 1, ln - 1));
            found = layers[idx] || null;
          }
          // Normalize layerNum so downstream logic uses row index reliably
          if (found && found.layerNum !== ln) {
            return { ...found, layerNum: ln };
          }
          return found;
        };
        const rowCount = Math.min(6, Math.max(3, Number(currentScene?.numRows) || numRows || 3));
        const rowNums = Array.from({ length: rowCount }, (_, i) => i + 1);
        const finalLayers = rowNums.map((ln) => {
          const overrideColId = overrides ? overrides[ln] : null;
          if (overrideColId && byId[overrideColId]) {
            const src = getLayerFor(byId[overrideColId], ln);
            if (src) return src;
          }
          const base = getLayerFor(baseColumn, ln);
          return base || { id: `placeholder-${ln}`, name: `Layer ${ln}`, layerNum: ln, type: 'effect', opacity: 1, blendMode: 'normal', solo: false, mute: false, locked: false, params: {} } as any;
        });
        liveColumn = { ...baseColumn, layers: finalLayers };
      } catch {}
      const overridesKeyForRender = (() => {
        try { return JSON.stringify((content as any)?.overrideMap || (useStore as any).getState?.()?.activeLayerOverrides || {}); } catch { return '{}'; }
      })();

      // Show the first layer with content as the main preview
      const layersWithContent = (liveColumn?.layers || []).filter((layer: any) => layer.asset);
      console.log('🎨 Layers with content (live):', layersWithContent);
      
      // If empty, still render the preview canvas area (no instructional text)

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
                key={`${slotId}-preview-${compositionSettings.width}x${compositionSettings.height}`}
                column={liveColumn}
                width={compositionSettings.width}
                height={compositionSettings.height}
                isPlaying={
                  // Force playing during crossfade, or normal mode checks
                  forcePlaying ||
                  // Normal mode: only play when this column is the playing column.
                  // 360 mode: allow local or global play state to drive playback.
                  (is360PreviewMode && isEquirectangular)
                    ? (isPlaying || isGlobalPlaying)
                    : (playingColumnId === content.columnId && isGlobalPlaying)
                }
                bpm={bpm}
                globalEffects={currentScene?.globalEffects || []}
                overridesKey={overridesKeyForRender}
                forceAlwaysRender={is360PreviewMode && isEquirectangular}
                suppressPause={is360PreviewMode && isEquirectangular}
                hardFreeze={!isGlobalPlaying && !forcePlaying}
                skipInitialMask={slotId === 'previous'}
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

    if (content.type === 'layer') {
      return (
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
          <div className="tw-flex tw-items-center tw-gap-3 tw-h-10 tw-px-3 tw-bg-neutral-800 tw-border-b tw-border-neutral-800">
            <h4 className="tw-text-sm tw-text-neutral-200">Layer Preview</h4>
            <span className="tw-text-xs tw-text-neutral-400 tw-ml-auto">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="tw-p-2">
            <div className="tw-text-sm tw-text-neutral-200 tw-mb-2">{content.layer.name}</div>
            {content.asset && (
              <div className="tw-rounded tw-border tw-border-neutral-800 tw-bg-black">
                <CanvasRenderer
                  assets={[{
                    type: content.asset.type === 'image' ? 'image' : 
                           content.asset.type === 'video' ? 'video' : 'effect',
                    asset: content.asset,
                    layer: content.layer
                  }]}
                  width={compositionSettings.width}
                  height={compositionSettings.height}
                  bpm={bpm}
                  isPlaying={showTimeline ? isPlaying : (isGlobalPlaying && isPlaying)}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (content.type === 'timeline') {
      const activeClips = content.activeClips || [];
      
      return (
        <div className="tw-h-full tw-flex tw-flex-col">
          <div className="tw-flex tw-items-center tw-gap-3 tw-h-10 tw-px-3 tw-bg-neutral-800 tw-border-b tw-border-neutral-800">
            <h4 className="tw-text-sm tw-text-neutral-200">Timeline Preview</h4>
            <span className="tw-text-xs tw-text-neutral-400 tw-ml-auto">{isPlaying ? 'Playing' : 'Stopped'}</span>
            <div className="tw-text-xs tw-text-neutral-400">
              Time: {Math.floor(content.currentTime)}s / {Math.floor(content.duration)}s
            </div>
          </div>
          
          <div className="tw-flex tw-flex-col tw-gap-2 tw-flex-1 tw-p-2 tw-rounded-md tw-bg-neutral-900 tw-border tw-border-neutral-800">
            {activeClips.length === 0 ? (
              <div className="tw-flex tw-items-center tw-justify-center tw-h-48 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded">
                <div className="tw-text-center tw-text-neutral-300">
                  <div className="tw-text-sm">No clips playing at current time</div>
                  <div className="tw-mt-1 tw-text-xs tw-text-neutral-400">{Math.floor(content.currentTime)}s</div>
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
                    key={`timeline-${compositionSettings.width}x${compositionSettings.height}`}
                    activeClips={activeClips}
                    isPlaying={isPlaying}
                    currentTime={content.currentTime}
                    width={compositionSettings.width}
                    height={compositionSettings.height}
                    bpm={bpm}
                    globalEffects={currentScene?.globalEffects || []}
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
      <div className="tw-w-full tw-h-full tw-bg-black" />
    );
  };

  // Wrapper function that uses current previewContent
  const renderPreviewContent = () => renderSpecificPreviewContent(previewContent);

  if (!currentScene) {
    return (
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col tw-overflow-visible">
        <div className="tw-flex tw-flex-col tw-h-full lg:tw-overflow-hidden tw-overflow-visible">
          <div className="tw-flex tw-items-center tw-justify-between tw-h-12 tw-px-4 tw-py-2 tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
            <h2>No Scene Selected</h2>
            <div className="scene-controls">
              <button onClick={() => { const { addScene: addSceneFn } = getSceneManagementFunctions(); addSceneFn(); }} className="add-scene-btn">
                + Create Scene
              </button>
            </div>
          </div>
          <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center">
            <div className="tw-text-center tw-space-y-2">
              <h3 className="tw-text-lg">Welcome to VJ</h3>
              <p className="tw-text-sm tw-text-neutral-300">Create your first scene to get started</p>
              <Button variant="secondary" onClick={() => { const { addScene: addSceneFn } = getSceneManagementFunctions(); addSceneFn(); }}>Create New Scene</Button>
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
  // In timeline mode, never resolve to column mode layers - they're completely separate
  // Timeline clips should only use their own data, not column layers
  if (selectedTimelineClip && showTimeline) {
    // Timeline mode: effectiveSelectedLayer stays null - timeline clips are independent
    // The pseudo-layer will be created below for UI display purposes only
  } else if (selectedTimelineClip && getCurrentSceneId() && !showTimeline) {
    // Only resolve in column mode (shouldn't happen, but safety check)
    const scene = getCurrentScene();
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
    const layerId = `timeline-layer-${selectedTimelineClip.id}`;
    const videoOptions = getVideoOptionsForLayer(layerId, true);
    
    return {
      id: layerId,
      name: clip.name || `Layer ${trackNumber}`,
      layerNum: trackNumber,
      type: clip.type === 'effect' ? 'effect' : 'video',
      asset: clip.asset,
      opacity: videoOptions.opacity || 1,
      blendMode: videoOptions.blendMode || 'add',
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
    getVideoOptionsForLayer,
  ]);

  if (!effectiveSelectedLayer && memoPseudoLayer) {
    effectiveSelectedLayer = memoPseudoLayer;
  }

  // Auto-focus Layer tab and select pseudo-layer when a timeline clip is chosen (fully decoupled from columns)
  useEffect(() => {
    if (!selectedTimelineClip) return;
    try {
      setMiddlePanelTab((curr) => (curr === 'global' ? curr : 'layer'));
      const clipData = selectedTimelineClip.data || {};
      const asset = clipData.asset || {};
      const layerId = `timeline-layer-${selectedTimelineClip.id}`;
      
      // Ensure video options exist for this timeline layer
      ensureVideoOptionsForLayer(layerId, true);
      const videoOptions = getVideoOptionsForLayer(layerId, true);
      
      const pseudoLayer = {
        id: layerId,
        type: clipData.type || 'video',
        asset: asset,
        params: clipData.params || {},
        opacity: videoOptions.opacity || 1.0,
        blendMode: videoOptions.blendMode || 'add',
        fitMode: videoOptions.fitMode || 'cover',
        playMode: videoOptions.playMode || 'restart',
        loopMode: videoOptions.loopMode || 'none',
        loopCount: videoOptions.loopCount || 1,
        renderScale: videoOptions.renderScale || undefined,
        clipId: selectedTimelineClip.id,
        isTimelineLayer: true,
      };
      setSelectedLayer(pseudoLayer);
    } catch {}
  }, [selectedTimelineClip, ensureVideoOptionsForLayer, getVideoOptionsForLayer]);

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
    console.log('➕ Added', columnsAdded, 'columns to scene', getCurrentSceneId());
    const { updateScene: updateSceneFn } = getSceneManagementFunctions();
    updateSceneFn(getCurrentSceneId(), { columns });
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
      const { updateScene: updateSceneFn } = getSceneManagementFunctions();
      updateSceneFn(getCurrentSceneId(), { globalEffects: migratedEffects });
    }
  }

  try {
    console.log('LayerManager about to render main content');
    
    // Spacebar play/pause in column mode (match timeline behavior)
    useEffect(() => {
      if (showTimeline) return; // only handle in column mode
      const handleKeyDown = (e: KeyboardEvent) => {
        // ignore when typing
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.code === 'Space') {
          e.preventDefault();
          // Toggle: if currently playing, stop; else play
          const st: any = (useStore.getState && (useStore.getState() as any)) || {};
          if (st.isGlobalPlaying) {
            try { globalPause({ source: 'spacebar', force: true } as any); } catch {}
          } else {
            try { globalPlay({ source: 'spacebar' } as any); } catch {}
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showTimeline, isGlobalPlaying]);

    return (
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col tw-overflow-visible">
        <div className="tw-flex tw-flex-col tw-h-full lg:tw-min-h-0 lg:tw-overflow-visible lg:tw-pb-0">
          <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
            <div className="header-left tw-flex tw-items-center tw-gap-2 tw-flex-wrap">

              <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap tw-flex-1">
                {/* BPM Controls moved to the far left (before global playback controls) */}
                <div className="tw-flex tw-items-center tw-gap-2">
                  <button 
                    onClick={() => {
                      // Simple tap-to-BPM using clock: compute from intervals
                      try {
                        const w: any = window as any;
                        const now = performance.now();
                        w.__vj_tap_hist__ = (w.__vj_tap_hist__ || []).filter((t: number) => now - t < 2000);
                        w.__vj_tap_hist__.push(now);
                        if (w.__vj_tap_hist__.length >= 2) {
                          const ivals: number[] = [];
                          for (let i = 1; i < w.__vj_tap_hist__.length; i++) ivals.push(w.__vj_tap_hist__[i] - w.__vj_tap_hist__[i-1]);
                          const avg = ivals.reduce((a, b) => a + b, 0) / ivals.length;
                          const newBpm = Math.max(30, Math.min(999, Math.round(60000 / avg)));
                          setBpm(newBpm);
                          getClock().setBpm(newBpm);
                        }
                      } catch {}
                    }}
                    className="tw-inline-flex tw-items-center tw-justify-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-w-8 tw-h-10 tw-rounded-full hover:tw-bg-neutral-800"
                    title="Tap to set BPM"
                  >
                    <span
                      className={`tw-block tw-rounded-full tw-w-2 tw-h-2 tw-transition-transform tw-duration-150 tw-ease-out ${isBeatPulse ? 'tw-scale-125' : 'tw-scale-100'}`}
                      style={{ backgroundColor: 'var(--accent-color)' }}
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
                    className="tw-w-16 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-0 focus:tw-outline-none"
                    placeholder="120"
                  />
                </div>
                
                 {/* Global playback controls */}
                 {!showTimeline && (
                  <div className="tw-flex tw-items-center tw-gap-2 tw-px-2 tw-h-10 tw-my-2 tw-mr-2 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
                    <button
                      onClick={globalPlay}
                      className={`tw-inline-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded ${transportState === 'play' ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                      title="Play - Resume all videos"
                    >
                      <PlayIcon className="tw-w-4 tw-h-4" />
                    </button>
                    <button
                      className={`tw-inline-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded ${transportState === 'pause' ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                      onClick={() => {
                        try { globalPause({ source: 'toolbar', force: true } as any); } catch {}
                      }}
                      title="Pause - Pause all videos"
                    >
                      <PauseIcon className="tw-w-4 tw-h-4" />
                    </button>
                    <button
                      className={`tw-inline-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded ${transportState === 'stop' ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                      onClick={() => {
                        try { globalStop({ source: 'toolbar', force: true } as any); } catch {}
                      }}
                      title="Stop - Stop all videos"
                    >
                      <StopIcon className="tw-w-4 tw-h-4" />
                    </button>
                  </div>
                )}
                 {/* Timeline controls (when in timeline mode) */}
                 {showTimeline && (
                   <div className="tw-mr-2">
                     <TimelineControls />
                   </div>
                 )}
                <div className="tw-ml-auto tw-flex tw-items-center tw-gap-2 tw-order-2">
                  <button
                    className="hdr-900-hide tw-inline-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-text-neutral-200 tw-bg-transparent tw-border tw-border-neutral-700 tw-rounded"
                    aria-label="Open menu"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { (window as any).__openMobileMenu?.(); } catch {} }}
                    title="Menu"
                  >
                    <HamburgerMenuIcon className="tw-w-4 tw-h-4" />
                  </button>
                </div>
                {/* Unified scene navigator: mobile full-width on second row; inline on desktop */}
                <div className="scene-nav-wrap tw-flex tw-items-center tw-gap-2 tw-basis-full tw-order-last hdr-900-order-none hdr-900-basis-auto tw-w-full hdr-900-w-auto tw-min-h-10">
                <button
                  onClick={() => {
                    const currentScenes = getScenes();
                    const currentIndex = currentScenes.findIndex((s: any) => s.id === getCurrentSceneId());
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : currentScenes.length - 1;
                    const { setCurrentScene: setCurrentSceneFn } = getSceneManagementFunctions();
                    setCurrentSceneFn(currentScenes[prevIndex].id);
                  }}
                  disabled={getScenes().length <= 1}
                  className="tw-inline-flex lg:tw-hidden hdr-1240-show tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-300 tw-rounded hover:tw-bg-neutral-800 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                  title="Previous scene"
                >
                  <ChevronLeftIcon className="tw-w-4 tw-h-4" />
                </button>
                {/* Single current scene label centered (mobile only) */}
                <div className="tw-flex-1 tw-flex tw-justify-center hdr-900-hide hdr-1240-hide">
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-2 tw-max-w-[60%] tw-truncate focus:tw-outline-none focus:tw-ring-0 focus:tw-ring-offset-0 ${currentScene?.id === getCurrentSceneId() ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700 tw-text-neutral-200'}`}
                    title={currentScene?.name || 'Current scene'}
                  >
                    {currentScene?.name || 'Scene'}
                  </button>
                </div>

                {/* End of Scene Action Selector - Only show in timeline mode */}
                {showTimeline && (
                  <div className="tw-flex tw-items-center tw-gap-2 tw-ml-2">
                    <label className="tw-text-xs tw-text-neutral-400 tw-whitespace-nowrap">End:</label>
                    <select
                      value={(() => {
                        const currentTimelineScene = timelineScenes.find((s: any) => s.id === currentTimelineSceneId);
                        return currentTimelineScene?.endOfSceneAction || 'stop';
                      })()}
                      onChange={(e) => {
                        const action = e.target.value as 'loop' | 'play_next' | 'random' | 'stop';
                        console.log('🎛️ Updating timeline scene end action:', { sceneId: currentTimelineSceneId, action });
                        updateTimelineScene(currentTimelineSceneId, { endOfSceneAction: action });
                        console.log('🎛️ Timeline scene updated. Current scenes:', timelineScenes.map((s: any) => ({ id: s.id, name: s.name, endOfSceneAction: s.endOfSceneAction })));
                      }}
                      className="tw-text-xs tw-bg-neutral-800 tw-text-neutral-200 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1 tw-min-w-0 tw-flex-shrink-0"
                      title="Action when scene ends"
                    >
                      <option value="stop">Stop</option>
                      <option value="loop">Loop</option>
                      <option value="play_next">Next</option>
                      <option value="random">Random</option>
                    </select>
                  </div>
                )}

                

                {/* Scenes list row (visible on 900–1239px only) - windowed around current */}
                <div className="tw-hidden hdr-900-flex hdr-1240-hide tw-items-center tw-gap-2 tw-overflow-x-auto tw-whitespace-nowrap tw-flex-1 tw-basis-full tw-order-last hdr-900-order-none hdr-900-basis-auto tw-mt-2 hdr-900-mt-0">
                  {(() => {
                    const scenesArr = getScenes();
                    const currentId = getCurrentSceneId();
                    const currentIndex = scenesArr.findIndex((s: any) => s.id === currentId);
                    const MAX_VISIBLE = 4;
                    let start = Math.max(0, currentIndex - Math.floor(MAX_VISIBLE / 2));
                    if (start + MAX_VISIBLE > scenesArr.length) start = Math.max(0, scenesArr.length - MAX_VISIBLE);
                    const visible = scenesArr.slice(start, start + MAX_VISIBLE);
                    return visible.map((scene: any) => {
                      const originalIndex = scenesArr.indexOf(scene);
                      const index = originalIndex;
                      return (
                    <ContextMenu key={scene.id}>
                      <ContextMenuTrigger asChild>
                         <button
                           className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-2 focus:tw-outline-none focus:tw-ring-0 focus:tw-ring-offset-0 ${scene.id === getCurrentSceneId() ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700 tw-text-neutral-200'}`}
                          onClick={() => {
                            const { setCurrentScene: setCurrentSceneFn } = getSceneManagementFunctions();
                            setCurrentSceneFn(scene.id);
                          }}
                           style={scene.id === (currentScene?.id || getCurrentSceneId()) ? { backgroundColor: 'hsl(var(--accent))', borderColor: 'hsl(var(--accent))', color: '#000' } : undefined}
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
                              if (!Number.isNaN(from)) {
                                const { reorderScenes: reorderScenesFn } = getSceneManagementFunctions();
                                reorderScenesFn(from, index);
                              }
                            }
                          }}
                          title={"Right-click to rename, duplicate, or delete"}
                        >
                          {scene.name}
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => {
                          const { updateScene: updateSceneFn } = getSceneManagementFunctions();
                          handleSceneRename(scene, updateSceneFn);
                        }}>Rename</ContextMenuItem>
                        <ContextMenuItem onSelect={() => {
                          const { duplicateScene: duplicateSceneFn } = getSceneManagementFunctions();
                          duplicateSceneFn(scene.id);
                        }}>Duplicate</ContextMenuItem>
                        {getScenes().length > 1 && (
                          <ContextMenuItem className="tw-text-red-400" onSelect={() => {
                            const { removeScene: removeSceneFn } = getSceneManagementFunctions();
                            removeSceneFn(scene.id);
                          }}>Delete</ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                    );
                    });
                  })()}
                </div>
                {/* Desktop ≥1240px: windowed around current to avoid wrapping */}
                <div className="tw-hidden hdr-1240-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-whitespace-nowrap tw-flex-1 tw-min-w-0">
                  {(() => {
                    const scenesArr = getScenes();
                    const currentId = getCurrentSceneId();
                    const currentIndex = scenesArr.findIndex((s: any) => s.id === currentId);
                     const MAX_VISIBLE = 10;
                    let start = Math.max(0, currentIndex - Math.floor(MAX_VISIBLE / 2));
                    if (start + MAX_VISIBLE > scenesArr.length) start = Math.max(0, scenesArr.length - MAX_VISIBLE);
                    const visible = scenesArr.slice(start, start + MAX_VISIBLE);
                    return visible.map((scene: any) => {
                      const originalIndex = scenesArr.indexOf(scene);
                      const index = originalIndex;
                      return (
                    <ContextMenu key={scene.id}>
                      <ContextMenuTrigger asChild>
                         <button
                           className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-2 focus:tw-outline-none focus:tw-ring-0 focus:tw-ring-offset-0 ${scene.id === getCurrentSceneId() ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border-neutral-700 tw-text-neutral-200'}`}
                          onClick={() => {
                            const { setCurrentScene: setCurrentSceneFn } = getSceneManagementFunctions();
                            setCurrentSceneFn(scene.id);
                          }}
                           style={scene.id === (currentScene?.id || getCurrentSceneId()) ? { backgroundColor: 'hsl(var(--accent))', borderColor: 'hsl(var(--accent))', color: '#000' } : undefined}
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
                              if (!Number.isNaN(from)) {
                                const { reorderScenes: reorderScenesFn } = getSceneManagementFunctions();
                                reorderScenesFn(from, index);
                              }
                            }
                          }}
                          title={"Right-click to rename, duplicate, or delete"}
                        >
                          {scene.name}
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => {
                          const { updateScene: updateSceneFn } = getSceneManagementFunctions();
                          handleSceneRename(scene, updateSceneFn);
                        }}>Rename</ContextMenuItem>
                        <ContextMenuItem onSelect={() => {
                          const { duplicateScene: duplicateSceneFn } = getSceneManagementFunctions();
                          duplicateSceneFn(scene.id);
                        }}>Duplicate</ContextMenuItem>
                        {getScenes().length > 1 && (
                          <ContextMenuItem className="tw-text-red-400" onSelect={() => {
                            const { removeScene: removeSceneFn } = getSceneManagementFunctions();
                            removeSceneFn(scene.id);
                          }}>Delete</ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                    );
                    });
                  })()}
                </div>
                <button
                  onClick={() => {
                    const currentScenes = getScenes();
                    const currentIndex = currentScenes.findIndex((s: any) => s.id === getCurrentSceneId());
                    const nextIndex = currentIndex < currentScenes.length - 1 ? currentIndex + 1 : 0;
                    const { setCurrentScene: setCurrentSceneFn } = getSceneManagementFunctions();
                    setCurrentSceneFn(currentScenes[nextIndex].id);
                  }}
                  disabled={getScenes().length <= 1}
                  className="tw-inline-flex lg:tw-hidden hdr-1240-show tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-300 tw-rounded hover:tw-bg-neutral-800 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                  title="Next scene"
                >
                  <ChevronRightIcon className="tw-w-4 tw-h-4" />
                </button>
                {/* Mobile: add new scene button to the right of the right arrow */}
                <button
                  onClick={() => { const { addScene: addSceneFn } = getSceneManagementFunctions(); addSceneFn(); }}
                  className="tw-inline-flex lg:tw-hidden hdr-1240-show tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-rounded hover:tw-bg-neutral-800"
                  title="Add new scene"
                >
                  +
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
              <ScrollArea.Viewport className="vj-scroll-viewport tw-w-full tw-pr-3 tw-pb-3 tw-pt-2" ref={gridWrapperRef}>
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
                      className={`tw-flex tw-items-center tw-justify-between tw-px-2 tw-border-b tw-border-neutral-800 ${isColumnPlaying ? 'tw-bg-[hsl(var(--accent))/0.18]' : 'tw-bg-neutral-800'} ${hasClips ? 'tw-cursor-pointer' : 'tw-cursor-default'} ${!hasClips ? 'tw-opacity-60' : ''}`}
                      style={{ height: '45px' }}
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
                          <PlayIcon className="tw-w-2.5 tw-h-2.5" />
                        ) : (
                          <StopIcon className="tw-w-2.5 tw-h-2.5" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
                </div>

                {/* Layer Rows (dynamic) */}
                {Array.from({ length: numRows }, (_, i) => numRows - i).map((layerNum) => (
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
                   const isColumnPlaying = playingColumnId === column.id;
                   const overrideColId = (activeLayerOverrides && activeLayerOverrides[layerNum]) || null;
                   const isOverriddenActive = !!overrideColId && overrideColId === column.id;
                   const isCellActive = isOverriddenActive || (!overrideColId && isColumnPlaying);
                   const playingCol = columns.find((c: any) => c.id === playingColumnId);
                   const playingRowLayer = playingCol ? playingCol.layers.find((l: any) => l.layerNum === layerNum || l.name === `Layer ${layerNum}`) : null;
                   const rowEmptyInPlaying = !playingRowLayer || !playingRowLayer.asset;
 
                   // Debug logging
                   if (hasAsset && isCellActive) {
                     console.log('🎯 Active cell detected:', { cellId, columnId: column.id, playingColumnId, isColumnPlaying, isOverriddenActive });
                   }
 
                   return (
                     <div
                       key={cellId}
                       style={{ height: CELL_HEIGHT_PX, ...(isCellActive ? { boxShadow: 'inset 0 0 0 2px var(--accent-color)' } : {}) }}
                                                 className={`tw-rounded-md tw-overflow-hidden ${hasAsset ? (isCellActive ? 'tw-border-2 tw-border-purple-500 tw-bg-neutral-900 !tw-border-purple-500' : 'tw-border tw-border-neutral-800 tw-bg-neutral-900') : (isCellActive ? 'tw-border-2 tw-border-purple-500 tw-bg-neutral-900' : 'tw-border tw-border-dashed tw-border-neutral-800 tw-bg-neutral-900/50')} ${isDragOver || isDragOverLayer ? 'tw-ring-2 tw-ring-sky-600' : (isCellActive ? 'tw-ring-2 tw-ring-[hsl(var(--accent))]' : '')} ${contextHighlightedCell === cellId ? 'tw-bg-neutral-800/60' : ''}`}
                       data-system-files={isDragOver && (() => {
                         const dragData = (window as any).currentDragData;
                         return dragData && dragData.files && dragData.files.length > 0 ? 'true' : 'false';
                       })()}
                       onClick={() => {
                         if (!hasAsset) return;
                         if (rowEmptyInPlaying) {
                           try {
                             const setOverride = (useStore as any).getState?.().setActiveLayerOverride as (ln: number, col: string|null) => void;
                             if (setOverride) setOverride(layerNum, column.id);
                           } catch {}
                         } else {
                           handleLayerClickWrapper(layer, column.id);
                         }
                       }}
                       onDoubleClick={() => {
                         console.log('Double-click detected!', { hasAsset, layer, columnId: column.id, layerNum });
                         if (hasAsset && layer) {
                           // Find the source column ID by searching through all columns
                           const currentScene = getCurrentScene();
                           console.log('Current scene:', currentScene);
                           if (currentScene) {
                             const sourceColumn = currentScene.columns.find((col: any) => 
                               col.id !== column.id && col.layers.some((l: any) => l.id === layer.id)
                             );
                             console.log('Source column found:', sourceColumn);
                             if (sourceColumn) {
                               console.log('Moving asset from', sourceColumn.id, 'to', column.id, 'at layer', layerNum);
                               // Move asset to the target column and layer
                               handleDoubleClickMove(layer, sourceColumn.id, column.id, layerNum);
                             } else {
                               console.log('No source column found - layer might already be in target column');
                               // If no source found, try to move within the same column to a different layer
                               if (layerNum !== layer.layerNum) {
                                 console.log('Moving within same column to different layer');
                                 handleDoubleClickMove(layer, column.id, column.id, layerNum);
                               } else {
                                 console.log('Layer is already in the target position - no move needed');
                                 // For occupied cells, just set the active layer override to switch focus
                                 try {
                                   const setOverride = (useStore as any).getState?.().setActiveLayerOverride as (ln: number, col: string|null) => void;
                                   if (setOverride) {
                                     setOverride(layerNum, column.id);
                                   }
                                 } catch {}
                               }
                             }
                           }
                         } else {
                           console.log('Empty cell - setting active layer override');
                           // For empty cells, just set the active layer override
                           try {
                             const setOverride = (useStore as any).getState?.().setActiveLayerOverride as (ln: number, col: string|null) => void;
                             if (setOverride) {
                               setOverride(layerNum, column.id);
                             }
                           } catch {}
                         }
                       }}
                       onContextMenu={(e) => {
                         if (hasAsset) {
                           handleCellRightClick(e, layer, column.id);
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
                           <div className="tw-mb-1" onClick={(e) => { e.stopPropagation(); setMiddlePanelTab('layer'); handleLayerClickWrapper(layer, column.id); }}>
                             {layer.asset.type === 'image' && (
                               <img
                                 src={getAssetPath(layer.asset)}
                                 alt={displayNameClean}
                                 draggable={false}
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
                               <VideoThumbnailPreview
                                 src={getAssetPath(layer.asset, true)}
                                 assetName={layer.asset.name}
                               />
                             )}
                             {(layer.asset.isEffect || layer.asset.type === 'effect' || layer.asset.type === 'p5js' || layer.asset.type === 'threejs') && (
                               <div className="tw-w-full tw-aspect-video tw-bg-black tw-rounded tw-flex tw-items-center tw-justify-center">
                                 <div className="tw-w-2 tw-h-2 tw-rounded-full tw-bg-white/90" />
                               </div>
                             )}
                           </div>
                           <div 
                              className="tw-text-xs tw-text-neutral-200 tw-cursor-grab tw-truncate tw-whitespace-nowrap tw-overflow-hidden tw-transition-colors tw-duration-200 cell-name-hover"
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
                           className="tw-p-2 tw-flex tw-flex-col tw-justify-center tw-items-center tw-h-full"
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
                           onDoubleClick={() => {
                             // For empty cells, set the active layer override
                             try {
                               const setOverride = (useStore as any).getState?.().setActiveLayerOverride as (ln: number, col: string|null) => void;
                               if (setOverride) {
                                 setOverride(layerNum, column.id);
                               }
                             } catch {}
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
                           <div className="tw-text-xs tw-text-neutral-500"></div>
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
              className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-border-t-0 tw-rounded-md tw-rounded-t-none tw-overflow-hidden lg:tw-basis-[30%] lg:tw-flex-none tw-min-w-[200px] tw-w-full"
              ref={previewContainerRef}
              style={fsFallbackActive ? { position: 'fixed', inset: 0, zIndex: 9999, width: '100%', height: '100dvh' as any } : undefined}
            >
              {!(isPreviewFullscreen || fsFallbackActive) && (
                <div className="tw-border-b tw-border-neutral-800 tw-py-2 tw-pl-3 tw-pr-3 lg:tw-pl-0 lg:tw-pr-0" ref={previewHeaderRef}>
                  <div className="tw-inline-flex tw-items-center tw-h-10 tw-w-full tw-bg-secondary tw-rounded-none">
                    <h4 className="tw-text-sm tw-leading-[14px] tw-font-medium tw-text-foreground tw-pl-2">Preview</h4>
                    <div className="tw-flex tw-items-center tw-gap-2 tw-ml-auto tw-pr-3">
                    {/* 360 preview toggle - only shown for equirectangular (2:1) compositions */}
                    {isEquirectangular && (
                      <button
                        className={`tw-inline-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-rounded tw-border ${
                          is360PreviewMode 
                            ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black hover:tw-opacity-90' 
                            : 'tw-text-neutral-300 tw-bg-neutral-900 tw-border-neutral-700 hover:tw-text-white hover:tw-bg-neutral-800'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const entering360 = !is360PreviewMode;
                          
                          
                          if (entering360) {
                            // Resume videos immediately, in the same user gesture, so play() is not blocked.
                            try { document.dispatchEvent(new CustomEvent('videoResume')); } catch {}
                            // CRITICAL: Call globalPlay FIRST to set isGlobalPlaying=true in store.
                            // This ensures that when the store update triggers a re-render before React state updates,
                            // the isPlaying prop will be true (because isGlobalPlaying=true).
                            try { globalPlay({ force: true, source: 'preview:360-toggle' } as any); } catch {}
                            resumeAllVideos();
                            try { window.dispatchEvent(new CustomEvent('vjDebug', { detail: { msg: '[360-toggle] enter' } })); } catch {}
                            // Reassert the current column play to match the behavior of clicking a column tab.
                            if (previewContent?.type === 'column' && previewContent?.columnId) {
                              try {
                                try { window.dispatchEvent(new CustomEvent('vjDebug', { detail: { msg: `[360-toggle] reassert ${previewContent.columnId}` } })); } catch {}
                                handleColumnPlay(previewContent.columnId, currentScene, setPreviewContent, setIsPlaying, playColumn);
                                requestAnimationFrame(() => {
                                  try { handleColumnPlay(previewContent.columnId, currentScene, setPreviewContent, setIsPlaying, playColumn); } catch {}
                                });
                              } catch {}
                            }
                            setIsPlaying(true);
                            const c = previewCanvasRef.current;
                            if (c && c.width > 0 && c.height > 0) {
                              setSphereSourceCanvas(c);
                            }
                            setTimeout(() => {
                              resumeAllVideos();
                            }, 0);
                          }
                          setIs360PreviewMode(!is360PreviewMode);
                        }}
                        title={is360PreviewMode ? 'Switch to flat view' : 'Switch to 360 view (drag to pan)'}
                        aria-label={is360PreviewMode ? 'Switch to flat view' : 'Switch to 360 view'}
                        aria-pressed={is360PreviewMode}
                      >
                        <GlobeIcon className="tw-w-3.5 tw-h-3.5" />
                      </button>
                    )}
                    {/* Mirror button removed per request to hide R3F icon */}
                    <button
                      className="tw-inline-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-rounded tw-text-neutral-300 tw-bg-neutral-900 hover:tw-text-white hover:tw-bg-neutral-800 tw-border tw-border-neutral-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // Same as 360 toggle: dispatch synchronous play signal within the gesture.
                        try { globalPlay({ force: true, source: 'preview:fullscreen' } as any); } catch {}
                        togglePreviewFullscreen();
                      }}
                      title="Fullscreen Preview"
                      aria-label="Fullscreen Preview"
                    >
                      <EnterFullScreenIcon className="tw-w-3.5 tw-h-3.5" />
                    </button>
                    </div>
                  </div>
                </div>
              )}
              <div 
                className="tw-flex tw-items-center tw-justify-center tw-bg-neutral-900 tw-w-full tw-flex-1 tw-relative"
              >
                {/* Flat preview (always renders as source for 360 mode) */}
                <div
                  // In 360 mode we must keep the source canvas laid out at full size.
                  // Using `absolute` without `inset-0` can collapse width/height to 0 and freeze the 360 texture.
                  // Also, don't hide the flat preview until the 360 view has a valid source canvas.
                  className={(is360PreviewMode && isEquirectangular && sphereSourceCanvas) ? 'tw-absolute tw-inset-0 tw-opacity-0 tw-pointer-events-none' : ''}
                  style={
                    (isPreviewFullscreen || fsFallbackActive)
                      ? ({
                          width: previewSize.width || '100%',
                          height: previewSize.height || '100dvh',
                          maxWidth: '100%',
                          maxHeight: '100dvh'
                        } as any)
                      : ({
                          width: previewSize.width || undefined,
                          height: previewSize.height || undefined
                        } as any)
                  }
                  ref={(el) => {
                    // Always capture the flat preview's canvas so it's available immediately when toggling 360.
                    if (!el) return;
                    const canvas = el.querySelector('canvas');
                    if (canvas && canvas !== previewCanvasRef.current) {
                      previewCanvasRef.current = canvas;
                    }
                  }}
                >
                  {(() => {
                    console.log('🎭 Rendering preview content in preview window');
                    
                    // Always use crossfade-compatible structure to preserve component instances
                    // This prevents black flash when transitioning from normal to crossfade rendering
                    const isActivelyCrossfading = (isCrossfading || showPreviousContent) && previousPreviewContent;
                    const oldOpacity = isActivelyCrossfading ? (1 - crossfadeProgress) : 0;
                    const newOpacity = isActivelyCrossfading ? crossfadeProgress : 1;
                    const forcePlaying = isCrossfading && isGlobalPlaying;
                    
                    if (isActivelyCrossfading) {
                      console.log('🎨 Rendering crossfade', { progress: crossfadeProgress, isCrossfading, showPreviousContent });
                    }
                    
                    return (
                      <div className="tw-relative tw-w-full tw-h-full tw-bg-black">
                        {/* Current/new content - always rendered in this slot */}
                        <div
                          className="tw-absolute tw-inset-0"
                          data-preview-slot="current"
                          style={{ 
                            opacity: newOpacity,
                            transition: 'none',
                            zIndex: 1
                          }}
                        >
                          {renderSpecificPreviewContent(previewContent, forcePlaying, 'current')}
                        </div>
                        
                        {/* Previous content - rendered for crossfade, hidden otherwise */}
                        {/* Keep this slot always present to maintain consistent DOM structure */}
                        <div
                          className="tw-absolute tw-inset-0 tw-pointer-events-none"
                          data-preview-slot="previous"
                          style={{ 
                            opacity: oldOpacity,
                            transition: 'none',
                            visibility: (isActivelyCrossfading && oldOpacity > 0.01) ? 'visible' : 'hidden',
                            zIndex: 2
                          }}
                        >
                          {/* Only render previous content if we have it, to avoid unnecessary component creation */}
                          {previousPreviewContent && renderSpecificPreviewContent(previousPreviewContent, forcePlaying, 'previous')}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* 360 spherical preview (shown when 360 mode is active and source canvas is ready) */}
                {is360PreviewMode && isEquirectangular && sphereSourceCanvas && (
                  <div
                    className="tw-w-full tw-h-full"
                    data-360-preview="true"
                    style={
                      (isPreviewFullscreen || fsFallbackActive)
                        ? ({
                            width: previewSize.width || '100%',
                            height: previewSize.height || '100dvh',
                            maxWidth: '100%',
                            maxHeight: '100dvh'
                          } as any)
                        : ({
                            width: previewSize.width || '100%',
                            height: previewSize.height || '100%'
                          } as any)
                    }
                  >
                    <Equirectangular360Preview
                      key={`360-preview-${compositionSettings?.width || 1920}x${compositionSettings?.height || 1080}`}
                      sourceCanvas={sphereSourceCanvas}
                      width={compositionSettings?.width || 1920}
                      height={compositionSettings?.height || 1080}
                      isPlaying={isPlaying || isGlobalPlaying}
                      initialFov={75}
                      enableZoom={true}
                      enablePan={true}
                      autoRotate={false}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Layer Options / Global - Bottom Center */}
            <div className="tw-flex-1 tw-min-w-[260px] tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-flex tw-flex-col tw-h-full tw-overflow-hidden">
              <div className="tw-border-b tw-border-neutral-800 tw-px-3 tw-py-2">
                <Tabs value={middlePanelTab} onValueChange={(value) => { setMiddlePanelTab(value as 'global' | 'layer' | 'sequence'); try { localStorage.setItem('vj-ui-middle-tab', value); } catch {} }} className="tw-w-full">
                  <TabsList className={`tw-grid tw-w-full ${showTimeline ? 'tw-grid-cols-2' : 'tw-grid-cols-3'}`}>
                    <TabsTrigger value="global">Global</TabsTrigger>
                    <TabsTrigger value="layer">Layer</TabsTrigger>
                    {!showTimeline && (<TabsTrigger value="sequence">Sequence</TabsTrigger>)}
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
                  <ScrollArea.Viewport ref={viewportRef as any} className="vj-scroll-viewport tw-h-full tw-w-full lg:tw-overflow-visible tw-overflow-auto scroll-touch drag-scroll tw-pr-0 sm:tw-pr-3 tw-pb-8" style={{ scrollbarGutter: 'stable' }}>
                         {/* Keep tabs mounted; Sequence is hidden entirely in timeline mode */}
                         <div className={`tw-h-full ${middlePanelTab === 'global' ? '' : 'tw-hidden'}`}>
                           <GlobalEffectsTab className="tw-h-full" />
                         </div>
                         {!showTimeline && (
                           <div className={`tw-h-full ${middlePanelTab === 'sequence' ? '' : 'tw-hidden'}`}>
                             <SequenceTab />
                           </div>
                         )}
                         <div className={`tw-h-full tw-min-h-0 ${middlePanelTab === 'layer' || (middlePanelTab !== 'global' && middlePanelTab !== 'sequence') ? '' : 'tw-hidden'}`}>
                           <LayerOptions 
                             key={(effectiveSelectedLayer || selectedLayer)?.id || 'none'}
                             selectedLayer={effectiveSelectedLayer || selectedLayer}
                             onUpdateLayer={handleUpdateSelectedLayer}
                           />
                         </div>
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
                  <TabsTrigger value="files">Files</TabsTrigger>
                  <TabsTrigger value="midi">MIDI</TabsTrigger>
                  <TabsTrigger value="lfo">LFO</TabsTrigger>
                  <TabsTrigger value="ai">AI</TabsTrigger>
                </TabsList>
              </Tabs>
              </div>
               
                             {/* Tab Content */}
              <div className="tw-p-3 tw-flex-1 tw-min-h-0">
                <ScrollArea.Root className="vj-scroll-root tw-h-full" type="always">
                  <ScrollArea.Viewport className="vj-scroll-viewport tw-h-full tw-w-full tw-pr-3 tw-pb-3">
                    <Tabs value={showMediaLibrary ? String(showMediaLibrary) : (localStorage.getItem('vj-ui-right-tab') || 'effects')} onValueChange={(val) => { setShowMediaLibrary(val === 'media' ? false : (val as any)); try { localStorage.setItem('vj-ui-right-tab', String(val)); } catch {} }}>
                      <TabsContent value="effects" forceMount className="data-[state=inactive]:tw-hidden">
                        <div className="tw-space-y-2">
                          <EffectsBrowser />
                        </div>
                      </TabsContent>
                      <TabsContent value="files" forceMount className="data-[state=inactive]:tw-hidden">
                        <div className="tw-h-full">
                          <FileBrowser />
                        </div>
                      </TabsContent>
                      <TabsContent value="midi" forceMount className="data-[state=inactive]:tw-hidden">
                        <div className="midi-tab">
                          <MIDIMapper />
                        </div>
                      </TabsContent>
                      <TabsContent value="lfo" forceMount className="data-[state=inactive]:tw-hidden">
                        <div className="lfo-tab">
                          <LFOMapper 
                            selectedLayer={effectiveSelectedLayer || selectedLayer}
                            onUpdateLayer={handleUpdateSelectedLayer}
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="ai" forceMount className="data-[state=inactive]:tw-hidden">
                        <div className="tw-h-full tw-flex tw-flex-col">
                          <AIEffectsLab />
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
            {/* Add/remove layer rows across all columns (persisted, clamped 3..6) */}
            <div className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + (numRows < 6 ? "tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700" : "tw-cursor-default tw-text-neutral-500 tw-opacity-50")} onClick={numRows < 6 ? () => { setNumRows((n) => Math.min(6, n + 1)); handleContextMenuClose(); } : undefined}>Add Row</div>
            <div className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + (numRows > 3 ? "tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700" : "tw-cursor-default tw-text-neutral-500 tw-opacity-50")} onClick={numRows > 3 ? () => { setNumRows((n) => Math.max(3, n - 1)); handleContextMenuClose(); } : undefined}>Remove Row</div>
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

            {/* Clip delete (only when right-clicking a real clip) */}
            {contextMenu.layerId && !String(contextMenu.layerId).startsWith('empty-') && (
              <div
                className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                onClick={handleDeleteLayer}
              >
                Delete Clip
              </div>
            )}

            {/* Column delete (always available) */}
            {(() => {
              const sc = getCurrentScene();
              const canDelete = (sc?.columns || []).length > 1;
              return (
                <div
                  className={
                    "context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-py-3 tw-px-5 " +
                    (canDelete ? "tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700" : "tw-cursor-default tw-text-neutral-500 tw-opacity-50")
                  }
                  onClick={canDelete ? handleDeleteColumn : undefined}
                >
                  Delete Column
                </div>
              );
            })()}
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
            <div
              className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-py-3 tw-px-5"
              onClick={contextMenu.layerId && !String(contextMenu.layerId).startsWith('empty-') ? handleDeleteLayer : handleDeleteColumn}
            >
              {contextMenu.layerId && !String(contextMenu.layerId).startsWith('empty-') ? 'Delete Clip' : 'Delete Column'}
            </div>
          </div>
        )}
      </div>
    );
  }
};
