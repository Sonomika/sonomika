import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { registerEffect } from '../../utils/effectRegistry';

// Blob data structure
interface Blob {
  id: number;
  centroid: { x: number; y: number };
  area: number;
  smoothedCentroid: { x: number; y: number };
}

// Connected Component Labeling class
class ConnectedComponentLabeler {
  private labels: Uint32Array;
  private equivalences: number[];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.labels = new Uint32Array(width * height);
    this.equivalences = [];
  }

  // Union-Find helper functions
  private find(x: number): number {
    if (this.equivalences[x] !== x) {
      this.equivalences[x] = this.find(this.equivalences[x]);
    }
    return this.equivalences[x];
  }

  private union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX !== rootY) {
      this.equivalences[rootX] = rootY;
    }
  }

  // Two-pass connected component labeling
  labelComponents(binaryMask: Uint8Array): Map<number, Blob> {
    const { width, height } = this;
    this.labels.fill(0);
    this.equivalences = [0]; // Start with label 0 (background)
    let nextLabel = 1;

    // First pass - assign provisional labels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        if (binaryMask[idx] === 0) continue; // Background pixel

        const neighbors = [];
        
        // Check 4-connected neighbors (left and top)
        if (x > 0 && this.labels[idx - 1] > 0) neighbors.push(this.labels[idx - 1]);
        if (y > 0 && this.labels[idx - width] > 0) neighbors.push(this.labels[idx - width]);

        if (neighbors.length === 0) {
          // New component
          this.labels[idx] = nextLabel;
          this.equivalences[nextLabel] = nextLabel;
          nextLabel++;
        } else {
          // Assign minimum neighbor label
          const minLabel = Math.min(...neighbors);
          this.labels[idx] = minLabel;
          
          // Record equivalences
          for (const neighbor of neighbors) {
            if (neighbor !== minLabel) {
              this.union(minLabel, neighbor);
            }
          }
        }
      }
    }

    // Second pass - resolve equivalences and collect blob data
    const blobData = new Map<number, {
      area: number;
      sumX: number;
      sumY: number;
    }>();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (this.labels[idx] > 0) {
          const rootLabel = this.find(this.labels[idx]);
          this.labels[idx] = rootLabel;

          if (!blobData.has(rootLabel)) {
            blobData.set(rootLabel, { area: 0, sumX: 0, sumY: 0 });
          }

          const blob = blobData.get(rootLabel)!;
          blob.area++;
          blob.sumX += x;
          blob.sumY += y;
        }
      }
    }

    // Convert to final blob format
    const blobs = new Map<number, Blob>();
    for (const [label, data] of blobData) {
      if (data.area > 0) {
        blobs.set(label, {
          id: label,
          centroid: {
            x: data.sumX / data.area,
            y: data.sumY / data.area
          },
          area: data.area,
          smoothedCentroid: {
            x: data.sumX / data.area,
            y: data.sumY / data.area
          }
        });
      }
    }

    return blobs;
  }
}

// Background subtraction class
class BackgroundSubtractor {
  private referenceFrame: Uint8Array | null = null;

  constructor(_width: number, _height: number) {
    // width and height not needed for this implementation
  }

  captureReference(greyscaleData: Uint8Array): void {
    if (!this.referenceFrame || this.referenceFrame.length !== greyscaleData.length) {
      this.referenceFrame = new Uint8Array(greyscaleData.length);
    }
    this.referenceFrame.set(greyscaleData);
  }

  subtract(greyscaleData: Uint8Array, threshold: number): Uint8Array {
    if (!this.referenceFrame) {
      return greyscaleData;
    }

    const result = new Uint8Array(greyscaleData.length);
    for (let i = 0; i < greyscaleData.length; i++) {
      const diff = Math.abs(greyscaleData[i] - this.referenceFrame[i]);
      result[i] = diff > threshold ? greyscaleData[i] : 0;
    }
    return result;
  }

  hasReference(): boolean {
    return this.referenceFrame !== null;
  }
}

// Centroid smoother with exponential filtering
class CentroidSmoother {
  private previousCentroids = new Map<number, { x: number; y: number }>();
  private alpha: number;
  private deadZone: number;

  constructor(alpha = 0.7, deadZone = 2.0) {
    this.alpha = alpha;
    this.deadZone = deadZone;
  }

  smooth(blobs: Map<number, Blob>): void {
    for (const [id, blob] of blobs) {
      const prev = this.previousCentroids.get(id);
      if (prev) {
        const dx = blob.centroid.x - prev.x;
        const dy = blob.centroid.y - prev.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.deadZone) {
          // Within dead zone, keep previous position
          blob.smoothedCentroid = { ...prev };
        } else {
          // Apply exponential smoothing
          blob.smoothedCentroid = {
            x: this.alpha * blob.centroid.x + (1 - this.alpha) * prev.x,
            y: this.alpha * blob.centroid.y + (1 - this.alpha) * prev.y
          };
        }
      } else {
        blob.smoothedCentroid = { ...blob.centroid };
      }

      this.previousCentroids.set(id, blob.smoothedCentroid);
    }

    // Clean up old centroids
    const currentIds = new Set(blobs.keys());
    for (const [id] of this.previousCentroids) {
      if (!currentIds.has(id)) {
        this.previousCentroids.delete(id);
      }
    }
  }
}

interface BlobDetectionEffectProps {
  enabled?: boolean;
  threshold?: number;
  minArea?: number;
  maxArea?: number;
  maxBlobs?: number;
  analysisScale?: number;
  smoothingAlpha?: number;
  deadZone?: number;
  backgroundSubtraction?: boolean;
  visualizeBlobs?: boolean;
  blobColor?: string;
  onBlobsDetected?: (blobs: Blob[]) => void;
}

const BlobDetectionEffect: React.FC<BlobDetectionEffectProps> = ({
  enabled = true,
  threshold = 128,
  minArea = 50,
  maxArea = 5000,
  maxBlobs = 10,
  analysisScale = 0.25,
  smoothingAlpha = 0.7,
  deadZone = 2.0,
  backgroundSubtraction = false,
  visualizeBlobs = true,
  blobColor = '#ff0000',
  onBlobsDetected
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const meshRefs = useRef<THREE.Mesh[]>([]);
  
  // Processing utilities
  const ccl = useRef<ConnectedComponentLabeler | null>(null);
  const backgroundSubtractor = useRef<BackgroundSubtractor | null>(null);
  const centroidSmoother = useRef<CentroidSmoother | null>(null);
  
  // Reusable arrays for performance
  const greyscaleDataRef = useRef<Uint8Array | null>(null);
  const binaryMaskRef = useRef<Uint8Array | null>(null);

  // Initialize processing utilities
  useEffect(() => {
    if (!analysisCanvasRef.current) return;

    const canvas = analysisCanvasRef.current;
    const analysisWidth = Math.floor(640 * analysisScale);
    const analysisHeight = Math.floor(480 * analysisScale);
    
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;

    ccl.current = new ConnectedComponentLabeler(analysisWidth, analysisHeight);
    backgroundSubtractor.current = new BackgroundSubtractor(analysisWidth, analysisHeight);
    centroidSmoother.current = new CentroidSmoother(smoothingAlpha, deadZone);

    // Initialize reusable arrays
    const pixelCount = analysisWidth * analysisHeight;
    greyscaleDataRef.current = new Uint8Array(pixelCount);
    binaryMaskRef.current = new Uint8Array(pixelCount);
  }, [analysisScale, smoothingAlpha, deadZone]);

  // Convert RGB to greyscale using weighted average
  const convertToGreyscale = (imageData: ImageData): Uint8Array => {
    const { data, width, height } = imageData;
    const greyscale = greyscaleDataRef.current!;
    
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // Standard luminance weights
      greyscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    return greyscale;
  };

  // Apply dynamic threshold to create binary mask
  const applyThreshold = (greyscaleData: Uint8Array): Uint8Array => {
    const binaryMask = binaryMaskRef.current!;
    
    for (let i = 0; i < greyscaleData.length; i++) {
      binaryMask[i] = greyscaleData[i] > threshold ? 255 : 0;
    }
    
    return binaryMask;
  };

  // Filter blobs by area and return top N
  const filterBlobs = (blobs: Map<number, Blob>): Blob[] => {
    return Array.from(blobs.values())
      .filter(blob => blob.area >= minArea && blob.area <= maxArea)
      .sort((a, b) => b.area - a.area)
      .slice(0, maxBlobs);
  };

  // Map blob coordinates to Three.js scene coordinates
  const mapToSceneCoordinates = (blob: Blob, canvasWidth: number, canvasHeight: number) => {
    // Normalize to [0, 1]
    const normalizedX = blob.smoothedCentroid.x / canvasWidth;
    const normalizedY = blob.smoothedCentroid.y / canvasHeight;
    
    // Convert to NDC [-1, 1]
    const ndcX = normalizedX * 2 - 1;
    const ndcY = -(normalizedY * 2 - 1); // Flip Y axis
    
    return { x: ndcX * 5, y: ndcY * 5, z: 0 }; // Scale for scene
  };

  // Process video frame for blob detection
  const processFrame = () => {
    if (!enabled || !canvasRef.current || !analysisCanvasRef.current) return;

    const canvas = canvasRef.current;
    const analysisCanvas = analysisCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const analysisCtx = analysisCanvas.getContext('2d');
    
    if (!ctx || !analysisCtx || !ccl.current || !centroidSmoother.current) return;

    try {
      // Draw downscaled version for analysis
      analysisCtx.drawImage(canvas, 0, 0, analysisCanvas.width, analysisCanvas.height);
      
      // Get image data
      const imageData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
      
      // Convert to greyscale
      let greyscaleData = convertToGreyscale(imageData);
      
      // Apply background subtraction if enabled
      if (backgroundSubtraction && backgroundSubtractor.current) {
        if (!backgroundSubtractor.current.hasReference()) {
          // Capture first frame as reference
          backgroundSubtractor.current.captureReference(greyscaleData);
        } else {
          greyscaleData = backgroundSubtractor.current.subtract(greyscaleData, threshold / 2);
        }
      }
      
      // Apply threshold to create binary mask
      const binaryMask = applyThreshold(greyscaleData);
      
      // Perform connected component labeling
      const blobMap = ccl.current.labelComponents(binaryMask);
      
      // Filter blobs and apply smoothing
      let filteredBlobs = filterBlobs(blobMap);
      
      if (filteredBlobs.length > 0) {
        const blobMap = new Map(filteredBlobs.map(blob => [blob.id, blob]));
        centroidSmoother.current.smooth(blobMap);
        filteredBlobs = Array.from(blobMap.values());
      }

      // Update mesh positions
      filteredBlobs.forEach((blob, index) => {
        if (index < meshRefs.current.length) {
          const mesh = meshRefs.current[index];
          const sceneCoords = mapToSceneCoordinates(blob, analysisCanvas.width, analysisCanvas.height);
          mesh.position.set(sceneCoords.x, sceneCoords.y, sceneCoords.z);
          mesh.visible = true;
          
          // Scale based on blob area
          const scale = Math.sqrt(blob.area) / 50;
          mesh.scale.set(scale, scale, scale);
        }
      });

      // Hide unused meshes
      for (let i = filteredBlobs.length; i < meshRefs.current.length; i++) {
        meshRefs.current[i].visible = false;
      }

      // Visualize blobs on canvas if enabled
      if (visualizeBlobs) {
        ctx.save();
        ctx.strokeStyle = blobColor;
        ctx.lineWidth = 2;
        
        filteredBlobs.forEach(blob => {
          const x = (blob.smoothedCentroid.x / analysisCanvas.width) * canvas.width;
          const y = (blob.smoothedCentroid.y / analysisCanvas.height) * canvas.height;
          const radius = Math.sqrt(blob.area) * (canvas.width / analysisCanvas.width) / 10;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw centroid
          ctx.fillStyle = blobColor;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        });
        
        ctx.restore();
      }

      // Call callback with detected blobs
      if (onBlobsDetected) {
        onBlobsDetected(filteredBlobs);
      }
    } catch (error) {
      console.error('Error processing frame for blob detection:', error);
    }
  };

  // Capture reference frame for background subtraction
  const captureReference = () => {
    if (backgroundSubtractor.current) {
      // Force capture on next frame
      const current = backgroundSubtractor.current;
      // Reset reference to force capture
      (current as any).referenceFrame = null;
    }
  };

  // Create blob visualization meshes
  const blobMeshes = useMemo(() => {
    const meshes: React.ReactElement[] = [];
    
    for (let i = 0; i < maxBlobs; i++) {
      meshes.push(
        <mesh
          key={i}
          ref={(mesh) => {
            if (mesh) {
              meshRefs.current[i] = mesh;
            }
          }}
          visible={false}
        >
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial 
            color={blobColor}
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      );
    }
    
    return meshes;
  }, [maxBlobs, blobColor]);

  // Process frames
  useFrame(() => {
    if (enabled) {
      processFrame();
    }
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
        width={640}
        height={480}
      />
      <canvas
        ref={analysisCanvasRef}
        style={{ display: 'none' }}
      />
      {blobMeshes}
      {/* Control interface for background subtraction */}
      {backgroundSubtraction && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000 }}>
          <button
            onClick={captureReference}
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              border: 'none',
              borderRadius: '0px',
              cursor: 'pointer'
            }}
          >
            Capture Background
          </button>
        </div>
      )}
    </>
  );
};

// Register the effect for dynamic loading
registerEffect('BlobDetectionEffect', BlobDetectionEffect);
console.log('✅ BlobDetectionEffect registered successfully');

// Force hot reload trigger
console.log('🔥 BlobDetectionEffect hot reload trigger');

export default BlobDetectionEffect;
