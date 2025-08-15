import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { LOOP_MODES } from '../constants/video';
import type { VideoLayer as VideoLayerType } from '../types/layer';

interface VideoLayerProps {
  layer: VideoLayerType;
  width: number;
  height: number;
  onUpdate: (updates: Partial<VideoLayerType>) => void;
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
      
      switch (layer.loopMode) {
        case LOOP_MODES.NONE:
          setIsPlaying(false);
          break;
          
        case LOOP_MODES.LOOP:
          video.currentTime = 0;
          video.play();
          break;
          
        case LOOP_MODES.REVERSE:
          // Note: HTML5 video doesn't support reverse playback natively
          console.warn('🎬 REVERSE MODE: Native reverse playback not supported, falling back to loop');
          video.currentTime = 0;
          video.play();
          break;
          
        case LOOP_MODES.PING_PONG:
          // For now, restart as reverse isn't natively supported
          video.currentTime = 0;
          video.play();
          break;
          
        default:
          setIsPlaying(false);
          break;
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
    if (!video || !bpm) return;

    const interval = setInterval(() => {
      if (video.paused) return;
      
      const currentTime = video.currentTime;
      const duration = video.duration;
      if (duration === 0) return;
      
      // Calculate BPM-based timing
      const beatsPerSecond = bpm / 60;
      const currentBeat = Math.floor(currentTime * beatsPerSecond);
      const nextBeatTime = (currentBeat + 1) / beatsPerSecond;
      
      // Adjust video timing to sync with BPM
      if (Math.abs(currentTime - nextBeatTime) < 0.1) {
        video.currentTime = nextBeatTime;
      }
    }, 100);

    return () => clearInterval(interval);
  }, [bpm]);

  // Handle column play events - restart vs continue logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoRestart = (e: CustomEvent) => {
      if (e.detail?.layerId === layer.id) {
        // Restart video from beginning
        video.currentTime = 0;
        video.play().catch(console.error);
      }
    };

    const handleVideoContinue = (e: CustomEvent) => {
      if (e.detail?.layerId === layer.id) {
        // Continue from current position
        if (video.paused) {
          video.play().catch(console.error);
        }
      }
    };

    // Listen for specific video control events
    document.addEventListener('videoRestart', handleVideoRestart as EventListener);
    document.addEventListener('videoContinue', handleVideoContinue as EventListener);
    
    return () => {
      document.removeEventListener('videoRestart', handleVideoRestart as EventListener);
      document.removeEventListener('videoContinue', handleVideoContinue as EventListener);
    };
  }, [layer.id, layer.playMode]);

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
          id: `video-${Date.now()}`,
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
              id: `video-${Date.now()}`,
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
    <div className="video-layer" style={{ width, height }}>
      <video
        ref={videoRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block'
        }}
        data-layer-id={layer.id}
        muted
        playsInline
      />
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}
      {error && (
        <div className="error-overlay">
          <p>Error: {error}</p>
        </div>
      )}
    </div>
  );
}; 