import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface VideoSliceKaleidoEffectProps {
	sliceCount?: number;
	sliceWidth?: number;
	baseOffset?: number;
	waveAmplitude?: number;
	waveFrequency?: number;
	waveSpeed?: number;
	sliceDirection?: 'horizontal' | 'vertical';
	alternateDirection?: boolean;
	curvature?: number; // 0..1 bends slices sinusoidally
	rotationAmount?: number; // small per-slice rotation
	kaleidoSegments?: number; // 1 = off, 2/4/6/8 = kaleido
	mirror?: boolean; // simple mirror toggle
	jitter?: number; // random per-slice jitter
	strobe?: number; // 0..1 strength
	colorTint?: string; // hex
	tintStrength?: number; // 0..1
	removeGaps?: boolean;
	videoTexture?: THREE.VideoTexture;
	bpm?: number;
	isGlobal?: boolean;
}

const VideoSliceKaleidoEffect: React.FC<VideoSliceKaleidoEffectProps> = ({
	sliceCount = 32,
	sliceWidth = 0.05,
	baseOffset = 0.25,
	waveAmplitude = 0.25,
	waveFrequency = 2.0,
	waveSpeed = 1.0,
	sliceDirection = 'horizontal',
	alternateDirection = true,
	curvature = 0.15,
	rotationAmount = 0.05,
	kaleidoSegments = 4,
	mirror = false,
	jitter = 0.02,
	strobe = 0.0,
	colorTint = '#ffffff',
	tintStrength = 0.0,
	removeGaps = true,
	videoTexture,
	bpm = 120,
	isGlobal = false
}) => {
	const materialRef = useRef<THREE.ShaderMaterial>(null);
	const meshRef = useRef<THREE.Mesh>(null);
	const lastTextureRef = useRef<THREE.Texture | null>(null);

	// Fallback persistent canvas pattern
	const bufferTexture = useMemo(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 64; canvas.height = 64;
		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 64, 64);
			ctx.fillStyle = '#555'; ctx.fillRect(8, 8, 48, 48);
			ctx.fillStyle = '#888'; ctx.fillRect(16, 16, 32, 32);
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
		return tex;
	}, []);

	// Optional render target if used as global
	const renderTarget = useMemo(() => {
		if (isGlobal || !videoTexture) {
			return new THREE.WebGLRenderTarget(1920, 1080, {
				format: THREE.RGBAFormat,
				type: THREE.UnsignedByteType,
				minFilter: THREE.LinearFilter,
				magFilter: THREE.LinearFilter
			});
		}
		return null;
	}, [isGlobal, videoTexture]);

	// Create shader material
	const shaderMaterial = useMemo(() => {
		const initialTexture: THREE.Texture =
			(lastTextureRef.current as THREE.Texture)
			|| ((videoTexture && !isGlobal) ? (videoTexture as unknown as THREE.Texture) : (renderTarget ? renderTarget.texture : bufferTexture));

		if (!lastTextureRef.current) lastTextureRef.current = initialTexture;

		const vertexShader = `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`;

		const fragmentShader = `
			precision mediump float;
			uniform sampler2D tDiffuse;
			uniform float time;
			uniform float sliceCount;
			uniform float sliceWidth;
			uniform float baseOffset;
			uniform float waveAmp;
			uniform float waveFreq;
			uniform float waveSpeed;
			uniform int direction; // 0=h, 1=v
			uniform int altFlip;
			uniform float curvature;
			uniform float rotAmt;
			uniform int kaleidoSegs; // 1=off
			uniform int mirrorOn;    // 0/1
			uniform float jitterAmt;
			uniform float strobeAmt;
			uniform vec3 tint;
			uniform float tintStrength;
			uniform float bpm;
			uniform float removeGaps;
			uniform int inputIsSRGB;

			varying vec2 vUv;

			float rand(vec2 co){
				return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
			}

			// Rotate around center 0.5,0.5
			vec2 rotateAround(vec2 uv, float angle){
				vec2 p = uv - 0.5;
				float s = sin(angle), c = cos(angle);
				mat2 m = mat2(c, -s, s, c);
				p = m * p;
				return p + 0.5;
			}

			// Simple kaleidoscope
			vec2 kaleido(vec2 uv, int segments){
				if (segments <= 1) return uv;
				vec2 p = uv - 0.5;
				float a = atan(p.y, p.x);
				float r = length(p);
				float PI2 = 6.28318530718;
				float seg = PI2 / float(segments);
				a = mod(a, seg);
				a = abs(a - seg * 0.5);
				vec2 q = vec2(cos(a), sin(a)) * r;
				return q + 0.5;
			}

			void main(){
				vec2 uv = vUv;

				// Optional kaleidoscope and mirror first
				uv = kaleido(uv, kaleidoSegs);
				if (mirrorOn == 1){
					uv.x = abs(uv.x - 0.5) + 0.5;
				}

				// Build slice index and local distortion
				float idx = (direction == 0) ? floor(uv.y * sliceCount) : floor(uv.x * sliceCount);
				float phase = idx * 0.35;
				float wave = sin(time * waveSpeed + phase * waveFreq) * waveAmp;
				float off = baseOffset + wave;
				if (altFlip == 1){
					off *= (mod(idx, 2.0) < 1.0) ? 1.0 : -1.0;
				}

				// Jitter per slice
				float j = (rand(vec2(idx, time)) - 0.5) * jitterAmt;
				off += j;

				// Curvature bend (sine along orthogonal axis)
				float bend = (direction == 0) ? sin(uv.x * 6.28318) : sin(uv.y * 6.28318);
				bend *= curvature * 0.25;

				// Per-slice rotation
				float angle = rotAmt * sin(time * waveSpeed * 0.8 + phase);
				uv = rotateAround(uv, angle);

				// Apply offset depending on direction
				vec2 sampleUV = uv;
				if (direction == 0){
					sampleUV.x = fract(sampleUV.x + off + bend);
				} else {
					sampleUV.y = fract(sampleUV.y + off + bend);
				}

				// Slice mask (if keeping gaps)
				float mask = 1.0;
				if (removeGaps < 0.5){
					if (direction == 0){
						float sy = fract(vUv.y * sliceCount);
						mask = step(sliceWidth, sy) * step(sy, 1.0 - sliceWidth);
					} else {
						float sx = fract(vUv.x * sliceCount);
						mask = step(sliceWidth, sx) * step(sx, 1.0 - sliceWidth);
					}
				}

				vec4 texColor = texture2D(tDiffuse, sampleUV);
				if (inputIsSRGB == 1){ texColor.rgb = pow(texColor.rgb, vec3(2.2)); }

				// Strobe brightness
				float beats = bpm / 60.0;
				float st = (strobeAmt > 0.0) ? step(0.5, fract(time * beats * max(strobeAmt, 0.001))) : 1.0;

				// Tint
				vec3 color = texColor.rgb;
				color = mix(color, tint, clamp(tintStrength, 0.0, 1.0));
				color *= st;

				vec4 outColor = vec4(color, 1.0);
				outColor *= mask;
				gl_FragColor = outColor;
			}
		`;

		const tintColor = new THREE.Color(colorTint);
		// Convert UI sRGB hex to linear to match our linearized texture path
		if ((tintColor as any).convertSRGBToLinear) {
			(tintColor as any).convertSRGBToLinear();
		}

		return new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms: {
				tDiffuse: { value: initialTexture },
				time: { value: 0.0 },
				sliceCount: { value: sliceCount },
				sliceWidth: { value: sliceWidth },
				baseOffset: { value: baseOffset },
				waveAmp: { value: waveAmplitude },
				waveFreq: { value: waveFrequency },
				waveSpeed: { value: waveSpeed },
				direction: { value: sliceDirection === 'horizontal' ? 0 : 1 },
				altFlip: { value: alternateDirection ? 1 : 0 },
				curvature: { value: curvature },
				rotAmt: { value: rotationAmount },
				kaleidoSegs: { value: kaleidoSegments },
				mirrorOn: { value: mirror ? 1 : 0 },
				jitterAmt: { value: jitter },
				strobeAmt: { value: strobe },
				tint: { value: new THREE.Vector3(tintColor.r, tintColor.g, tintColor.b) },
				tintStrength: { value: tintStrength },
				bpm: { value: bpm },
				removeGaps: { value: removeGaps ? 1.0 : 0.0 },
				inputIsSRGB: { value: 1 }
			},
			transparent: false,
			toneMapped: false
		});
	}, []);

	// Update texture and color space flag
	useEffect(() => {
		if (!materialRef.current) return;
		const nextTex: THREE.Texture | null = isGlobal
			? (renderTarget ? renderTarget.texture : bufferTexture)
			: ((videoTexture as unknown as THREE.Texture) || bufferTexture);
		if (nextTex && materialRef.current.uniforms.tDiffuse.value !== nextTex) {
			materialRef.current.uniforms.tDiffuse.value = nextTex;
			lastTextureRef.current = nextTex;
		}
		const isSRGB = !!((nextTex as any)?.isVideoTexture || (nextTex as any)?.isCanvasTexture);
		materialRef.current.uniforms.inputIsSRGB.value = isSRGB ? 1 : 0;
	}, [videoTexture, renderTarget, bufferTexture, isGlobal]);

	// Animate
	useFrame((state) => {
		if (materialRef.current) {
			materialRef.current.uniforms.time.value = state.clock.elapsedTime;
		}
	});

	// Update uniforms on prop change
	useEffect(() => {
		const mat = materialRef.current; if (!mat) return;
		mat.uniforms.sliceCount.value = sliceCount;
		mat.uniforms.sliceWidth.value = sliceWidth;
		mat.uniforms.baseOffset.value = baseOffset;
		mat.uniforms.waveAmp.value = waveAmplitude;
		mat.uniforms.waveFreq.value = waveFrequency;
		mat.uniforms.waveSpeed.value = waveSpeed;
		mat.uniforms.direction.value = sliceDirection === 'horizontal' ? 0 : 1;
		mat.uniforms.altFlip.value = alternateDirection ? 1 : 0;
		mat.uniforms.curvature.value = curvature;
		mat.uniforms.rotAmt.value = rotationAmount;
		mat.uniforms.kaleidoSegs.value = kaleidoSegments;
		mat.uniforms.mirrorOn.value = mirror ? 1 : 0;
		mat.uniforms.jitterAmt.value = jitter;
		mat.uniforms.strobeAmt.value = strobe;
		const tintColor = new THREE.Color(colorTint);
		if ((tintColor as any).convertSRGBToLinear) {
			(tintColor as any).convertSRGBToLinear();
		}
		mat.uniforms.tint.value.set(tintColor.r, tintColor.g, tintColor.b);
		mat.uniforms.tintStrength.value = tintStrength;
		mat.uniforms.bpm.value = bpm;
		mat.uniforms.removeGaps.value = removeGaps ? 1.0 : 0.0;
	}, [sliceCount, sliceWidth, baseOffset, waveAmplitude, waveFrequency, waveSpeed, sliceDirection, alternateDirection, curvature, rotationAmount, kaleidoSegments, mirror, jitter, strobe, colorTint, tintStrength, bpm, removeGaps]);

	// Aspect ratio similar to the working slice effect
	const aspectRatio = useMemo(() => {
		if (videoTexture && videoTexture.image && !isGlobal) {
			try {
				const { width, height } = videoTexture.image as any;
				if (width && height && width > 0 && height > 0) return width / height;
			} catch {}
		}
		return 16 / 9;
	}, [videoTexture, isGlobal]);

	if (!shaderMaterial) return null;

	return (
		<mesh ref={meshRef} position={[0, 0, 0.1]}>
			<planeGeometry args={[aspectRatio * 2, 2]} />
			<primitive object={shaderMaterial} attach="material" ref={materialRef} />
		</mesh>
	);
};

// Metadata
(VideoSliceKaleidoEffect as any).metadata = {
	name: 'Video Slice Kaleido Effect',
	description: 'Advanced slice-based effect with kaleidoscope, alternating offsets, curvature, rotation, jitter, tint and strobe',
	category: 'Video',
	icon: '',
	author: 'VJ System',
	version: '1.0.0',
	replacesVideo: true,
	canBeGlobal: true,
	parameters: [
		{ name: 'sliceCount', type: 'number', value: 32, min: 2, max: 100, step: 1, description: 'Number of slices' },
		{ name: 'sliceWidth', type: 'number', value: 0.05, min: 0.0, max: 0.5, step: 0.005, description: 'Slice gap width for masking' },
		{ name: 'baseOffset', type: 'number', value: 0.25, min: 0.0, max: 1.0, step: 0.005, description: 'Base UV shift amount' },
		{ name: 'waveAmplitude', type: 'number', value: 0.25, min: 0.0, max: 1.0, step: 0.005, description: 'Wave amplitude' },
		{ name: 'waveFrequency', type: 'number', value: 2.0, min: 0.1, max: 10.0, step: 0.1, description: 'Wave frequency' },
		{ name: 'waveSpeed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1, description: 'Wave animation speed' },
		{ name: 'sliceDirection', type: 'select', value: 'horizontal', options: ['horizontal', 'vertical'], description: 'Slice direction' },
		{ name: 'alternateDirection', type: 'boolean', value: true, description: 'Alternate offset direction per slice' },
		{ name: 'curvature', type: 'number', value: 0.15, min: 0.0, max: 1.0, step: 0.01, description: 'Sinusoidal slice curvature' },
		{ name: 'rotationAmount', type: 'number', value: 0.05, min: 0.0, max: 0.5, step: 0.005, description: 'Per-slice rotation amount' },
		{ name: 'kaleidoSegments', type: 'number', value: 4, min: 1, max: 12, step: 1, description: 'Kaleidoscope segment count (1 = off)' },
		{ name: 'mirror', type: 'boolean', value: false, description: 'Mirror horizontally for symmetry' },
		{ name: 'jitter', type: 'number', value: 0.02, min: 0.0, max: 0.2, step: 0.001, description: 'Random per-slice jitter' },
		{ name: 'strobe', type: 'number', value: 0.0, min: 0.0, max: 8.0, step: 0.1, description: 'Strobe multiplier (uses BPM)' },
		{ name: 'colorTint', type: 'color', value: '#ffffff', description: 'Blend toward this tint' },
		{ name: 'tintStrength', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.01, description: 'Amount of tint to blend (0-1)' },
		{ name: 'removeGaps', type: 'boolean', value: true, description: 'Remove slice gaps (masking off)' }
	]
};

// Register
console.log('🔧 Registering VideoSliceKaleidoEffect...');
registerEffect('VideoSliceKaleidoEffect', VideoSliceKaleidoEffect);
console.log('✅ VideoSliceKaleidoEffect registered successfully');

export default VideoSliceKaleidoEffect;
