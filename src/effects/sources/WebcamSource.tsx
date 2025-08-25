import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';
import { sourceTextureRegistry } from '../../utils/SourceTextureRegistry';
import { getWebcamManager } from '../../utils/WebcamManager';

interface WebcamSourceProps {
	deviceId?: string;
	width?: number;
	height?: number;
	fps?: number;
	mirror?: boolean;
	fitMode?: 'cover' | 'contain' | 'stretch' | 'none' | 'tile';
}

const WebcamSource: React.FC<WebcamSourceProps> = ({
	deviceId = '',
	width = 1280,
	height = 720,
	fps = 30,
	mirror = true,
	fitMode = 'cover'
}) => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
	const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
	const streamRef = useRef<MediaStream | null>(null);

	// Start webcam stream via global manager (keeps stream alive across unmounts)
	useEffect(() => {
		let mounted = true;
		const mgr = getWebcamManager();
		const cfg = { deviceId, width, height, fps } as any;
		const start = async () => {
			try {
				const entry = await mgr.retain(cfg);
				if (!mounted) return;
				streamRef.current = entry.stream;
				const video = entry.video!;
				videoRef.current = video;

				if (video.videoWidth && video.videoHeight) {
					setVideoAspect(video.videoWidth / video.videoHeight);
				}

				let tex = mgr.getTexture(cfg) as THREE.VideoTexture | null;
				if (!tex) {
					tex = new THREE.VideoTexture(video);
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
					mgr.setTexture(cfg, tex);
				}
				setVideoTexture(tex);
				try { sourceTextureRegistry.setTexture('WebcamSource', tex!); } catch {}
			} catch (err) {
				console.error('Failed to start webcam:', err);
			}
		};
		start();
		return () => {
			mounted = false;
			try { sourceTextureRegistry.removeTexture('WebcamSource'); } catch {}
			setVideoTexture(null);
			mgr.release(cfg);
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

	// Geometry sized to composition (2 world units height)
	const { size } = useThree();
	const compositionAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9; // fallback
	const planeW = compositionAspect * 2;
	const planeH = 2;

	// Resolve effective fit mode from global settings if not provided
	let effectiveFitMode: 'cover' | 'contain' | 'stretch' | 'none' | 'tile' = fitMode as any;
	try {
		const storeModule: any = require('../../store/store');
		const useStore = (storeModule && (storeModule.useStore || storeModule.default?.useStore)) || storeModule.useStore;
		const globalDefault = useStore?.getState?.().defaultVideoFitMode;
		if (!fitMode && globalDefault) effectiveFitMode = globalDefault;
	} catch {}

	// Compute mesh scale based on fitMode
	let scaleX = 1;
	let scaleY = 1;
	if (effectiveFitMode === 'contain') {
		if (videoAspect > compositionAspect) {
			scaleY = compositionAspect / videoAspect;
		} else {
			scaleX = videoAspect / compositionAspect;
		}
	} else if (effectiveFitMode === 'cover') {
		// Keep scale at 1; cover will be achieved via texture cropping below
		scaleX = 1;
		scaleY = 1;
	} else if (effectiveFitMode === 'stretch') {
		scaleX = 1;
		scaleY = 1;
	} else if (effectiveFitMode === 'none') {
		// Original pixel size relative to current composition preview size
		const compWpx = size.width || 1;
		const compHpx = size.height || 1;
		const vW = (videoRef.current?.videoWidth || width);
		const vH = (videoRef.current?.videoHeight || height);
		scaleX = Math.max(0.0001, vW / compWpx);
		scaleY = Math.max(0.0001, vH / compHpx);
	} else if (effectiveFitMode === 'tile') {
		// Use full plane and let tiling handle repeat
		scaleX = 1;
		scaleY = 1;
	}

	// Apply repeat/cropping based on fitMode
	useEffect(() => {
		if (!videoTexture) return;
		const tex = videoTexture;
		if (effectiveFitMode === 'cover') {
			tex.wrapS = THREE.ClampToEdgeWrapping;
			tex.wrapT = THREE.ClampToEdgeWrapping;
			let repX = 1, repY = 1, offX = 0, offY = 0;
			// Crop the longer dimension while keeping content centered
			if (videoAspect > compositionAspect) {
				// Video wider than canvas: crop horizontally
				repX = Math.max(0.0001, compositionAspect / videoAspect);
				repY = 1;
				offX = (1 - repX) / 2;
				offY = 0;
			} else if (videoAspect < compositionAspect) {
				// Video taller (narrower) than canvas: crop vertically
				repX = 1;
				repY = Math.max(0.0001, videoAspect / compositionAspect);
				offX = 0;
				offY = (1 - repY) / 2;
			} else {
				repX = 1; repY = 1; offX = 0; offY = 0;
			}
			tex.repeat.set(repX, repY);
			tex.offset.set(offX, offY);
			tex.needsUpdate = true;
			return;
		}
		if (effectiveFitMode === 'tile') {
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			// Determine tile size using contain semantics per tile
			let tileW = planeW;
			let tileH = planeH;
			const wFit = planeH * videoAspect;
			if (wFit <= planeW) { tileW = wFit; tileH = planeH; }
			else { tileW = planeW; tileH = planeW / videoAspect; }
			let repX = Math.max(0.0001, planeW / tileW);
			let repY = Math.max(0.0001, planeH / tileH);
			tex.repeat.set(repX, repY);
			tex.offset.set(0, 0);
			tex.needsUpdate = true;
			return;
		}
		// contain, stretch, none: no crop, no repeat
		tex.wrapS = THREE.ClampToEdgeWrapping;
		tex.wrapT = THREE.ClampToEdgeWrapping;
		tex.repeat.set(1, 1);
		tex.offset.set(0, 0);
		tex.needsUpdate = true;
	}, [videoTexture, effectiveFitMode, planeW, planeH, videoAspect, compositionAspect]);

	return (
		videoTexture ? (
			<mesh scale={[ (mirror ? -1 : 1) * scaleX, scaleY, 1 ]}>
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
		{ name: 'deviceId', type: 'select', value: '', description: 'Camera device', options: [{ value: '', label: 'Default Camera' }], lockDefault: true },
		{ name: 'mirror', type: 'boolean', value: true, description: 'Mirror horizontally' },
		{ name: 'fitMode', type: 'select', value: 'cover', description: 'Video Size', options: [
			{ value: 'none', label: 'Original' },
			{ value: 'contain', label: 'Fit' },
			{ value: 'cover', label: 'Fill' },
			{ value: 'stretch', label: 'Stretch' },
			{ value: 'tile', label: 'Tile' }
		] }
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


