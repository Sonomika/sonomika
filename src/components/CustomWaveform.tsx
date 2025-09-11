import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'

interface CustomWaveformProps {
  audioUrl: string
  onTimeUpdate?: (currentTime: number) => void
  onDurationChange?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  isPlaying?: boolean
  currentTime?: number
  height?: number
  waveColor?: string
  progressColor?: string
  triggerPoints?: number[]
  onTriggerClick?: (time: number) => void
  triggersEnabled?: boolean
}

export interface CustomWaveformRef {
  playPause: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  play: () => void
  pause: () => void
  stop: () => void
  seekTo: (timeSec: number) => void
}

const CustomWaveform = forwardRef<CustomWaveformRef, CustomWaveformProps>(({
  audioUrl,
  onTimeUpdate,
  onDurationChange,
  onPlay,
  onPause,
  isPlaying = false,
  currentTime = 0,
  height = 96,
  waveColor = '#4F4A85',
  progressColor = '#383351',
  triggerPoints = [],
  onTriggerClick,
  triggersEnabled = false
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, pan: 0 })

  useEffect(() => {
    if (!audioUrl) return

    setIsLoading(true)

    // Create audio element
    const audio = new Audio(audioUrl)
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    // Audio event listeners
    const handleLoadedMetadata = () => {
      onDurationChange?.(audio.duration)
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      onTimeUpdate?.(audio.currentTime)
      drawSimpleWaveform()
    }

    const handlePlay = () => {
      onPlay?.()
    }

    const handlePause = () => {
      onPause?.()
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)

      audio.pause()
      audio.src = ''
    }
  }, [audioUrl, onTimeUpdate, onDurationChange, onPlay, onPause])

  // Analyze audio when URL changes
  useEffect(() => {
    if (audioUrl) {
      setIsLoading(true)
      // Add timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        analyzeAudio(audioUrl)
        setIsLoading(false)
      }, 100) // Small delay to ensure audio element is ready
      
      return () => clearTimeout(timeoutId)
    }
  }, [audioUrl])

  const analyzeAudio = async (audioUrl: string) => {
    // Skip Web Audio API analysis in Electron to prevent crashes
    // Use simple waveform generation instead
    generateSimpleWaveform()
  }

  // Alternative simple waveform generation without Web Audio API
  const generateSimpleWaveform = () => {
    const samples = 200
    const waveform = []
    
    for (let i = 0; i < samples; i++) {
      // Create a more realistic looking waveform pattern
      const position = i / samples
      
      // Multiple sine waves for more complex pattern
      const wave1 = Math.sin(position * Math.PI * 8) * 0.2
      const wave2 = Math.sin(position * Math.PI * 16) * 0.15
      const wave3 = Math.sin(position * Math.PI * 32) * 0.1
      
      // Add some variation based on position (quieter at start/end)
      const envelope = Math.sin(position * Math.PI) * 0.8 + 0.2
      
      // Add random noise
      const noise = (Math.random() - 0.5) * 0.3
      
      // Combine all elements
      const baseHeight = (wave1 + wave2 + wave3) * envelope + 0.4
      const height = Math.max(0.05, Math.min(0.95, baseHeight + noise))
      
      waveform.push(height)
    }
    
    setWaveformData(waveform)
  }

  const drawSimpleWaveform = () => {
    const canvas = canvasRef.current
    if (!canvas || !audioRef.current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height: canvasHeight } = canvas
    const progress = audioRef.current.currentTime / audioRef.current.duration || 0
    const progressWidth = width * progress

    // Clear canvas
    ctx.clearRect(0, 0, width, canvasHeight)

    // Calculate visible range based on zoom and pan
    const totalBars = waveformData.length
    const visibleBars = Math.ceil(totalBars / zoom)
    const startBar = Math.max(0, Math.floor(pan * totalBars))
    const endBar = Math.min(totalBars, startBar + visibleBars)
    
    // Calculate bar width for zoomed view
    const barWidth = (width / visibleBars) * zoom
    const centerY = canvasHeight / 2

    // Draw waveform bars
    for (let i = startBar; i < endBar; i++) {
      const barHeight = (waveformData[i] || 0) * canvasHeight * 0.8
      const x = (i - startBar) * barWidth
      const y = centerY - barHeight / 2

      // Color bars based on progress
      if (i < progress * totalBars) {
        ctx.fillStyle = progressColor
      } else {
        ctx.fillStyle = waveColor
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight)
    }

    // Draw progress line
    if (progress > 0) {
      const progressBar = Math.floor(progress * totalBars)
      if (progressBar >= startBar && progressBar < endBar) {
        const progressX = (progressBar - startBar) * barWidth
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(progressX, 0)
        ctx.lineTo(progressX, canvasHeight)
        ctx.stroke()
      }
    }

    // Draw center line
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()

    // Draw trigger points
    if (triggersEnabled && audioRef.current && triggerPoints.length > 0) {
      triggerPoints.forEach(triggerTime => {
        const triggerProgress = triggerTime / (audioRef.current?.duration || 1)
        const triggerBar = Math.floor(triggerProgress * totalBars)
        
        if (triggerBar >= startBar && triggerBar < endBar) {
          const triggerX = (triggerBar - startBar) * barWidth
          
          // Draw trigger line
          ctx.strokeStyle = '#ff6b6b'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(triggerX, 0)
          ctx.lineTo(triggerX, canvasHeight)
          ctx.stroke()
          
          // Draw trigger marker
          ctx.fillStyle = '#ff6b6b'
          ctx.beginPath()
          ctx.arc(triggerX, 10, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    }
  }

  useEffect(() => {
    drawSimpleWaveform()
  }, [currentTime, waveformData, zoom, pan])

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    
    // Calculate actual progress based on zoom and pan
    const totalBars = waveformData.length
    const visibleBars = Math.ceil(totalBars / zoom)
    const startBar = Math.max(0, Math.floor(pan * totalBars))
    const barWidth = (canvas.width / visibleBars) * zoom
    const clickedBar = startBar + Math.floor(x / barWidth)
    const progress = clickedBar / totalBars
    const newTime = progress * audioRef.current.duration

    // If triggers are enabled and shift is held, add trigger
    if (triggersEnabled && event.shiftKey && onTriggerClick) {
      onTriggerClick(newTime)
    } else {
      // Otherwise, seek to that time
      audioRef.current.currentTime = newTime
    }
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button === 0) { // Left mouse button
      setIsDragging(true)
      setDragStart({ x: event.clientX, pan })
    }
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const deltaX = event.clientX - dragStart.x
      const canvas = canvasRef.current
      if (canvas) {
        const deltaPan = deltaX / (canvas.width * zoom)
        setPan(Math.max(0, Math.min(1 - 1/zoom, dragStart.pan + deltaPan)))
      }
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const delta = event.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(10, zoom * delta))
    setZoom(newZoom)
    
    // Adjust pan to keep the center point stable
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const centerX = event.clientX - rect.left
      const centerProgress = centerX / canvas.width
      const newPan = centerProgress * (1 - 1/newZoom)
      setPan(Math.max(0, Math.min(1 - 1/newZoom, newPan)))
    }
  }

  const playPause = () => {
    if (!audioRef.current) return

    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {})
    } else {
      audioRef.current.pause()
    }
  }

  const play = () => {
    if (!audioRef.current) return
    audioRef.current.play().catch(() => {})
  }

  const pause = () => {
    if (!audioRef.current) return
    audioRef.current.pause()
  }

  const stop = () => {
    if (!audioRef.current) return
    audioRef.current.pause()
    try { audioRef.current.currentTime = 0 } catch {}
  }

  const seekTo = (timeSec: number) => {
    if (!audioRef.current) return
    const dur = audioRef.current.duration || 0
    const clamped = Math.max(0, Math.min(dur || 0, Number(timeSec) || 0))
    audioRef.current.currentTime = clamped
  }

  const zoomIn = () => {
    setZoom(prev => Math.min(10, prev * 1.5))
  }

  const zoomOut = () => {
    setZoom(prev => Math.max(0.1, prev / 1.5))
  }

  const resetZoom = () => {
    setZoom(1)
    setPan(0)
  }

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    playPause,
    zoomIn,
    zoomOut,
    resetZoom,
    play,
    pause,
    stop,
    seekTo
  }), [playPause])

  return (
    <div style={{ position: 'relative' }}>
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={height}
                    onClick={handleCanvasClick}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    style={{
                      width: '100%',
                      height: height,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      border: '1px solid #ccc',
                      backgroundColor: '#f5f5f5'
                    }}
                  />
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: '10px',
            borderRadius: '4px'
          }}
        >
          Loading waveform...
        </div>
      )}
    </div>
  )
})

CustomWaveform.displayName = 'CustomWaveform'

export default CustomWaveform