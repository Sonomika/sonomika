// WebcamTrackingParticles.external.js
// Portable external source using tracking.js color tracking to steer a particle swarm
// Globals expected: globalThis.React, globalThis.THREE, globalThis.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Webcam Color Tracking Particles (External)',
  description: 'Tracks a colored object (e.g., magenta) from webcam and steers particles.',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'color', type: 'select', value: 'magenta', options: [
      { value: 'magenta', label: 'Magenta' },
      { value: 'cyan', label: 'Cyan' },
      { value: 'yellow', label: 'Yellow' }
    ] },
    { name: 'particleCount', type: 'number', value: 1000, min: 100, max: 10000, step: 100 },
    { name: 'minDimension', type: 'number', value: 5, min: 1, max: 50, step: 1 },
    { name: 'minGroupSize', type: 'number', value: 10, min: 1, max: 200, step: 1 },
    { name: 'mirror', type: 'boolean', value: true },
  ],
};

// Attempt to load tracking.js once per page
async function ensureTrackingLoaded() {
  try { if (globalThis.tracking) return true; } catch {}
  const CDN_LIST = [
    'https://cdn.jsdelivr.net/npm/tracking/build/tracking-min.js',
    'https://cdn.jsdelivr.net/npm/tracking@1.1.3/build/tracking-min.js',
  ];
  for (let i = 0; i < CDN_LIST.length; i++) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = CDN_LIST[i];
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
      });
      if (globalThis.tracking) return true;
    } catch {}
  }
  return !!globalThis.tracking;
}

export default function WebcamTrackingParticlesSource({
  color = 'magenta',
  particleCount = 1000,
  minDimension = 5,
  minGroupSize = 10,
  mirror = true,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackerTaskRef = useRef(null);
  const targetRef = useRef({ x: 0, y: 0 }); // normalized -1..1
  const currentRef = useRef({ x: 0, y: 0 });
  const groupRef = useRef(null);

  // Prepare particle positions once
  const positions = useMemo(() => {
    const arr = new Float32Array(Math.max(1, particleCount) * 3);
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 0] = (Math.random() * 2000 - 1000) * 0.5;
      arr[i + 1] = (Math.random() * 2000 - 1000) * 0.5;
      arr[i + 2] = (Math.random() * 2000 - 1000) * 0.5;
    }
    return arr;
  }, [particleCount]);

  const points = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 6,
      color: 0xffffff,
      opacity: 0.9,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo, mat };
  }, [positions]);

  // Smooth-follow towards target
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const lerp = 0.05;
    currentRef.current.x += (targetRef.current.x - currentRef.current.x) * lerp;
    currentRef.current.y += (targetRef.current.y - currentRef.current.y) * lerp;
    g.position.x = currentRef.current.x * 10;
    g.position.y = currentRef.current.y * 10;
    g.rotation.y += 0.0015;
  });

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        // Start webcam stream
        const constraints = { video: { width: 320, height: 240, frameRate: 30 } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) return;
        streamRef.current = stream;
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true;
        video.width = 320; video.height = 240;
        video.srcObject = stream; await video.play().catch(() => {});
        videoRef.current = video;

        // Load tracking.js and start color tracking
        const ok = await ensureTrackingLoaded();
        if (!ok || !globalThis.tracking) {
          console.warn('tracking.js failed to load');
          return;
        }
        const t = new globalThis.tracking.ColorTracker([String(color || 'magenta')]);
        try { t.setMinDimension(Math.max(1, parseInt(minDimension, 10) || 1)); } catch {}
        try { t.setMinGroupSize(Math.max(1, parseInt(minGroupSize, 10) || 1)); } catch {}

        t.on('track', (event) => {
          if (!videoRef.current) return;
          if (!event || !Array.isArray(event.data)) return;
          if (event.data.length === 0) return;
          // Select largest blob
          let best = null; let bestArea = 0;
          for (let i = 0; i < event.data.length; i++) {
            const r = event.data[i];
            const a = (r.width || 0) * (r.height || 0);
            if (a > bestArea) { bestArea = a; best = r; }
          }
          if (!best) return;
          const vid = videoRef.current;
          const vw = vid.videoWidth || vid.width || 320;
          const vh = vid.videoHeight || vid.height || 240;
          const cx = (best.x || 0) + (best.width || 0) / 2;
          const cy = (best.y || 0) + (best.height || 0) / 2;
          let nx = (cx / vw) * 2 - 1; // -1..1
          let ny = (cy / vh) * 2 - 1; // -1..1 (top->bottom)
          if (mirror) nx = -nx;
          // Flip Y so up is positive in world space
          ny = -ny;
          targetRef.current.x = nx;
          targetRef.current.y = ny;
        });

        // Use the provided video element (no camera:true) so we control stream lifecycle
        const task = globalThis.tracking.track(video, t);
        trackerTaskRef.current = task;
      } catch (e) {
        try { console.error('Webcam tracking init failed', e); } catch {}
      }
    };
    start();
    return () => {
      mounted = false;
      try { if (trackerTaskRef.current && typeof trackerTaskRef.current.stop === 'function') trackerTaskRef.current.stop(); } catch {}
      try { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      videoRef.current = null;
    };
  }, [color, minDimension, minGroupSize, mirror]);

  const { size } = useThree();
  const w = (size && size.width) || 1280;
  const h = (size && size.height) || 720;
  const aspect = w / Math.max(1, h);
  const planeW = aspect * 2;
  const planeH = 2;

  return React.createElement('group', null,
    // Optional faint background plane to visualize bounds
    React.createElement('mesh', { position: [0, 0, -0.2] },
      React.createElement('planeGeometry', { args: [planeW, planeH] }),
      React.createElement('meshBasicMaterial', { color: 0x111111, transparent: true, opacity: 0.2 })
    ),
    React.createElement('group', { ref: groupRef },
      React.createElement('points', { geometry: points.geo, material: points.mat })
    )
  );
}


