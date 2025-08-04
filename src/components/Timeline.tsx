import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/store';

interface TimelineProps {
  onClose: () => void;
}

interface TimelineTrack {
  id: string;
  name: string;
  type: 'audio' | 'video' | 'effect';
  clips: TimelineClip[];
}

interface TimelineClip {
  id: string;
  startTime: number;
  duration: number;
  asset: any;
  type: 'audio' | 'video' | 'effect';
  name: string;
}

export const Timeline: React.FC<TimelineProps> = ({ onClose }) => {
  const { scenes, currentSceneId, bpm, setBpm, setPreviewContent, setIsPlaying: setStoreIsPlaying, previewContent } = useStore() as any;
  const [tracks, setTracks] = useState<TimelineTrack[]>([
    { id: 'track-1', name: 'Track 1', type: 'audio', clips: [] },
    { id: 'track-2', name: 'Track 2', type: 'video', clips: [] },
    { id: 'track-3', name: 'Track 3', type: 'effect', clips: [] }
  ]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(60); // 60 seconds default
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [draggedAsset, setDraggedAsset] = useState<any>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  
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
            responsive: true,
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
            setCurrentTime(currentTime);
          });

          wavesurferRef.current.on('finish', () => {
            setIsPlaying(false);
            setStoreIsPlaying(false);
            setCurrentTime(0);
            setPreviewContent(null);
          });

          wavesurferRef.current.on('interaction', () => {
            if (!isPlaying) {
              setIsPlaying(true);
              setStoreIsPlaying(true);
            }
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
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
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
    
    const assetData = e.dataTransfer.getData('application/json');
    if (assetData) {
      try {
        const asset = JSON.parse(assetData);
        const track = tracks.find(t => t.id === trackId);
        
        if (track) {
          // Determine clip type based on asset type
          let clipType: 'audio' | 'video' | 'effect' = 'audio';
          if (asset.type === 'video') {
            clipType = 'video';
          } else if (asset.type === 'effect') {
            clipType = 'effect';
          } else if (asset.type === 'audio') {
            clipType = 'audio';
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
          
          setTracks(updatedTracks);
        }
      } catch (error) {
        console.error('Error adding clip to timeline:', error);
      }
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
        
        // Determine clip type based on asset type
        let clipType: 'audio' | 'video' | 'effect' = 'audio';
        if (draggedAsset.type === 'video') {
          clipType = 'video';
        } else if (draggedAsset.type === 'effect') {
          clipType = 'effect';
        } else if (draggedAsset.type === 'audio') {
          clipType = 'audio';
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
        
        setTracks(updatedTracks);
        setDraggedAsset(null);
      }
    }
  };





  // Update preview content when timeline is playing
  useEffect(() => {
    if (isPlaying && previewContent?.type === 'timeline') {
      setPreviewContent({
        type: 'timeline',
        tracks: tracks,
        currentTime: currentTime,
        duration: duration,
        isPlaying: true
      });
    }
  }, [currentTime, isPlaying, tracks, duration, setPreviewContent]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTrackColor = (type: string) => {
    switch (type) {
      case 'audio': return '#4CAF50';
      case 'video': return '#2196F3';
      case 'effect': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h2>Timeline</h2>
        <div className="timeline-controls">
                     <button 
                           onClick={async () => {
                if (wavesurferRef.current) {
                  if (isPlaying) {
                    wavesurferRef.current.pause();
                    setIsPlaying(false);
                    setStoreIsPlaying(false);
                    setPreviewContent(null);
                  } else {
                    wavesurferRef.current.play();
                    setIsPlaying(true);
                    setStoreIsPlaying(true);
                    setPreviewContent({
                      type: 'timeline',
                      tracks: tracks,
                      currentTime: currentTime,
                      duration: duration,
                      isPlaying: true
                    });
                  }
                }
              }}
             className={`play-button ${isPlaying ? 'playing' : ''}`}
           >
             {isPlaying ? '⏸️' : '▶️'}
           </button>
          <button onClick={() => setCurrentTime(0)}>⏮️</button>
          <span className="time-display">{formatTime(currentTime)} / {formatTime(duration)}</span>
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
            className="time-slider"
          />
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="zoom-slider"
          />
          <span>Zoom: {zoom}x</span>
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
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
              <div key={i} className="timeline-mark" style={{ left: `${(i / duration) * 100}%` }}>
                <span className="timeline-label">{formatTime(i)}</span>
              </div>
            ))}
          </div>

          {tracks.map((track) => (
            <div key={track.id} className="timeline-track">
              <div className="track-header" style={{ backgroundColor: getTrackColor(track.type) }}>
                <span>{track.name}</span>
              </div>
              <div 
                className="track-content"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, track.id, currentTime)}
                onClick={(e) => handleTrackClick(e, track.id)}
              >
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className={`timeline-clip ${selectedClip === clip.id ? 'selected' : ''}`}
                    style={{
                      left: `${(clip.startTime / duration) * 100}%`,
                      width: `${(clip.duration / duration) * 100}%`,
                      backgroundColor: getTrackColor(clip.type)
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClip(clip.id);
                    }}
                  >
                    <span className="clip-name">{clip.name}</span>
                  </div>
                ))}
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
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>


    </div>
  );
}; 