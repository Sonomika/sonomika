import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/store';
import { EffectLoader } from '../utils/EffectLoader';

// Context Menu Component
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onDelete }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        backgroundColor: '#2a2a2a',
        border: '1px solid #444',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        minWidth: '120px',
        padding: '4px 0',
      }}
    >
      <button
        onClick={handleDelete}
        style={{
          width: '100%',
          padding: '8px 12px',
          backgroundColor: 'transparent',
          border: 'none',
          color: '#ff6b6b',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#444';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        🗑️ Delete
      </button>
    </div>
  );
};

// Effect Preview Component
interface EffectPreviewProps {
  effectName: string;
  effectId: string;
  dimensions: { width: number; height: number };
}

const EffectPreview: React.FC<EffectPreviewProps> = ({ effectName, effectId, dimensions }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const effectRef = useRef<any>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create effect instance
    try {
      effectRef.current = EffectLoader.getInstance().createEffect(
        effectName,
        dimensions.width,
        dimensions.height
      );
    } catch (error) {
      console.warn(`Could not create effect ${effectName}:`, error);
      return;
    }

    let time = 0;
    const animate = (deltaTime: number) => {
      if (!effectRef.current) return;

      // Render the effect
      effectRef.current.render(deltaTime);
      
      // Draw the effect to canvas
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      ctx.drawImage(effectRef.current.canvas, 0, 0);
      
      time += deltaTime;
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (effectRef.current) {
        effectRef.current.cleanup();
      }
    };
  }, [effectName, dimensions]);

  return (
    <div className="effect-preview">
      <canvas 
        ref={canvasRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover',
          borderRadius: '4px'
        }} 
      />
    </div>
  );
};

interface TimelineProps {
  onClose: () => void;
  onPreviewUpdate?: (previewContent: any) => void;
}

interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'effect';
  clips: TimelineClip[];
}

interface TimelineClip {
  id: string;
  startTime: number;
  duration: number;
  asset: any;
  type: 'video' | 'effect';
  name: string;
}

export const Timeline: React.FC<TimelineProps> = ({ onClose, onPreviewUpdate }) => {
  const { bpm, setBpm, currentSceneId } = useStore() as any;
  
  // Load saved timeline data from localStorage for current scene
  const loadTimelineData = (): TimelineTrack[] => {
    try {
      const savedData = localStorage.getItem(`timeline-tracks-${currentSceneId}`);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        console.log(`Loaded timeline data for scene ${currentSceneId} from localStorage:`, parsedData);
        return parsedData;
      }
    } catch (error) {
      console.error('Error loading timeline data:', error);
    }
    
    // Default tracks if no saved data
    return [
    { id: 'track-1', name: 'Track 1', type: 'video', clips: [] },
    { id: 'track-2', name: 'Track 2', type: 'video', clips: [] },
    { id: 'track-3', name: 'Track 3', type: 'effect', clips: [] }
    ];
  };

  const [tracks, setTracks] = useState<TimelineTrack[]>(loadTimelineData);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(60); // 60 seconds default
  
  // Reload timeline data when scene changes
  useEffect(() => {
    console.log(`Scene changed to ${currentSceneId}, reloading timeline data`);
    const newTracks = loadTimelineData();
    setTracks(newTracks);
    setCurrentTime(0);
    setSelectedClip(null);
    // Clear any existing playback
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    setIsPlaying(false);
  }, [currentSceneId]);
  
  // Save timeline data to localStorage for current scene
  const saveTimelineData = (tracksData: TimelineTrack[]) => {
    try {
      localStorage.setItem(`timeline-tracks-${currentSceneId}`, JSON.stringify(tracksData));
      console.log(`Saved timeline data for scene ${currentSceneId} to localStorage:`, tracksData);
    } catch (error) {
      console.error('Error saving timeline data:', error);
    }
  };

  // Clear timeline data from localStorage for current scene
  const clearTimelineData = () => {
    try {
      localStorage.removeItem(`timeline-tracks-${currentSceneId}`);
      console.log(`Cleared timeline data for scene ${currentSceneId} from localStorage`);
    } catch (error) {
      console.error('Error clearing timeline data:', error);
    }
  };

  // Clear all timeline data for all scenes (for debugging/reset)
  const clearAllTimelineData = () => {
    try {
      // Get all localStorage keys that start with 'timeline-tracks-'
      const keys = Object.keys(localStorage);
      const timelineKeys = keys.filter(key => key.startsWith('timeline-tracks-'));
      timelineKeys.forEach(key => localStorage.removeItem(key));
      console.log('Cleared all timeline data for all scenes');
    } catch (error) {
      console.error('Error clearing all timeline data:', error);
    }
  };

  // Custom setTracks function that also saves to localStorage
  const updateTracks = (newTracks: TimelineTrack[] | ((prev: TimelineTrack[]) => TimelineTrack[])) => {
    setTracks(prevTracks => {
      const updatedTracks = typeof newTracks === 'function' ? newTracks(prevTracks) : newTracks;
      saveTimelineData(updatedTracks);
      return updatedTracks;
    });
  };
  
  // Calculate the earliest clip start time to sync playhead
  const getEarliestClipTime = () => {
    let earliestTime = 0;
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (clip.startTime < earliestTime || earliestTime === 0) {
          earliestTime = clip.startTime;
        }
      });
    });
    return earliestTime;
  };
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [draggedAsset, setDraggedAsset] = useState<any>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [playbackInterval, setPlaybackInterval] = useState<NodeJS.Timeout | null>(null);
  const [intervalCounter, setIntervalCounter] = useState(0);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    clipId: string | null;
    trackId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    clipId: null,
    trackId: null,
  });
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const wavesurferRef = useRef<any>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Initialize wavesurfer
  useEffect(() => {
    const initWaveSurfer = async () => {
      if (waveformRef.current && !wavesurferRef.current) {
        try {
          const WaveSurfer = (await import('wavesurfer.js')).default;
          
          wavesurferRef.current = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: '#4F4A85',
            progressColor: '#383351',
            cursorColor: '#FF6B6B',
            barWidth: 2,
            barGap: 1,
            height: 100,
            normalize: true,
            interact: true,
            hideScrollbar: true,
          });

          // Event listeners
          wavesurferRef.current.on('ready', () => {
            console.log('WaveSurfer is ready');
            setDuration(wavesurferRef.current!.getDuration());
          });

          wavesurferRef.current.on('audioprocess', (currentTime: number) => {
            // Disable WaveSurfer's automatic timeline control completely
            // We'll control the timeline manually and sync WaveSurfer to our timeline
            console.log('WaveSurfer audioprocess event - ignoring to prevent conflicts');
          });

          wavesurferRef.current.on('finish', () => {
            console.log('Audio finished, stopping timeline playback');
            setIsPlaying(false);
            setCurrentTime(0);
          });

          wavesurferRef.current.on('interaction', () => {
            console.log('WaveSurfer interaction detected');
            // Don't automatically start playing on interaction
            // Let the user control it explicitly
          });
        } catch (error) {
          console.error('Error initializing WaveSurfer:', error);
        }
      }
    };

    initWaveSurfer();

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, []);

  // Handle file upload for waveform
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      
      if (wavesurferRef.current) {
        try {
          await wavesurferRef.current.loadBlob(file);
          setDuration(wavesurferRef.current.getDuration());
        } catch (error) {
          console.error('Error loading audio file:', error);
        }
      }
    }
  };

  // Handle drag and drop for waveform
  const handleWaveformDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    console.log('Waveform drop event triggered');
    
    // Check for files first (direct file drop)
    const files = e.dataTransfer.files;
    console.log('Files dropped:', files.length);
    if (files.length > 0) {
      const file = files[0];
      console.log('File type:', file.type);
      if (file.type.startsWith('audio/')) {
        console.log('Processing audio file:', file.name);
        setAudioFile(file);
        
        if (wavesurferRef.current) {
          try {
            await wavesurferRef.current.loadBlob(file);
            setDuration(wavesurferRef.current.getDuration());
            console.log('Successfully loaded audio file into WaveSurfer');
          } catch (error) {
            console.error('Error loading audio file:', error);
          }
        } else {
          console.error('WaveSurfer not initialized');
        }
      } else {
        console.log('File is not audio type:', file.type);
      }
      return;
    }
    
    // Check for MediaLibrary asset data
    const assetData = e.dataTransfer.getData('application/json');
    console.log('Asset data received:', assetData);
    if (assetData) {
      try {
        const asset = JSON.parse(assetData);
        console.log('Parsed asset:', asset);
        if (asset.type === 'audio') {
          console.log('Processing audio asset:', asset.name);
          // Handle base64 data from MediaLibrary
          if (asset.base64Data) {
            console.log('Processing base64 data for:', asset.name);
            try {
              // Convert base64 to blob
              const base64Response = await fetch(asset.base64Data);
              const blob = await base64Response.blob();
              console.log('Successfully converted base64 to blob');
              setAudioFile(new File([blob], asset.name, { type: 'audio/mpeg' }));
              
              if (wavesurferRef.current) {
                await wavesurferRef.current.loadBlob(blob);
                setDuration(wavesurferRef.current.getDuration());
                console.log('Successfully loaded audio into WaveSurfer');
              }
            } catch (error) {
              console.error('Error loading audio from base64:', error);
            }
          }
          // Handle blob URL from MediaLibrary
          else if (asset.path && asset.path.startsWith('blob:')) {
            try {
              const response = await fetch(asset.path);
              const blob = await response.blob();
              setAudioFile(new File([blob], asset.name, { type: 'audio/mpeg' }));
              
              if (wavesurferRef.current) {
                await wavesurferRef.current.loadBlob(blob);
                setDuration(wavesurferRef.current.getDuration());
              }
            } catch (error) {
              console.error('Error loading audio from blob URL:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error parsing asset data:', error);
      }
    }
  };

  const handleWaveformDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleWaveformDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
  };

  // Handle drag and drop from media library
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    
    // Add visual feedback
    const target = e.currentTarget as HTMLElement;
    target.classList.add('drag-over');
    
    console.log('Drag over timeline track');
    console.log('DataTransfer types:', e.dataTransfer.types);
    console.log('DataTransfer items:', e.dataTransfer.items);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Remove visual feedback
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  };

  const handleDragStart = (e: React.DragEvent) => {
    const assetData = e.dataTransfer.getData('application/json');
    if (assetData) {
      try {
        const asset = JSON.parse(assetData);
        setDraggedAsset(asset);
      } catch (error) {
        console.error('Error parsing dragged asset:', error);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, trackId: string, time: number) => {
    e.preventDefault();
    
    console.log('Drop event triggered on track:', trackId);
    
    // Remove visual feedback
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
    
    const assetData = e.dataTransfer.getData('application/json');
    console.log('Asset data from drop:', assetData);
    
    if (assetData) {
      try {
        const asset = JSON.parse(assetData);
        console.log('Parsed asset:', asset);
        const track = tracks.find(t => t.id === trackId);
        
        if (track) {
          // Handle effects from EffectsBrowser (they have isEffect: true)
          if (asset.isEffect) {
            asset.type = 'effect';
          }
          
          // Check if asset type is video or effect (no audio allowed)
          if (asset.type !== 'video' && asset.type !== 'effect') {
            console.warn('This track only accepts video and effect files');
            return; // Reject the drop
          }
          
          // Determine clip type based on asset type
          let clipType: 'video' | 'effect' = 'video';
          if (asset.type === 'effect') {
            clipType = 'effect';
          } else if (asset.type === 'video') {
            clipType = 'video';
          }
          
          // Calculate sequential placement
          let newStartTime = 0;
          if (track.clips.length > 0) {
            // Find the end time of the last clip
            const lastClip = track.clips[track.clips.length - 1];
            newStartTime = lastClip.startTime + lastClip.duration;
          }
          
          const newClip: TimelineClip = {
            id: `clip-${Date.now()}`,
            startTime: newStartTime,
            duration: asset.duration || 5, // Default 5 seconds
            asset: asset,
            type: clipType,
            name: asset.name || 'Untitled Clip'
          };

          const updatedTracks = tracks.map(t => 
            t.id === trackId 
              ? { ...t, clips: [...t.clips, newClip] }
              : t
          );
          
          updateTracks(updatedTracks);
          console.log('Successfully added clip to timeline:', newClip);
        }
      } catch (error) {
        console.error('Error adding clip to timeline:', error);
      }
    } else {
      console.warn('No asset data found in drop event');
    }
  };

  // Handle click on track to place clip at specific time
  const handleTrackClick = (e: React.MouseEvent, trackId: string) => {
    if (draggedAsset) {
      const track = tracks.find(t => t.id === trackId);
      if (track) {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickTime = (clickX / rect.width) * duration;
        
        // Find the next available slot after the clicked time
        let newStartTime = clickTime;
        const overlappingClips = track.clips.filter(clip => 
          (clickTime >= clip.startTime && clickTime < clip.startTime + clip.duration) ||
          (clickTime < clip.startTime && clickTime + (draggedAsset.duration || 5) > clip.startTime)
        );
        
        if (overlappingClips.length > 0) {
          // Place after the last overlapping clip
          const lastOverlappingClip = overlappingClips[overlappingClips.length - 1];
          newStartTime = lastOverlappingClip.startTime + lastOverlappingClip.duration;
        }
        
        // Handle effects from EffectsBrowser (they have isEffect: true)
        if (draggedAsset.isEffect) {
          draggedAsset.type = 'effect';
        }
        
        // Determine clip type based on asset type
        let clipType: 'video' | 'effect' = 'video';
        if (draggedAsset.type === 'effect') {
          clipType = 'effect';
        } else if (draggedAsset.type === 'video') {
          clipType = 'video';
        }
        
        const newClip: TimelineClip = {
          id: `clip-${Date.now()}`,
          startTime: newStartTime,
          duration: draggedAsset.duration || 5,
          asset: draggedAsset,
          type: clipType,
          name: draggedAsset.name || 'Untitled Clip'
        };

        const updatedTracks = tracks.map(t => 
          t.id === trackId 
            ? { ...t, clips: [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime) }
            : t
        );
        
        updateTracks(updatedTracks);
        setDraggedAsset(null);
      }
    }
  };







  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTrackColor = (type: string) => {
    switch (type) {
      case 'video': return '#2196F3';
      case 'effect': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  // Get clips that should be playing at the current time
  const getClipsAtTime = (time: number) => {
    const activeClips: any[] = [];
    
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        const clipEndTime = clip.startTime + clip.duration;
        if (time >= clip.startTime && time < clipEndTime) {
          activeClips.push({
            ...clip,
            trackType: track.type,
            trackId: track.id,
            relativeTime: time - clip.startTime
          });
        }
      });
    });
    
    return activeClips;
  };

  // Render timeline preview content
  const renderTimelinePreview = (activeClips: any[]) => {
    if (activeClips.length === 0) {
      return (
        <div className="timeline-preview-empty">
          <div className="timeline-preview-placeholder">
            <div className="placeholder-text">No clips playing at current time</div>
            <div className="placeholder-time">{formatTime(currentTime)}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="timeline-preview-content">
        {activeClips.map((clip, index) => (
          <div key={`${clip.id}-${index}`} className="timeline-preview-clip">
            <div className="clip-info">
              <div className="clip-name">{clip.name}</div>
              <div className="clip-track">Track {clip.trackId.split('-')[1]}</div>
              <div className="clip-time">{formatTime(clip.relativeTime)}</div>
            </div>
            {clip.asset && (
              <div className="clip-preview">
                {clip.asset.type === 'video' && (
                  <video
                    src={clip.asset.path}
                    autoPlay
                    muted
                    loop
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {clip.asset.type === 'effect' && (
                  <EffectPreview 
                    effectName={clip.asset.name}
                    effectId={clip.asset.id}
                    dimensions={{ width: 200, height: 150 }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Start timeline playback
  const startTimelinePlayback = () => {
    console.log('Starting timeline playback, current time:', currentTime, 'duration:', duration);
    console.log('🎵 Timeline tracks:', tracks);
    console.log('🎵 Earliest clip time:', getEarliestClipTime());
    
    // Clear any existing interval first
    if (playbackInterval) {
      console.log('Clearing existing interval');
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    
    // Always start from 0 when play button is clicked
    console.log('Resetting timeline to 0 seconds for playback start');
    setCurrentTime(0);
    
    // Get earliest clip time for end-of-timeline reset
    const earliestClipTime = getEarliestClipTime();
    
    console.log('Creating new interval');
    const interval = setInterval(() => {
      console.log('🔄 Interval callback executed at:', Date.now());
      setIntervalCounter(prev => prev + 1);
      setCurrentTime(prevTime => {
        const newTime = prevTime + 0.05; // 20fps update rate for smoother movement
        console.log('🕒 Timeline time update:', prevTime, '->', newTime, 'duration:', duration);
        if (newTime >= duration) {
          // End of timeline reached
          console.log('⏹️ Timeline reached end, stopping playback');
          setIsPlaying(false);
          // Reset to 0 if no clips, otherwise reset to earliest clip
          const resetTime = earliestClipTime > 0 ? earliestClipTime : 0;
          setCurrentTime(resetTime);
          clearInterval(interval);
          setPlaybackInterval(null);
          return resetTime;
        }
        console.log('✅ Returning new time:', newTime);
        return newTime;
      });
    }, 50); // 50ms = 20fps for smoother movement
    
    console.log('Setting playback interval:', interval);
    setPlaybackInterval(interval);
    setIsPlaying(true); // Ensure playing state is set
    console.log('Timeline playback started, isPlaying set to true');
  };

  // Stop timeline playback
  const stopTimelinePlayback = () => {
    console.log('Stopping timeline playback');
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    setIsPlaying(false);
    console.log('Timeline playback stopped, isPlaying set to false');
  };

  // Handle play button click
  const handlePlayButtonClick = async () => {
    console.log('Play button clicked, current isPlaying:', isPlaying);
    
    // Force a small delay to ensure state is properly updated
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (isPlaying) {
      console.log('Stopping timeline playback');
      stopTimelinePlayback();
      
      // Don't automatically pause WaveSurfer - let our timeline control it
      console.log('Timeline playback stopped - WaveSurfer will be synced to timeline');
    } else {
      console.log('Starting timeline playback');
      startTimelinePlayback();
      
      // Don't automatically start WaveSurfer playback - let our timeline control it
      // WaveSurfer will be synced to our timeline position instead
      console.log('Timeline playback started - WaveSurfer will be synced to timeline');
    }
  };

  // Context menu functions
  const handleClipRightClick = (e: React.MouseEvent, clipId: string, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      clipId,
      trackId,
    });
  };

  const handleContextMenuClose = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      clipId: null,
      trackId: null,
    });
  };

  const handleDeleteClip = () => {
    if (contextMenu.clipId && contextMenu.trackId) {
      updateTracks(prevTracks => 
        prevTracks.map(track => {
          if (track.id === contextMenu.trackId) {
            return {
              ...track,
              clips: track.clips.filter(clip => clip.id !== contextMenu.clipId)
            };
          }
          return track;
        })
      );
      
      // Clear selection if the deleted clip was selected
      if (selectedClip === contextMenu.clipId) {
        setSelectedClip(null);
      }
      
      console.log(`Deleted clip ${contextMenu.clipId} from track ${contextMenu.trackId}`);
    }
  };

  // Force refresh play state when component mounts or when needed
  useEffect(() => {
    // Ensure play state is consistent with interval state
    if (!playbackInterval && isPlaying) {
      console.log('Fixing inconsistent play state - clearing isPlaying');
      setIsPlaying(false);
    }
  }, [playbackInterval, isPlaying]);

  // Debug currentTime changes
  useEffect(() => {
    console.log('🕒 currentTime changed to:', currentTime);
    
    // Sync WaveSurfer position with our timeline when playing
    if (isPlaying && wavesurferRef.current) {
      try {
        wavesurferRef.current.setTime(currentTime);
        console.log('🔄 Synced WaveSurfer to timeline time:', currentTime);
      } catch (error) {
        console.warn('Error syncing WaveSurfer time:', error);
      }
    }
  }, [currentTime, isPlaying]);

  // Update preview content when timeline is playing
  useEffect(() => {
    if (onPreviewUpdate) {
      const activeClips = getClipsAtTime(currentTime);
      console.log('Timeline preview update - Time:', currentTime, 'Playing:', isPlaying, 'Active clips:', activeClips.length);
      
      if (isPlaying && activeClips.length > 0) {
        // Send timeline preview content to parent
        const timelinePreviewContent = {
          type: 'timeline',
          tracks: tracks,
          currentTime: currentTime,
          duration: duration,
          isPlaying: true,
          activeClips: activeClips
        };
        
        console.log('Sending timeline preview content:', timelinePreviewContent);
        onPreviewUpdate(timelinePreviewContent);
      } else {
        // Clear preview when not playing or no active clips
        console.log('Clearing timeline preview');
        onPreviewUpdate(null);
      }
    }
  }, [currentTime, isPlaying, tracks, duration, onPreviewUpdate]);

  // Debug currentTime changes
  useEffect(() => {
    console.log('currentTime changed to:', currentTime);
  }, [currentTime]);

  // Debug isPlaying changes
  useEffect(() => {
    console.log('isPlaying changed to:', isPlaying);
  }, [isPlaying]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (playbackInterval) {
        clearInterval(playbackInterval);
      }
    };
  }, [playbackInterval]);

  return (
    <div className="timeline-container">
      <style>
        {`
          
          .context-menu {
            position: fixed;
            background-color: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            z-index: 1000;
            min-width: 120px;
            padding: 4px 0;
            font-family: inherit;
          }
          
          .context-menu button {
            width: 100%;
            padding: 8px 12px;
            background-color: transparent;
            border: none;
            color: #ff6b6b;
            cursor: pointer;
            text-align: left;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background-color 0.2s ease;
          }
          
          .context-menu button:hover {
            background-color: #444;
          }
          
                     .timeline-clip {
             user-select: none;
           }
           
           /* Professional Video Editor Controls */
           .timeline-header {
             display: flex;
             flex-direction: column;
             gap: 12px;
             padding: 16px;
             background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
             border-bottom: 1px solid #444;
             border-radius: 8px 8px 0 0;
           }
           
           .timeline-title h2 {
             margin: 0;
             color: #fff;
             font-size: 18px;
             font-weight: 600;
           }
           
           
           
           .transport-buttons {
             display: flex;
             align-items: center;
             gap: 4px;
           }
           
           .transport-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 36px;
             height: 36px;
             background: #333;
             border: 1px solid #555;
             border-radius: 4px;
             color: #fff;
             cursor: pointer;
             transition: all 0.2s ease;
             font-size: 12px;
           }
           
           .transport-btn:hover {
             background: #444;
             border-color: #666;
             transform: translateY(-1px);
           }
           
           .transport-btn:active {
             transform: translateY(0);
           }
           
           .play-btn {
             background: #007acc;
             border-color: #0099ff;
             width: 44px;
             height: 44px;
           }
           
           .play-btn:hover {
             background: #0099ff;
             border-color: #00aaff;
           }
           
           .play-btn.playing {
             background: #ff6b35;
             border-color: #ff8c42;
           }
           
           .play-btn.playing:hover {
             background: #ff8c42;
             border-color: #ffa052;
           }
           
           .time-display {
             display: flex;
             align-items: center;
             gap: 8px;
             font-family: 'Courier New', monospace;
             font-size: 14px;
             font-weight: 600;
             color: #fff;
             background: rgba(0, 0, 0, 0.5);
             padding: 8px 12px;
             border-radius: 4px;
             border: 1px solid #555;
             min-width: 120px;
             justify-content: center;
           }
           
           .current-time {
             color: #00ff88;
           }
           
           .time-separator {
             color: #888;
           }
           
           .total-time {
             color: #ccc;
           }
           
                       .timeline-controls-single-line {
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 12px;
              background: rgba(0, 0, 0, 0.3);
              border-radius: 6px;
              border: 1px solid #444;
              flex-wrap: nowrap;
              overflow-x: auto;
            }
            
            .timeline-controls {
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 12px;
              background: rgba(0, 0, 0, 0.2);
              border-radius: 6px;
              border: 1px solid #444;
            }
           
           .zoom-controls {
             display: flex;
             align-items: center;
             gap: 8px;
             background: rgba(0, 0, 0, 0.3);
             padding: 6px 10px;
             border-radius: 4px;
             border: 1px solid #555;
           }
           
           .zoom-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 28px;
             height: 28px;
             background: #333;
             border: 1px solid #555;
             border-radius: 3px;
             color: #fff;
             cursor: pointer;
             transition: all 0.2s ease;
           }
           
           .zoom-btn:hover {
             background: #444;
             border-color: #666;
           }
           
           .zoom-level {
             color: #fff;
             font-size: 12px;
             font-weight: 600;
             min-width: 30px;
             text-align: center;
           }
           
           .timeline-scrubber {
             flex: 1;
             display: flex;
             align-items: center;
           }
           
           .scrubber-slider {
             width: 100%;
             height: 6px;
             background: #444;
             border-radius: 3px;
             outline: none;
             cursor: pointer;
             -webkit-appearance: none;
             appearance: none;
           }
           
           .scrubber-slider::-webkit-slider-thumb {
             -webkit-appearance: none;
             appearance: none;
             width: 16px;
             height: 16px;
             background: #007acc;
             border: 2px solid #fff;
             border-radius: 50%;
             cursor: pointer;
             box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
           }
           
           .scrubber-slider::-moz-range-thumb {
             width: 16px;
             height: 16px;
             background: #007acc;
             border: 2px solid #fff;
             border-radius: 50%;
             cursor: pointer;
             box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
           }
           
           .action-buttons {
             display: flex;
             align-items: center;
             gap: 8px;
           }
           
           .action-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 32px;
             height: 32px;
             background: #333;
             border: 1px solid #555;
             border-radius: 4px;
             color: #fff;
             cursor: pointer;
             transition: all 0.2s ease;
           }
           
           .action-btn:hover {
             background: #444;
             border-color: #666;
           }
           
           .clear-btn {
             background: #d32f2f;
             border-color: #f44336;
           }
           
           .clear-btn:hover {
             background: #f44336;
             border-color: #ff5722;
          }
        `}
      </style>
      <div className="timeline-header">
         <div className="timeline-title">
        <h2>Timeline</h2>
         </div>
         
         {/* All Controls on One Line */}
         <div className="timeline-controls-single-line">
           {/* Transport Controls */}
           <div className="transport-buttons">
             <button 
               onClick={() => setCurrentTime(0)}
               className="transport-btn"
               title="Go to Start"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M8 5v14l11-7z"/>
                 <path d="M6 5h2v14H6z"/>
               </svg>
             </button>
             
             <button 
               onClick={() => {
                 const newTime = Math.max(0, currentTime - 1);
                 setCurrentTime(newTime);
               }}
               className="transport-btn"
               title="Step Backward"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
               </svg>
             </button>
             
                     <button 
                           onClick={handlePlayButtonClick}
               className={`transport-btn play-btn ${isPlaying ? 'playing' : ''}`}
               title={isPlaying ? 'Pause' : 'Play'}
             >
               {isPlaying ? (
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                 </svg>
               ) : (
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M8 5v14l11-7z"/>
                 </svg>
               )}
           </button>
             
          <button 
            onClick={() => {
                 const newTime = Math.min(duration, currentTime + 1);
                 setCurrentTime(newTime);
               }}
               className="transport-btn"
               title="Step Forward"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M4 18l8.5-6L4 6v12zm10 0V6h2v12h-2z"/>
               </svg>
          </button>
             
             <button 
               onClick={() => setCurrentTime(duration)}
               className="transport-btn"
               title="Go to End"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M8 5v14l11-7z"/>
                 <path d="M16 5h2v14h-2z"/>
               </svg>
             </button>
           </div>
           
           {/* Time Display */}
           <div className="time-display">
             <span className="current-time">{formatTime(currentTime)}</span>
             <span className="time-separator">/</span>
             <span className="total-time">{formatTime(duration)}</span>
           </div>
           
           {/* Zoom Controls */}
           <div className="zoom-controls">
             <button 
               onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
               className="zoom-btn"
               title="Zoom Out"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M19 13H5v-2h14v2z"/>
               </svg>
             </button>
             
             <span className="zoom-level">{zoom.toFixed(1)}x</span>
             
             <button 
               onClick={() => setZoom(Math.min(5, zoom + 0.1))}
               className="zoom-btn"
               title="Zoom In"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
               </svg>
             </button>
           </div>
           
           {/* Timeline Scrubber */}
           <div className="timeline-scrubber">
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={(e) => {
              const newTime = parseFloat(e.target.value);
              setCurrentTime(newTime);
               }}
               className="scrubber-slider"
            style={{ 
                 background: `linear-gradient(to right, #007acc 0%, #007acc ${(currentTime / duration) * 100}%, #444 ${(currentTime / duration) * 100}%, #444 100%)`
               }}
             />
           </div>
           
           {/* Action Buttons */}
           <div className="action-buttons">
             <button 
               onClick={() => {
                 const earliestTime = getEarliestClipTime();
                 if (earliestTime > 0) {
                   setCurrentTime(earliestTime);
                 }
               }}
               className="action-btn"
               title="Go to First Clip"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
               </svg>
             </button>
             
             <button 
               onClick={() => {
                 if (window.confirm(`Clear all timeline clips for the current scene?`)) {
                   clearTimelineData();
                   updateTracks([
                     { id: 'track-1', name: 'Track 1', type: 'video', clips: [] },
                     { id: 'track-2', name: 'Track 2', type: 'video', clips: [] },
                     { id: 'track-3', name: 'Track 3', type: 'effect', clips: [] }
                   ]);
                   setCurrentTime(0);
                   setSelectedClip(null);
                 }
               }}
               className="action-btn clear-btn"
               title="Clear Timeline"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
               </svg>
             </button>
           </div>
        </div>
      </div>

      <div className="timeline-content">
        {/* Waveform Display */}
        <div className="waveform-container">
          <div className="waveform-header">
            <h3>Waveform</h3>
          </div>
          <div 
            className="waveform-display"
            onDrop={handleWaveformDrop}
            onDragOver={handleWaveformDragOver}
            onDragLeave={handleWaveformDragLeave}
          >
            <div ref={waveformRef} className="wavesurfer-container"></div>
            <div className="waveform-drop-overlay">
              <div className="drop-hint">Drop audio files here</div>
            </div>
          </div>
        </div>

        {/* Timeline Tracks */}
        <div className="timeline-tracks" ref={timelineRef}>
          <div className="timeline-ruler">
            {/* Major second marks only - cleaner look */}
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
              <div key={`major-${i}`} className="timeline-mark major-mark" style={{ left: `${(i / duration) * 100}%` }}>
                <span className="timeline-label">{i}s</span>
              </div>
            ))}
          </div>

          {tracks.map((track) => (
            <div key={track.id} className="timeline-track">
              <div 
                className="track-content"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, track.id, currentTime)}
                onClick={(e) => handleTrackClick(e, track.id)}
              >
                {track.clips.map((clip) => {
                  const isPlaying = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
                  return (
                    <div
                      key={clip.id}
                      className={`timeline-clip ${selectedClip === clip.id ? 'selected' : ''} ${isPlaying ? 'playing' : ''}`}
                      style={{
                        left: `${(clip.startTime / duration) * 100}%`,
                        width: `${(clip.duration / duration) * 100}%`,
                        backgroundColor: getTrackColor(clip.type),
                        border: isPlaying ? '2px solid #FFD700' : 'none'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClip(clip.id);
                      }}
                      onContextMenu={(e) => handleClipRightClick(e, clip.id, track.id)}
                    >
                      <span className="clip-name">{clip.name}</span>
                      {isPlaying && <div className="playing-indicator">▶</div>}
                    </div>
                  );
                })}
                {draggedAsset && (
                  <div className="drag-preview">
                    <span>Drop to place: {draggedAsset.name}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div 
          ref={playheadRef}
          className="timeline-playhead"
          style={{ 
            left: `${(currentTime / duration) * 100}%`,
            transition: isPlaying ? 'none' : 'left 0.1s ease'
          }}
          title={`Time: ${formatTime(currentTime)}`}
          data-current-time={currentTime}
          data-duration={duration}
          data-position={`${(currentTime / duration) * 100}%`}
        />
        


          </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleContextMenuClose}
          onDelete={handleDeleteClip}
        />
      )}

    </div>
  );
}; 