import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';
import { sourceTextureRegistry } from '../../utils/SourceTextureRegistry';

interface WebcamSourceProps {
	deviceId?: string;
	width?: number;
	height?: number;
	fps?: number;
	mirror?: boolean;
}

const WebcamSource: React.FC<WebcamSourceProps> = ({
	deviceId = '',
	width = 1280,
	height = 720,
	fps = 30,
	mirror = true
}) => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
	const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
	const streamRef = useRef<MediaStream | null>(null);

	// Start webcam stream
	useEffect(() => {
		let mounted = true;
    const start = async () => {
			try {
				const constraints: MediaStreamConstraints = {
					video: {
						deviceId: deviceId ? { exact: deviceId } : undefined,
						width: { ideal: width },
						height: { ideal: height },
						frameRate: { ideal: fps }
					},
					audio: false
				};
				const stream = await navigator.mediaDevices.getUserMedia(constraints);
				if (!mounted) return;
				streamRef.current = stream;
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        try { video.setAttribute('muted', ''); } catch {}
        video.playsInline = true;
        video.srcObject = stream;
				videoRef.current = video;

				// Wait for metadata to know dimensions
				await new Promise<void>((resolve) => {
					const onLoaded = () => resolve();
					video.addEventListener('loadedmetadata', onLoaded, { once: true });
				});

        if (video.videoWidth && video.videoHeight) {
					setVideoAspect(video.videoWidth / video.videoHeight);
				}

				const tex = new THREE.VideoTexture(video);
				tex.minFilter = THREE.LinearFilter;
				tex.magFilter = THREE.LinearFilter;
				tex.format = THREE.RGBAFormat;
				tex.generateMipmaps = false;
				try {
					(tex as any).colorSpace = (THREE as any).SRGBColorSpace || (tex as any).colorSpace;
					if (!(tex as any).colorSpace && (THREE as any).sRGBEncoding) {
						(tex as any).encoding = (THREE as any).sRGBEncoding;
					}
				} catch {}
        try { await video.play(); } catch {}
        setVideoTexture(tex);
        // Register texture so visual effects can use it as a videoTexture input
        try { sourceTextureRegistry.setTexture('WebcamSource', tex); } catch {}
			} catch (err) {
				console.error('Failed to start webcam:', err);
			}
		};
		start();
		return () => {
			mounted = false;
			try {
				if (streamRef.current) {
					streamRef.current.getTracks().forEach((t) => t.stop());
					streamRef.current = null;
				}
			} catch {}
      try { videoRef.current && (videoRef.current.srcObject = null); } catch {}
      try { sourceTextureRegistry.removeTexture('WebcamSource'); } catch {}
			setVideoTexture(null);
		};
	}, [deviceId, width, height, fps]);

	// Keep texture fresh
	useFrame(() => {
		if (videoTexture && videoRef.current && videoRef.current.readyState >= 2) {
			videoTexture.needsUpdate = true;
			if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
				const a = videoRef.current.videoWidth / videoRef.current.videoHeight;
				if (Math.abs(a - videoAspect) > 0.001) setVideoAspect(a);
			}
		}
	});

	// Geometry sized to cover composition (2 world units height)
	const { size } = useThree();
	const compositionAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9; // fallback
	const scaleX = Math.max(compositionAspect / videoAspect, 1);
	const scaleY = Math.max(videoAspect / compositionAspect, 1);
	const planeW = compositionAspect * 2 * scaleX;
	const planeH = 2 * scaleY;

	return (
    videoTexture ? (
      <mesh scale={[mirror ? -1 : 1, 1, 1]}>
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial
          map={videoTexture}
          transparent={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    ) : null
	);
};

// Metadata for dynamic discovery as a Source
(WebcamSource as any).metadata = {
	name: 'Webcam Source',
	description: 'Live webcam feed as a source layer',
	category: 'Sources',
	icon: '',
	author: 'VJ System',
	version: '1.0.0',
	folder: 'sources',
	isSource: true,
	parameters: [
		{ name: 'deviceId', type: 'select', value: '', description: 'Camera device', options: [{ value: '', label: 'Default Camera' }] },
		{ name: 'width', type: 'number', value: 1280, min: 160, max: 3840, step: 1, description: 'Requested width' },
		{ name: 'height', type: 'number', value: 720, min: 120, max: 2160, step: 1, description: 'Requested height' },
		{ name: 'fps', type: 'number', value: 30, min: 1, max: 60, step: 1, description: 'Requested frame rate' },
		{ name: 'mirror', type: 'boolean', value: true, description: 'Mirror horizontally' }
	]
};

// Register effect under stable names for discovery
registerEffect('webcam-source', WebcamSource);
registerEffect('WebcamSource', WebcamSource);

export default WebcamSource;

// Dynamically populate camera device options for the parameter UI
async function populateCameraOptions() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
    const options = [{ value: '', label: 'Default Camera' }].concat(
      videoInputs.map((d, i) => ({ value: d.deviceId || '', label: d.label || `Camera ${i + 1}` }))
    );
    const md = (WebcamSource as any).metadata;
    if (md?.parameters) {
      const idx = md.parameters.findIndex((p: any) => p.name === 'deviceId');
      if (idx >= 0) {
        md.parameters[idx] = { ...md.parameters[idx], options };
      }
    }
  } catch (e) {
    // ignore
  }
}

populateCameraOptions();


