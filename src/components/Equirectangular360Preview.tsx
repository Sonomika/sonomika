import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface Equirectangular360PreviewProps {
  /** The source canvas element containing the equirectangular content */
  sourceCanvas: HTMLCanvasElement | null;
  /** Width of the preview container */
  width?: number;
  /** Height of the preview container */
  height?: number;
  /** Whether the content is actively playing/animating */
  isPlaying?: boolean;
  /** Initial field of view (default: 75) */
  initialFov?: number;
  /** Minimum FOV for zoom (default: 30) */
  minFov?: number;
  /** Maximum FOV for zoom (default: 120) */
  maxFov?: number;
  /** Enable/disable zoom with scroll (default: true) */
  enableZoom?: boolean;
  /** Enable/disable pan with mouse drag (default: true) */
  enablePan?: boolean;
  /** Auto-rotate when not interacting (default: false) */
  autoRotate?: boolean;
  /** Auto-rotate speed (default: 0.5) */
  autoRotateSpeed?: number;
}

/**
 * Helper to check if canvas has valid dimensions
 */
const isCanvasReady = (canvas: HTMLCanvasElement | null): boolean => {
  if (!canvas) return false;
  return canvas.width > 0 && canvas.height > 0;
};

/**
 * Inner sphere mesh that renders equirectangular content
 */
const EquirectangularSphere: React.FC<{
  sourceCanvas: HTMLCanvasElement | null;
  isPlaying?: boolean;
}> = ({ sourceCanvas, isPlaying = false }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lastCanvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const frameCountRef = useRef(0);
  const { gl } = useThree();

  // Create and update texture from source canvas
  useEffect(() => {
    // Don't create texture if canvas isn't ready
    if (!isCanvasReady(sourceCanvas)) {
      return;
    }

    // Check if canvas size changed - if so, recreate texture
    const needsRecreate = !textureRef.current || 
      lastCanvasSizeRef.current.width !== sourceCanvas!.width ||
      lastCanvasSizeRef.current.height !== sourceCanvas!.height;

    if (needsRecreate) {
      // Dispose old texture if exists
      if (textureRef.current) {
        try { textureRef.current.dispose(); } catch {}
      }

      const canvasTexture = new THREE.CanvasTexture(sourceCanvas!);
      // Use LinearFilter only - NO mipmaps for performance (they regenerate every frame!)
      canvasTexture.minFilter = THREE.LinearFilter;
      canvasTexture.magFilter = THREE.LinearFilter;
      canvasTexture.wrapS = THREE.RepeatWrapping;
      canvasTexture.wrapT = THREE.ClampToEdgeWrapping;
      canvasTexture.generateMipmaps = false; // Critical for performance!
      
      // Enable anisotropic filtering for sharper textures at angles
      try {
        const maxAnisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy()); // Limit to 4x for performance
        canvasTexture.anisotropy = maxAnisotropy;
      } catch {}
      
      // Correct color space
      try {
        (canvasTexture as any).colorSpace = (THREE as any).SRGBColorSpace;
      } catch {}

      textureRef.current = canvasTexture;
      lastCanvasSizeRef.current = { width: sourceCanvas!.width, height: sourceCanvas!.height };
      setTexture(canvasTexture);
    }

    return () => {
      // Only dispose on unmount, not on every re-render
    };
  }, [sourceCanvas, sourceCanvas?.width, sourceCanvas?.height, gl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (textureRef.current) {
        try { textureRef.current.dispose(); } catch {}
        textureRef.current = null;
      }
    };
  }, []);

  // Update texture - skip some frames to improve performance
  // The 360 view doesn't need 60fps texture updates, 30fps is smooth enough
  useFrame(() => {
    frameCountRef.current++;
    
    if (!textureRef.current || !isCanvasReady(sourceCanvas)) {
      return;
    }
    
    // Check if canvas size changed during playback
    if (sourceCanvas!.width !== lastCanvasSizeRef.current.width ||
        sourceCanvas!.height !== lastCanvasSizeRef.current.height) {
      // Size changed, need to recreate texture on next effect run
      return;
    }
    
    // Only update texture every 2nd frame (effectively 30fps on 60fps displays)
    // This significantly reduces GPU texture upload overhead
    if (frameCountRef.current % 2 !== 0) {
      return;
    }
    
    // Only update if playing or marked as needing update
    if (isPlaying || sourceCanvas!.dataset.needsUpdate === 'true') {
      try {
        textureRef.current.needsUpdate = true;
      } catch (e) {
        // Silently ignore WebGL errors during texture update
      }
    }
  });

  // Sphere geometry - 64x32 segments is sufficient and much faster than 128x64
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(500, 64, 32);
    // Flip the geometry inside out so we see it from the inside
    geo.scale(-1, 1, 1);
    return geo;
  }, []);

  // Don't render until we have a valid texture
  if (!texture || !isCanvasReady(sourceCanvas)) {
    return null;
  }

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        side={THREE.FrontSide}
        toneMapped={false}
      />
    </mesh>
  );
};

/**
 * Camera controls for 360 navigation
 */
const SphericalControls: React.FC<{
  enableZoom?: boolean;
  enablePan?: boolean;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  minFov?: number;
  maxFov?: number;
  initialFov?: number;
}> = ({
  enableZoom = true,
  enablePan = true,
  autoRotate = false,
  autoRotateSpeed = 0.5,
  minFov = 30,
  maxFov = 120,
  initialFov = 75,
}) => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);

  // Set initial FOV
  useEffect(() => {
    if (camera && 'fov' in camera) {
      (camera as THREE.PerspectiveCamera).fov = initialFov;
      camera.updateProjectionMatrix();
    }
  }, [camera, initialFov]);

  // Handle zoom via FOV adjustment (more natural for 360 viewing)
  useEffect(() => {
    if (!enableZoom) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (camera && 'fov' in camera) {
        const perspCamera = camera as THREE.PerspectiveCamera;
        const delta = e.deltaY * 0.05;
        const newFov = Math.max(minFov, Math.min(maxFov, perspCamera.fov + delta));
        perspCamera.fov = newFov;
        perspCamera.updateProjectionMatrix();
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [camera, gl, enableZoom, minFov, maxFov]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={false} // We handle zoom via FOV
      enablePan={false} // No panning in spherical view
      enableRotate={enablePan}
      rotateSpeed={-0.3} // Negative for natural drag direction
      autoRotate={autoRotate}
      autoRotateSpeed={autoRotateSpeed}
      // Limit vertical rotation to avoid flipping
      minPolarAngle={0.1}
      maxPolarAngle={Math.PI - 0.1}
      // Make controls more responsive
      dampingFactor={0.1}
      enableDamping={true}
    />
  );
};

/**
 * Equirectangular 360 Preview Component
 * 
 * Renders equirectangular content (2:1 aspect ratio) onto a sphere,
 * allowing users to pan around the 360 view using mouse controls,
 * similar to YouTube 360 video player.
 */
export const Equirectangular360Preview: React.FC<Equirectangular360PreviewProps> = ({
  sourceCanvas,
  width = 640,
  height = 360,
  isPlaying = false,
  initialFov = 75,
  minFov = 30,
  maxFov = 120,
  enableZoom = true,
  enablePan = true,
  autoRotate = false,
  autoRotateSpeed = 0.5,
}) => {
  // Track if canvas is ready for rendering
  const canvasReady = isCanvasReady(sourceCanvas);
  
  // Track if we were playing to maintain frameloop during brief canvas unavailability
  const wasPlayingRef = useRef(false);
  if (isPlaying) {
    wasPlayingRef.current = true;
  }
  // Reset wasPlaying after a delay if isPlaying becomes false
  useEffect(() => {
    if (!isPlaying) {
      const timeout = setTimeout(() => {
        wasPlayingRef.current = false;
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isPlaying]);
  
  // Use 'always' frameloop when playing OR if we were recently playing (to survive canvas transitions)
  // This prevents the preview from stopping during fullscreen transitions
  const frameloop = (isPlaying || wasPlayingRef.current) ? 'always' : 'demand';
  
  // Cap DPR at 1.5 for performance - the source canvas already has the full resolution
  const dpr = typeof window !== 'undefined' ? Math.min(1.5, window.devicePixelRatio) : 1;
  
  return (
    <div
      className="tw-flex tw-flex-col tw-w-full tw-h-full tw-overflow-hidden"
      style={{ width: '100%', height: '100%' }}
    >
      {/* Canvas container */}
      <div className="tw-relative tw-flex-1 tw-min-h-0 tw-rounded tw-overflow-hidden">
        <Canvas
          camera={{
            position: [0, 0, 0.1], // Camera at center of sphere
            fov: initialFov,
            near: 0.1,
            far: 1000,
          }}
          gl={{
            alpha: false,
            antialias: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true,
          }}
          frameloop={frameloop}
          dpr={dpr}
          style={{ width: '100%', height: '100%' }}
          onCreated={({ gl }) => {
            // Ensure high quality rendering
            try {
              if ((gl as any).outputColorSpace !== undefined && (THREE as any).SRGBColorSpace) {
                (gl as any).outputColorSpace = (THREE as any).SRGBColorSpace;
              }
              (gl as any).toneMapping = (THREE as any).NoToneMapping;
            } catch {}
          }}
        >
          <EquirectangularSphere
            sourceCanvas={sourceCanvas}
            isPlaying={isPlaying && canvasReady}
          />
          <SphericalControls
            enableZoom={enableZoom}
            enablePan={enablePan}
            autoRotate={autoRotate}
            autoRotateSpeed={autoRotateSpeed}
            minFov={minFov}
            maxFov={maxFov}
            initialFov={initialFov}
          />
        </Canvas>
      </div>
      
      {/* Instructions below the canvas */}
      <div className="tw-text-center tw-text-neutral-400 tw-text-xs tw-py-1 tw-px-2 tw-flex-shrink-0 tw-font-sans">
        Drag to look around {enableZoom && '| Scroll to zoom'}
      </div>
    </div>
  );
};

/**
 * Helper function to detect if composition is equirectangular (2:1 aspect ratio)
 */
export const isEquirectangularAspectRatio = (width: number, height: number): boolean => {
  if (!width || !height || height === 0) return false;
  const ratio = width / height;
  // Allow small tolerance for 2:1 aspect ratio
  return Math.abs(ratio - 2) < 0.01;
};

export default Equirectangular360Preview;
