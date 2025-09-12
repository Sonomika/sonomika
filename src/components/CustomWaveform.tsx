import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useAppAudioCapture } from '../hooks/useAppAudioCapture'

interface CustomWaveformProps {
  audioUrl: string
  onTimeUpdate?: (currentTime: number) => void
  onDurationChange?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
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
  // Return up to `count` peak times (in seconds), spaced by optional minDistanceSec
  getPeaks: (count: number, options?: { minDistanceSec?: number }) => number[]
}

// Helper function to resize canvas to match display size
function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const cssWidth = Math.max(1, Math.floor(rect.width))
  const cssHeight = Math.max(1, Math.floor(rect.height))

  const displayWidth = Math.floor(cssWidth * dpr)
  const displayHeight = Math.floor(cssHeight * dpr)

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth
    canvas.height = displayHeight
  }

  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // scale X and Y

  return { cssWidth, cssHeight }
}

// Helper function to clamp pan value
function clampPan(p: number, totalBars: number, zoom: number) {
  const visibleBars = Math.max(1, Math.ceil(totalBars / Math.max(zoom, 1e-6)))
  const maxPan = Math.max(0, (totalBars - visibleBars) / totalBars)
  return Math.max(0, Math.min(maxPan, p))
}

const CustomWaveform = forwardRef<CustomWaveformRef, CustomWaveformProps>(({
  audioUrl,
  onTimeUpdate,
  onDurationChange,
  onPlay,
  onPause,
  onEnded,
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
  const analysisAbortRef = useRef<{ url: string; aborted: boolean } | null>(null)
  const emptyDrawLoggedRef = useRef(false)

  // Register audio element for app audio capture
  useAppAudioCapture(audioRef.current)

  useEffect(() => {
    if (!audioUrl) return

    setIsLoading(true)
    try { console.log('[CustomWaveform] init', { audioUrl, isElectron: !!(window as any).electron }) } catch {}
    // Ensure full waveform is shown on new load
    setZoom(1)
    setPan(0)

    // Create audio element
    const audio = new Audio()
    audioRef.current = audio

    // Audio event listeners
    const handleLoadedMetadata = () => {
      onDurationChange?.(audio.duration)
      // Just redraw; analysis runs independently below
      requestAnimationFrame(() => {
          drawSimpleWaveform()
      })
    }

    // Some environments fire loadeddata earlier/more reliably than loadedmetadata
    const handleLoadedData = () => {
      requestAnimationFrame(() => {
          drawSimpleWaveform()
      })
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

    const handleEnded = () => {
      // Mirror pause callback and signal end-of-track
      onPause?.()
      onEnded?.()
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    // Resolve element src for local absolute paths in Electron
    ;(async () => {
      try {
        const resolved = await buildAudioElementObjectUrl(audioUrl)
        try { console.log('[CustomWaveform] resolved element src', { from: audioUrl, to: resolved?.slice?.(0, 32) + '...', isDataUrl: typeof resolved === 'string' && (resolved.startsWith('blob:') || resolved.startsWith('data:')) }) } catch {}
        if (audioRef.current === audio && resolved) {
          // Revoke previous blob URL if any
          try {
            const prev = (audio as any).__blobUrl
            if (prev && typeof prev === 'string' && prev.startsWith('blob:') && prev !== resolved) {
              URL.revokeObjectURL(prev)
            }
          } catch {}
          ;(audio as any).__blobUrl = resolved.startsWith('blob:') ? resolved : undefined
          audio.src = resolved
        }
      } catch {}
    })()

    // Kick off real analysis immediately regardless of element events
    analyzeAudio(audioUrl).finally(() => {
      if (audioRef.current === audio) setIsLoading(false)
      drawSimpleWaveform()
    })

    return () => {
      if (analysisAbortRef.current && analysisAbortRef.current.url === audioUrl) {
        analysisAbortRef.current.aborted = true
      }
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)

      // Clean up element and any blob URL
      try { audio.pause() } catch {}
      try {
        const prev = (audio as any).__blobUrl
        if (prev && typeof prev === 'string' && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      } catch {}
      try { audio.src = '' } catch {}
    }
  }, [audioUrl]) // Only recreate audio element when audioUrl changes

  // Separate effect to update callbacks without recreating audio element
  useEffect(() => {
    if (!audioRef.current) return

    const audio = audioRef.current

    // Remove old listeners
    const oldHandlers = (audio as any).__oldHandlers || {}
    if (oldHandlers.timeupdate) {
      audio.removeEventListener('timeupdate', oldHandlers.timeupdate)
    }
    if (oldHandlers.play) {
      audio.removeEventListener('play', oldHandlers.play)
    }
    if (oldHandlers.pause) {
      audio.removeEventListener('pause', oldHandlers.pause)
    }
    if (oldHandlers.ended) {
      audio.removeEventListener('ended', oldHandlers.ended)
    }

    // Create new handlers
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

    const handleEnded = () => {
      onPause?.()
      onEnded?.()
    }

    // Add new listeners
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    // Store handlers for cleanup
    ;(audio as any).__oldHandlers = {
      timeupdate: handleTimeUpdate,
      play: handlePlay,
      pause: handlePause,
      ended: handleEnded
    }
  }, [onTimeUpdate, onDurationChange, onPlay, onPause, onEnded])

  // Analyze audio to compute real waveform peaks
  const analyzeAudio = async (url: string) => {
    if (!url) return
    // Prevent duplicate concurrent analysis of the same URL
    if (analysisAbortRef.current && analysisAbortRef.current.url === url && !analysisAbortRef.current.aborted) {
      try { console.log('[CustomWaveform] analyze skipped: already running', { url }) } catch {}
      return
    }
    const ticket = { url, aborted: false }
    analysisAbortRef.current = ticket

    try {
      try { console.log('[CustomWaveform] analyze start', { url }) } catch {}
      const arrayBuffer = await loadAudioArrayBuffer(url)
      try { console.log('[CustomWaveform] loaded bytes', { size: arrayBuffer?.byteLength }) } catch {}
      if (!arrayBuffer || analysisAbortRef.current !== ticket || ticket.aborted) return
      let audioBuffer = await decodeAudioBuffer(arrayBuffer)
      try { console.log('[CustomWaveform] decode result', { ok: !!audioBuffer, duration: audioBuffer?.duration, sampleRate: audioBuffer?.sampleRate, channels: audioBuffer?.numberOfChannels, length: audioBuffer?.length }) } catch {}
      if ((!audioBuffer || !isFinite(audioBuffer.duration)) && WaveSurfer) {
        // In Electron, avoid Wavesurfer fallback decode to prevent crashes in the audio thread
        const isElectron = !!(window as any).electron
        if (!isElectron) {
          try {
            // Last-resort decode using wavesurfer in-memory
            const ws = WaveSurfer.create({
              container: document.createElement('div'),
              interact: false,
              cursorWidth: 0,
              backend: 'WebAudio',
              normalize: true,
              height: 0,
            })
            await ws.loadBlob(new Blob([arrayBuffer], { type: detectAudioMime(url) }))
            const decoded: any = (ws as any).backend?.buffer
            if (decoded && typeof decoded.duration === 'number' && decoded.duration > 0) {
              audioBuffer = decoded as AudioBuffer
            }
            try { ws.destroy() } catch {}
          } catch {
            try { (WaveSurfer as any)?.destroy?.() } catch {}
          }
        }
      }
      if (!audioBuffer || analysisAbortRef.current !== ticket || ticket.aborted) {
        const isElectron = !!(window as any).electron
        if (isElectron) {
          const bars = generateSyntheticWaveform(2000, url || 'electron')
          setWaveformData(bars)
        } else {
          setWaveformData([])
        }
        return
      }
      const bars = computeWaveformBars(audioBuffer)
      try { console.log('[CustomWaveform] computed bars', { count: bars?.length }) } catch {}
      if (analysisAbortRef.current !== ticket || ticket.aborted) return
      setWaveformData(bars)
    } catch {
      try { console.warn('[CustomWaveform] analyze error') } catch {}
      const isElectron = !!(window as any).electron
      if (isElectron) {
        const bars = generateSyntheticWaveform(2000, url || 'electron')
        setWaveformData(bars)
      } else {
        setWaveformData([])
      }
    }
  }

  // Fetch/bridge loader for local and remote audio
  const loadAudioArrayBuffer = async (url: string): Promise<ArrayBuffer> => {
    try {
      const isElectron = !!(window as any).electron
      if (url.startsWith('file://') || url.startsWith('local-file://')) {
        const bridge = (window as any).electron?.readLocalFileAsBase64
        if (bridge) {
          let fp = url.replace(/^file:\/\//, '').replace(/^local-file:\/\//, '')
          // Handle Windows file URL that starts with /C:/...
          if (/^\/[A-Za-z]:\//.test(fp)) fp = fp.slice(1)
          fp = decodePath(fp)
          try { console.log('[CustomWaveform] reading local file via bridge', { fp }) } catch {}
          const b64 = await bridge(fp)
          return base64ToArrayBuffer(b64)
        }
      }
      // Absolute OS paths without a scheme
      const isWindowsPath = /^[A-Za-z]:\\/.test(url) || url.startsWith('\\\\')
      const isPosixPath = url.startsWith('/') && !/^\/(?:https?:|blob:|data:)/.test(url)
      if ((isWindowsPath || isPosixPath) && isElectron) {
        const bridge = (window as any).electron?.readLocalFileAsBase64
        if (bridge) {
          const fp = decodePath(url)
          try { console.log('[CustomWaveform] reading absolute path via bridge', { path: fp }) } catch {}
          const b64 = await bridge(fp)
          return base64ToArrayBuffer(b64)
        }
      }
      try { console.log('[CustomWaveform] fetching URL', { url }) } catch {}
      const readBytes = (window as any).electron?.readAudioBytes
      if (isElectron && readBytes) {
        const ab: ArrayBuffer = await readBytes(url)
        return ab || new ArrayBuffer(0)
      }
      const res = await fetch(url)
      return await res.arrayBuffer()
    } catch {
      try { console.warn('[CustomWaveform] loadAudioArrayBuffer failed') } catch {}
      return new ArrayBuffer(0)
    }
  }

  const resolveAudioElementSrc = async (url: string): Promise<string> => {
    try {
      const isElectron = !!(window as any).electron
      const isWindowsPath = /^[A-Za-z]:\\/.test(url) || url.startsWith('\\\\')
      const isPosixPath = url.startsWith('/') && !/^(?:\/https?:|\/blob:|\/data:)/.test(url)
      // For Electron local files, keep using a file URL to avoid massive data URLs causing memory spikes
      if (isElectron && (url.startsWith('file://') || url.startsWith('local-file://') || isWindowsPath || isPosixPath)) {
        if (url.startsWith('file://')) return url
        if (url.startsWith('local-file://')) return 'file://' + url.replace(/^local-file:\/\//, '')
        // Absolute paths → convert to file URL
        const fp = decodePath(url)
        const asPosix = fp.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, '/$1:/')
        return 'file://' + encodeURI(asPosix)
      }
      return url
    } catch {
      return url
    }
  }

  const buildAudioElementObjectUrl = async (url: string): Promise<string> => {
    // In Electron, prefer direct file URLs for local paths to avoid duplicating
    // large audio buffers in memory via Blob/ObjectURL, which can crash the renderer.
    try {
      const isElectron = !!(window as any).electron
      if (isElectron) {
        const isWindowsPath = /^[A-Za-z]:\\/.test(url) || url.startsWith('\\\\')
        const isPosixPath = url.startsWith('/') && !/^(?:\/https?:|\/blob:|\/data:)/.test(url)
        const isFileScheme = url.startsWith('file://') || url.startsWith('local-file://')
        if (isWindowsPath || isPosixPath || isFileScheme) {
          return await resolveAudioElementSrc(url)
        }
      }
      // For non-local or web URLs, just return the original/resolved URL.
      return await resolveAudioElementSrc(url)
    } catch {
      return await resolveAudioElementSrc(url)
    }
  }

  const decodePath = (p: string): string => {
    let out = p
    try { out = decodeURI(out) } catch {}
    try { out = decodeURIComponent(out) } catch {}
    // Normalize backslashes for Windows if coming from file URL
    if (/^[A-Za-z]:\//.test(out)) {
      out = out.replace(/\//g, '\\')
    }
    return out
  }

  const detectAudioMime = (p: string): string => {
    const L = (p || '').toLowerCase()
    if (L.endsWith('.wav')) return 'audio/wav'
    if (L.endsWith('.ogg')) return 'audio/ogg'
    if (L.endsWith('.flac')) return 'audio/flac'
    if (L.endsWith('.m4a') || L.endsWith('.mp4') || L.endsWith('.aac')) return 'audio/mp4'
    if (L.endsWith('.webm')) return 'audio/webm'
    return 'audio/mpeg'
  }

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    try {
      const binaryString = atob(base64)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i)
      return bytes.buffer
    } catch {
      return new ArrayBuffer(0)
    }
  }

  const decodeAudioBuffer = async (data: ArrayBuffer): Promise<AudioBuffer | null> => {
    if (!data || data.byteLength === 0) return null
    // Guard: avoid crashing Electron by attempting to decode formats likely unsupported
    // if Electron lacks proprietary codecs. We conservatively skip MP3/AAC/M4A here
    // when running under Electron and fall back to empty waveform (visualization only).
    try {
      const isElectron = !!(window as any).electron
      if (isElectron) {
        const mimeCheck = (dataGuess: string) => /audio\/(mpeg|mp4|aac)/i.test(dataGuess)
        // We don't have the file name here reliably; rely on recent URL set via analyzeAudio
        // by peeking a captured URL from analysisAbortRef
        const currentUrl = analysisAbortRef.current?.url || ''
        const L = currentUrl.toLowerCase()
        const looksProprietary = L.endsWith('.mp3') || L.endsWith('.m4a') || L.endsWith('.aac') || L.endsWith('.mp4')
        if (looksProprietary) {
          try { console.warn('[CustomWaveform] skipping decode of proprietary codec in Electron for', currentUrl) } catch {}
          return null
        }
      }
    } catch {}
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    const OC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext
    if (!AC && !OC) return null

    const decodeWith = async (CtxCtor: any, opts: any, offlineFlag: boolean) => {
      let ctx: any
      try {
        ctx = new CtxCtor(opts)
        try { console.log('[CustomWaveform] decoding bytes', { size: data.byteLength, offline: offlineFlag }) } catch {}
        const ab = data.slice(0)
        const p: Promise<AudioBuffer> = new Promise((resolve, reject) => {
          // Safari-style callback API fallback
          try {
            const req = (ctx as any).decodeAudioData(ab, (buf: AudioBuffer) => resolve(buf), (err: any) => reject(err))
            if (req && typeof (req as any).then === 'function') {
              ;(req as any).then(resolve).catch(reject)
            }
          } catch (e) {
            // Modern promise API
            ;(ctx as any).decodeAudioData(ab).then(resolve).catch(reject)
          }
        })
        // Timeout guard
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
        const result = await Promise.race([p, timeout])
        return result as AudioBuffer | null
      } catch {
        return null
      } finally {
        try { await ctx?.close?.() } catch {}
      }
    }

    // Try live context first, then offline
    const primary = AC ? await decodeWith(AC, { sampleRate: 44100 }, false) : null
    if (primary) return primary
    const fallback = OC ? await decodeWith(OC, { numberOfChannels: 1, length: 1, sampleRate: 44100 }, true) : null
    return fallback
  }

  const computeWaveformBars = (buffer: AudioBuffer): number[] => {
    const numChannels = buffer.numberOfChannels
    const length = buffer.length
    const sampleRate = buffer.sampleRate
    if (length === 0 || sampleRate === 0) return []

    // Fixed-resolution bars independent of canvas size for time-stable mapping
    const targetBars = 2000
    const samplesPerBar = Math.max(1, Math.floor(length / targetBars))
    const barsLen = Math.min(targetBars, Math.max(1, Math.ceil(length / samplesPerBar)))
    const bars: number[] = new Array(barsLen).fill(0)

    // Pre-fetch channel data
    const channels: Float32Array[] = []
    for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))

    for (let i = 0; i < bars.length; i++) {
      const start = i * samplesPerBar
      const end = Math.min(length, start + samplesPerBar)
      let peak = 0
      for (let s = start; s < end; s++) {
        let sampleAbs = 0
        for (let c = 0; c < numChannels; c++) {
          const v = Math.abs(channels[c][s] || 0)
          if (v > sampleAbs) sampleAbs = v
        }
        if (sampleAbs > peak) peak = sampleAbs
      }
      bars[i] = peak
    }

    // Normalize to 0..1 range with a floor to keep thin tracks visible
    let maxVal = 0
    for (let i = 0; i < bars.length; i++) if (bars[i] > maxVal) maxVal = bars[i]
    const norm = maxVal > 1e-6 ? maxVal : 1
    for (let i = 0; i < bars.length; i++) bars[i] = Math.max(0.02, Math.min(1, bars[i] / norm))
    try { console.log('[CustomWaveform] normalize bars', { maxVal: norm, bars: bars.length }) } catch {}
    return bars
  }

  // Synthetic waveform generator for Electron fallback when decoding is unavailable
  const generateSyntheticWaveform = (targetBars: number, seedInput: string): number[] => {
    const barsLen = Math.max(100, Math.min(5000, Math.floor(targetBars) || 2000))
    const bars: number[] = new Array(barsLen)
    // Deterministic seed from URL
    let seed = 2166136261 >>> 0
    for (let i = 0; i < seedInput.length; i++) {
      seed ^= seedInput.charCodeAt(i)
      seed = Math.imul(seed, 16777619) >>> 0
    }
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >>> 17; seed >>>= 0
      seed ^= seed << 5; seed >>>= 0
      return (seed >>> 0) / 4294967296
    }
    const baseFreq = 0.015 + rand() * 0.015
    const modFreq = 0.002 + rand() * 0.004
    const phaseA = rand() * Math.PI * 2
    const phaseB = rand() * Math.PI * 2
    const jaggedness = 0.15 + rand() * 0.25
    const fadeBars = Math.max(8, Math.floor(barsLen * 0.04))
    for (let i = 0; i < barsLen; i++) {
      const t = i
      const s1 = Math.sin(t * baseFreq + phaseA)
      const s2 = Math.sin(t * (baseFreq * 2.3) + phaseB)
      const s3 = Math.sin(t * modFreq + (phaseA + phaseB) * 0.5)
      let v = 0.55 + 0.25 * s1 + 0.15 * s2 + 0.10 * s3
      v += (rand() - 0.5) * jaggedness
      // Apply fade-in/out envelope at the edges
      let env = 1
      if (i < fadeBars) env = i / fadeBars
      else if (i > barsLen - fadeBars) env = (barsLen - i) / fadeBars
      v = Math.max(0.06, Math.min(1, v * Math.max(0, Math.min(1, env))))
      bars[i] = v
    }
    return bars
  }

  // Removed synthetic fallback in favor of real analysis only

  const drawSimpleWaveform = () => {
    const canvas = canvasRef.current
    const audio = audioRef.current
    if (!canvas || !audio) return
    if (!waveformData.length && !emptyDrawLoggedRef.current) {
      try { console.warn('[CustomWaveform] draw skipped: no waveformData') } catch {}
      emptyDrawLoggedRef.current = true
    } else if (waveformData.length) {
      emptyDrawLoggedRef.current = false
    }

    const sized = resizeCanvasToDisplaySize(canvas)
    if (!sized) return
    const { cssWidth, cssHeight } = sized

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const totalBars = waveformData.length
    if (!totalBars) return

    const progress = audio.duration > 0 ? (audio.currentTime / audio.duration) : 0

    ctx.clearRect(0, 0, cssWidth, cssHeight)

    const visibleBars = Math.max(1, Math.ceil(totalBars / Math.max(zoom, 1e-6)))
    const maxPan = Math.max(0, (totalBars - visibleBars) / totalBars)
    const clampedPan = Math.min(Math.max(pan, 0), maxPan)
    if (clampedPan !== pan) setPan(clampedPan)

    const startBar = Math.floor(clampedPan * totalBars)
    const endBar = Math.min(totalBars, startBar + visibleBars)

    const barWidth = cssWidth / visibleBars
    const centerY = cssHeight / 2
    
    for (let i = startBar; i < endBar; i++) {
      const barHeight = (waveformData[i] || 0) * cssHeight * 0.8
      const x = (i - startBar) * barWidth
      const y = centerY - barHeight / 2

      ctx.fillStyle = i < progress * totalBars ? progressColor : waveColor
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight)
    }

    if (progress > 0) {
      const progressBar = progress * totalBars
      const progressBarInVisibleRange = progressBar - startBar
      const progressX = (progressBarInVisibleRange / visibleBars) * cssWidth
      if (progressX >= 0 && progressX <= cssWidth) {
        ctx.strokeStyle = progressColor || '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(progressX, 0)
        ctx.lineTo(progressX, cssHeight)
        ctx.stroke()
      }
    }

    ctx.strokeStyle = '#262626'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(cssWidth, centerY)
    ctx.stroke()

    if (triggersEnabled && triggerPoints.length && audio.duration > 0) {
      triggerPoints.forEach(t => {
        const triggerBar = (t / audio.duration) * totalBars
        const rel = triggerBar - startBar
        const triggerX = (rel / visibleBars) * cssWidth
        if (triggerX >= 0 && triggerX <= cssWidth) {
          ctx.strokeStyle = '#ff6b6b'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(triggerX, 0)
          ctx.lineTo(triggerX, cssHeight)
          ctx.stroke()

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
  }, [currentTime, waveformData, zoom, pan, triggerPoints, triggersEnabled])

  // Add resize listener for canvas redraw (no data regeneration)
  useEffect(() => {
    const handler = () => {
        drawSimpleWaveform()
    }
    window.addEventListener('resize', handler)
    // Initial draw
    requestAnimationFrame(() => {
        drawSimpleWaveform()
    })
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Basic peak picker using the generated waveformData
  const computePeaks = (count: number, minDistanceSec?: number): number[] => {
    if (!audioRef.current || !Number.isFinite(audioRef.current.duration) || audioRef.current.duration <= 0) return []
    const dur = audioRef.current.duration
    const totalBars = waveformData.length || 0
    if (totalBars === 0 || count <= 0) return []

    // Convert min distance to bars
    const minBars = Math.max(1, Math.floor(((minDistanceSec || (dur / (count * 2))) / dur) * totalBars))

    // Find local maxima
    const candidates: Array<{ i: number; v: number }> = []
    for (let i = 1; i < totalBars - 1; i++) {
      const v = waveformData[i] || 0
      if (v >= (waveformData[i - 1] || 0) && v >= (waveformData[i + 1] || 0)) {
        candidates.push({ i, v })
      }
    }
    // Sort by amplitude desc
    candidates.sort((a, b) => b.v - a.v)

    const selected: number[] = []
    const taken: boolean[] = new Array(totalBars).fill(false)
    for (const c of candidates) {
      if (selected.length >= count) break
      // Enforce minimum bar distance
      let ok = true
      for (let di = -minBars; di <= minBars; di++) {
        const idx = c.i + di
        if (idx >= 0 && idx < totalBars && taken[idx]) { ok = false; break }
      }
      if (!ok) continue
      // Mark neighborhood
      for (let di = -minBars; di <= minBars; di++) {
        const idx = c.i + di
        if (idx >= 0 && idx < totalBars) taken[idx] = true
      }
      // Convert bar index to time in seconds
      const t = (c.i / Math.max(1, totalBars - 1)) * dur
      selected.push(t)
    }
    // Sort chronologically
    return selected.sort((a, b) => a - b)
  }

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    
    // Calculate actual progress based on zoom and pan
    const totalBars = waveformData.length
    const visibleBars = Math.max(1, Math.ceil(totalBars / Math.max(zoom, 1e-6)))
    const startBar = Math.max(0, Math.floor(pan * totalBars))
    
    // Calculate progress to match the progress line calculation exactly
    // Progress line: progressX = (progressBarInVisibleRange / visibleBars) * cssWidth
    // Reverse: progress = ((x / rect.width) * visibleBars + startBar) / totalBars
    const clickedBarInVisibleRange = (x / rect.width) * visibleBars
    const clickedBar = startBar + clickedBarInVisibleRange
    const progress = clickedBar / totalBars
    const newTime = Math.max(0, Math.min(audioRef.current.duration, progress * audioRef.current.duration))

    // If triggers are enabled and shift is held, add trigger
    if (triggersEnabled && event.shiftKey && onTriggerClick) {
      onTriggerClick(newTime)
    } else {
      // Otherwise, seek to that time
      audioRef.current.currentTime = newTime
    }
    
    // Force redraw to ensure waveform stays visible
    setTimeout(() => {
      drawSimpleWaveform()
    }, 0)
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
        const rect = canvas.getBoundingClientRect()
        const deltaPan = deltaX / (rect.width * zoom)
        const totalBars = waveformData.length
        setPan(prev => clampPan(dragStart.pan + deltaPan, totalBars, zoom))
      }
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
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
    // Force a redraw to ensure the waveform updates immediately
    setTimeout(() => {
      drawSimpleWaveform()
    }, 0)
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
    seekTo,
    getPeaks: (count: number, options?: { minDistanceSec?: number }) => computePeaks(Math.max(0, Math.floor(count || 0)), options?.minDistanceSec)
  }), [playPause])

  return (
    <div style={{ position: 'relative' }}>
                  <canvas
                    ref={canvasRef}
                    height={height}
                    onClick={handleCanvasClick}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{
                      width: '100%',
                      height: height,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      border: '1px solid #262626',
                      backgroundColor: '#1f1f1f'
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