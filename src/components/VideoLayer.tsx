import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/store';

interface VideoLayerProps {
  layer: any;
  width: number;
  height: number;
  onUpdate: (updates: any) => void;
}

export const VideoLayer: React.FC<VideoLayerProps> = ({ layer, width, height, onUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const { bpm } = useStore() as any;

  useEffect(() => {
    if (layer.asset?.path) {
      loadVideo(layer.asset.path);
    }
  }, [layer.asset?.path]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      onUpdate({
        metadata: {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          aspectRatio: video.videoWidth / video.videoHeight
        }
      });
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      if (layer.loopMode === 'loop' || layer.loopMode === 'ping-pong') {
        video.currentTime = 0;
        video.play();
      } else {
        setIsPlaying(false);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [layer.loopMode, onUpdate]);

  // BPM sync effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !layer.bpmSync || !bpm) return;

    const beatInterval = 60 / bpm; // seconds per beat
    const currentBeat = Math.floor(currentTime / beatInterval);
    const targetTime = currentBeat * beatInterval;
    
    if (Math.abs(currentTime - targetTime) > 0.1) {
      video.currentTime = targetTime;
    }
  }, [bpm, layer.bpmSync, currentTime]);

  const loadVideo = (src: string) => {
    setIsLoading(true);
    setError(null);

    const video = videoRef.current;
    if (!video) return;

    video.src = src;
    video.load();

    video.onloadeddata = () => {
      setIsLoading(false);
      if (layer.autoplay) {
        video.play();
      }
    };

    video.onerror = () => {
      setError('Failed to load video');
      setIsLoading(false);
    };
  };

  const renderVideo = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate video position and size based on fit mode
    const { fitMode = 'cover', position = { x: 0.5, y: 0.5 } } = layer;
    
    let drawWidth = width;
    let drawHeight = height;
    let drawX = 0;
    let drawY = 0;

    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = width / height;

    switch (fitMode) {
      case 'cover':
        if (videoAspect > canvasAspect) {
          drawHeight = width / videoAspect;
          drawY = (height - drawHeight) * position.y;
        } else {
          drawWidth = height * videoAspect;
          drawX = (width - drawWidth) * position.x;
        }
        break;
      
      case 'contain':
        if (videoAspect > canvasAspect) {
          drawWidth = height * videoAspect;
          drawX = (width - drawWidth) * position.x;
        } else {
          drawHeight = width / videoAspect;
          drawY = (height - drawHeight) * position.y;
        }
        break;
      
      case 'stretch':
        // Use full canvas size
        break;
    }

    // Apply layer transformations
    ctx.save();
    ctx.translate(drawX + drawWidth / 2, drawY + drawHeight / 2);
    ctx.scale(layer.scale || 1, layer.scale || 1);
    ctx.rotate((layer.rotation || 0) * Math.PI / 180);
    ctx.translate(-drawWidth / 2, -drawHeight / 2);

    // Draw the video frame
    ctx.drawImage(video, 0, 0, drawWidth, drawHeight);
    ctx.restore();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const renderLoop = () => {
      renderVideo();
      requestAnimationFrame(renderLoop);
    };
    renderLoop();
  }, [layer, width, height]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setError('Please select a video file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onUpdate({
        asset: {
          path: result,
          name: file.name,
          type: 'video',
          size: file.size
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          onUpdate({
            asset: {
              path: result,
              name: file.name,
              type: 'video',
              size: file.size
            }
          });
        };
        reader.readAsDataURL(file);
      } else {
        setError('Please drop a video file');
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="video-layer">
      <div className="video-layer-header">
        <h3>Video Layer: {layer.name}</h3>
        <div className="video-controls">
          <input
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id={`video-input-${layer.id}`}
          />
          <label htmlFor={`video-input-${layer.id}`} className="file-input-label">
            Choose Video
          </label>
        </div>
      </div>

      <div className="video-layer-content">
        <div
          className="video-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading video...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
            </div>
          ) : videoRef.current?.src ? (
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              className="video-canvas"
            />
          ) : (
            <div className="empty-state">
      
              <p>Drop a video here or click to browse</p>
            </div>
          )}
        </div>

        {/* Hidden video element for playback */}
        <video
          ref={videoRef}
          style={{ display: 'none' }}
          muted={layer.muted}
          loop={layer.loop}
        />
      </div>

      {videoRef.current?.src && (
        <div className="video-layer-controls">
          {/* Playback Controls */}
          <div className="playback-controls">
            <button onClick={togglePlay} className="play-button">
              {isPlaying ? '⏸️' : '▶️'}
            </button>
            
            <div className="time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
            
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="seek-bar"
            />
          </div>

          {/* Video Settings */}
          <div className="control-group">
            <label>Fit Mode:</label>
            <select
              value={layer.fitMode || 'cover'}
              onChange={(e) => onUpdate({ fitMode: e.target.value })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={layer.loop || false}
                onChange={(e) => onUpdate({ loop: e.target.checked })}
              />
              Loop
            </label>
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={layer.muted || false}
                onChange={(e) => onUpdate({ muted: e.target.checked })}
              />
              Muted
            </label>
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={layer.bpmSync || false}
                onChange={(e) => onUpdate({ bpmSync: e.target.checked })}
              />
              BPM Sync
            </label>
          </div>

          <div className="control-group">
            <label>Scale: {layer.scale || 1}</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={layer.scale || 1}
              onChange={(e) => onUpdate({ scale: parseFloat(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <label>Rotation: {layer.rotation || 0}°</label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={layer.rotation || 0}
              onChange={(e) => onUpdate({ rotation: parseInt(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <label>Opacity: {Math.round((layer.opacity || 1) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.opacity || 1}
              onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <label>Position X: {Math.round((layer.position?.x || 0.5) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.position?.x || 0.5}
              onChange={(e) => onUpdate({ 
                position: { 
                  ...layer.position, 
                  x: parseFloat(e.target.value) 
                } 
              })}
            />
          </div>

          <div className="control-group">
            <label>Position Y: {Math.round((layer.position?.y || 0.5) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.position?.y || 0.5}
              onChange={(e) => onUpdate({ 
                position: { 
                  ...layer.position, 
                  y: parseFloat(e.target.value) 
                } 
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
}; 