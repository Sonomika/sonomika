import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';

/**
 * Global focus mode hook that auto-selects layers when columns/clips change.
 * This hook should be used in a component that's always mounted (e.g., LayerManager).
 */
export const useFocusMode = () => {
  const {
    scenes,
    currentSceneId,
    playingColumnId,
    selectedTimelineClip,
    showTimeline,
    setSelectedLayer,
    currentTimelineSceneId,
    setSelectedTimelineClip,
  } = useStore() as any;

  // Read focus mode settings from localStorage
  const getFocusMode = () => {
    try {
      const v = localStorage.getItem('vj-focus-mode');
      return v === null ? false : v === '1';
    } catch {
      return false;
    }
  };

  const getFocusRow = () => {
    try {
      const v = parseInt(localStorage.getItem('vj-focus-row') || '2', 10);
      return Math.max(1, Math.min(10, Number.isFinite(v) ? v : 2));
    } catch {
      return 2;
    }
  };

  // Helper to get active clips at a given time from timeline tracks
  const getClipsAtTime = (time: number, tracks: any[]) => {
    const activeClips: any[] = [];
    tracks.forEach((track, trackIndex) => {
      track.clips?.forEach((clip: any) => {
        const clipEndTime = (clip.startTime || 0) + (clip.duration || 0);
        if (time >= (clip.startTime || 0) && time < clipEndTime) {
          // Calculate track number: try parsing from ID, fallback to index+1
          const trackIdParts = (track.id || 'track-1').split('-');
          const trackIdNum = parseInt(trackIdParts[1] || '', 10);
          const trackNum = Number.isFinite(trackIdNum) ? trackIdNum : (trackIndex + 1);
          
          activeClips.push({
            ...clip,
            trackId: track.id,
            trackNum,
          });
        }
      });
    });
    return activeClips;
  };

  // Track previous column/clip to detect changes
  const prevPlayingColumnIdRef = useRef<string | null>(null);
  const prevTimelineClipIdRef = useRef<string | null>(null);
  const prevActiveClipIdRef = useRef<string | null>(null);

  useEffect(() => {
    const focusMode = getFocusMode();
    if (!focusMode) {
      // Reset refs when focus mode is disabled
      prevPlayingColumnIdRef.current = null;
      prevTimelineClipIdRef.current = null;
      prevActiveClipIdRef.current = null;
      return;
    }

    if (showTimeline) {
      // Timeline mode: focus when clip changes (both manual selection and during playback)
      const currentClipId = selectedTimelineClip?.id || null;
      const prevClipId = prevTimelineClipIdRef.current;
      
      if (currentClipId && currentClipId !== prevClipId) {
        // Manual clip selection
        const pseudoLayerId = `timeline-layer-${currentClipId}`;
        if (typeof setSelectedLayer === 'function') {
          setTimeout(() => {
            setSelectedLayer(pseudoLayerId);
          }, 0);
        }
        prevTimelineClipIdRef.current = currentClipId;
        prevActiveClipIdRef.current = currentClipId;
      } else if (!currentClipId) {
        prevTimelineClipIdRef.current = null;
      }

      // Also listen to timelineTick events to detect clip changes during playback
      // Throttle updates to avoid too frequent changes (check every ~200ms)
      let lastUpdateTime = 0;
      const UPDATE_THROTTLE_MS = 200;
      
      const handleTimelineTick = (e: any) => {
        // Check focus mode each time (not captured value)
        if (!getFocusMode()) return;
        
        // Throttle updates
        const now = Date.now();
        if (now - lastUpdateTime < UPDATE_THROTTLE_MS) return;
        lastUpdateTime = now;
        
        try {
          const time = e.detail?.time;
          if (typeof time !== 'number') return;
          
          // Get current scene ID from store (not closure) to handle scene changes during playback
          const state = (useStore as any).getState();
          const sceneId = state?.currentTimelineSceneId || currentTimelineSceneId;
          if (!sceneId) return;
          
          const tracksData = localStorage.getItem(`timeline-tracks-${sceneId}`);
          if (!tracksData) return;
          
          const tracks = JSON.parse(tracksData);
          const activeClips = getClipsAtTime(time, tracks || []);
          
          if (activeClips.length > 0) {
            const focusRow = getFocusRow();
            // Focus row corresponds to track number (1-based)
            // Find clip on the track matching focusRow, or use first active clip
            const targetClip = activeClips.find((clip: any) => clip.trackNum === focusRow) || activeClips[0];
            const activeClipId = targetClip?.id;
            
            if (activeClipId && activeClipId !== prevActiveClipIdRef.current) {
              const pseudoLayerId = `timeline-layer-${activeClipId}`;
              if (typeof setSelectedLayer === 'function') {
                setSelectedLayer(pseudoLayerId);
                // Also update selectedTimelineClip to keep UI in sync
                if (typeof setSelectedTimelineClip === 'function' && targetClip) {
                  try {
                    const trackNum = targetClip.trackNum || parseInt((targetClip.trackId || 'track-1').split('-')[1] || '1', 10);
                    setSelectedTimelineClip({
                      id: targetClip.id,
                      trackId: targetClip.trackId,
                      startTime: targetClip.startTime || 0,
                      duration: targetClip.duration || 0,
                      data: targetClip,
                      layerId: null,
                      trackNum,
                    });
                  } catch {}
                }
              }
              prevActiveClipIdRef.current = activeClipId;
            }
          } else {
            if (prevActiveClipIdRef.current !== null) {
              prevActiveClipIdRef.current = null;
            }
          }
        } catch (err) {
          console.warn('[useFocusMode] Error in timelineTick handler:', err);
        }
      };

      document.addEventListener('timelineTick', handleTimelineTick as any);
      return () => {
        document.removeEventListener('timelineTick', handleTimelineTick as any);
      };
    } else {
      // Column mode: focus layer at specified row when playing column changes
      const currentColumnId = playingColumnId;
      const prevColumnId = prevPlayingColumnIdRef.current;
      const focusRow = getFocusRow();
      
      // Trigger when column changes (including initial selection when prevColumnId is null)
      if (currentColumnId && currentColumnId !== prevColumnId) {
        try {
          const scene = (scenes || []).find((s: any) => s.id === currentSceneId);
          if (scene) {
            const column = (scene.columns || []).find((c: any) => c.id === currentColumnId);
            if (column) {
              const layers = column.layers || [];
              // Find layer by layerNum (focusRow is 1-based and corresponds to layerNum)
              // Match by layerNum first, then fallback to name pattern, then fallback to array index
              const targetLayer = layers.find((l: any) => l.layerNum === focusRow || l.name === `Layer ${focusRow}`) 
                || layers[Math.max(0, Math.min(layers.length - 1, focusRow - 1))];
              if (targetLayer && typeof setSelectedLayer === 'function') {
                setSelectedLayer(targetLayer.id);
              }
            }
          }
        } catch (err) {
          console.warn('[useFocusMode] Error focusing layer:', err);
        }
        prevPlayingColumnIdRef.current = currentColumnId;
      } else if (!currentColumnId) {
        prevPlayingColumnIdRef.current = null;
      }
    }
  }, [showTimeline, playingColumnId, selectedTimelineClip?.id, currentSceneId, currentTimelineSceneId, scenes, setSelectedLayer, setSelectedTimelineClip]);
};

