const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Video Texture Display',
  description: 'Displays and fits the input video texture with optional mirroring and tiling.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  parameters: [
    { name: 'mirror', type: 'boolean', value: true, description: 'Mirror horizontally' },
    { name: 'fitMode', type: 'select', value: 'cover', description: 'Video Size', options: [
      { value: 'none', label: 'Original' },
      { value: 'contain', label: 'Fit' },
      { value: 'cover', label: 'Fill' },
      { value: 'stretch', label: 'Stretch' },
      { value: 'tile', label: 'Tile' }
    ] }
  ],
};

export default function VideoTextureDisplay({
  videoTexture,
  mirror = true,
  fitMode = 'cover',
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const [mapTex, setMapTex] = useState(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const lastDimsRef = useRef({ w: 0, h: 0 });

  // Clone the incoming texture to avoid mutating shared state (repeat/offset/wrap)
  useEffect(() => {
    if (!videoTexture) { setMapTex(null); return; }
    try {
      const clone = videoTexture.clone();
      try { clone.colorSpace = (THREE && THREE.SRGBColorSpace) || clone.colorSpace; } catch {}
      clone.needsUpdate = true;
      setMapTex(clone);
      return () => { try { clone.dispose && clone.dispose(); } catch {} };
    } catch {
      setMapTex(videoTexture);
    }
  }, [videoTexture]);

  // Track input video dimensions to compute aspect
  useFrame(() => {
    const img = videoTexture && videoTexture.image;
    const w = (img && (img.videoWidth || img.width)) || 0;
    const h = (img && (img.videoHeight || img.height)) || 0;
    if (w && h) {
      const { w: lw, h: lh } = lastDimsRef.current;
      if (lw !== w || lh !== h) {
        lastDimsRef.current = { w, h };
        setVideoAspect(w / h);
      }
    }
    if (mapTex) mapTex.needsUpdate = true;
  });

  // Composition plane sizing
  const { size } = useThree();
  const compositionAspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9);
  const planeW = compositionAspect * 2;
  const planeH = 2;

  // Compute mesh scale based on fitMode
  let scaleX = 1, scaleY = 1;
  if (fitMode === 'contain') {
    if (videoAspect > compositionAspect) scaleY = compositionAspect / videoAspect; else scaleX = videoAspect / compositionAspect;
  } else if (fitMode === 'none') {
    const compWpx = size && size.width || 1;
    const compHpx = size && size.height || 1;
    const vW = lastDimsRef.current.w || compWpx;
    const vH = lastDimsRef.current.h || compHpx;
    scaleX = Math.max(0.0001, vW / compWpx);
    scaleY = Math.max(0.0001, vH / compHpx);
  }

  // Apply wrapping/repeat/offset for cover/tile
  useEffect(() => {
    const t = mapTex;
    if (!t) return;
    if (fitMode === 'cover') {
      t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      let repX = 1, repY = 1, offX = 0, offY = 0;
      if (videoAspect > compositionAspect) { repX = Math.max(0.0001, compositionAspect / videoAspect); repY = 1; offX = (1 - repX) / 2; }
      else if (videoAspect < compositionAspect) { repX = 1; repY = Math.max(0.0001, videoAspect / compositionAspect); offY = (1 - repY) / 2; }
      t.repeat.set(repX, repY); t.offset.set(offX, offY); t.needsUpdate = true; return;
    }
    if (fitMode === 'tile') {
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
      let tileW = planeW, tileH = planeH;
      const wFit = planeH * videoAspect;
      if (wFit <= planeW) { tileW = wFit; tileH = planeH; } else { tileW = planeW; tileH = planeW / videoAspect; }
      let repX = Math.max(0.0001, planeW / tileW);
      let repY = Math.max(0.0001, planeH / tileH);
      t.repeat.set(repX, repY); t.offset.set(0, 0); t.needsUpdate = true; return;
    }
    // stretch/contain/none default mapping
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(1, 1); t.offset.set(0, 0); t.needsUpdate = true;
  }, [mapTex, fitMode, planeW, planeH, videoAspect, compositionAspect]);

  if (!mapTex) return null;

  return React.createElement('mesh', { scale: [ (mirror ? -1 : 1) * scaleX, scaleY, 1 ] },
    React.createElement('planeGeometry', { args: [planeW, planeH] }),
    React.createElement('meshBasicMaterial', { map: mapTex, transparent: false, side: THREE.DoubleSide })
  );
}


