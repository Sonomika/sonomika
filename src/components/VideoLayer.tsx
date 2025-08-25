import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { LOOP_MODES } from '../constants/video';
import type { VideoLayer as VideoLayerType } from '../types/layer';
import { getTemporaryLink } from '../lib/dropbox';

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
	const [, setIsPlaying] = useState(false);
	// Local video state
	const [, setCurrentTime] = useState(0);
	const [, setDuration] = useState(0);
	const [isDragOver, setIsDragOver] = useState(false);

	const { bpm } = useStore() as any;

	const refreshInFlight = useRef(false);
	const triedErrorRefresh = useRef(false);

	const maybeRefreshDropboxLink = async (force: boolean = false): Promise<string | null> => {
		try {
			const asset: any = (layer as any).asset;
			if (!asset || !asset.dropboxPath) return null;
			const expiresAt = asset.dropboxExpiresAt as number | undefined;
			const now = Date.now();
			const shouldRefresh = force || (typeof expiresAt === 'number' && expiresAt - now < 5 * 60 * 1000);
			if (!shouldRefresh || refreshInFlight.current) return null;
			refreshInFlight.current = true;
			const { link, expiresAt: newExpires } = await getTemporaryLink(asset.dropboxPath);
			const updatedAsset = { ...asset, path: link, dropboxExpiresAt: newExpires };
			onUpdate({ asset: updatedAsset } as any);
			refreshInFlight.current = false;
			return link;
		} catch (e) {
			refreshInFlight.current = false;
			return null;
		}
	};

	useEffect(() => {
		const run = async () => {
			const asset: any = (layer as any).asset;
			if (!asset?.path) return;
			// Proactively refresh if Dropbox link is near expiry
			const refreshed = await maybeRefreshDropboxLink(false);
			loadVideo(refreshed || asset.path);
		};
		run();
	}, [layer.asset?.path, (layer as any).asset?.dropboxExpiresAt]);

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
					console.warn('REVERSE MODE: Native reverse playback not supported, falling back to loop');
					video.currentTime = 0;
					video.play();
					break;
				case LOOP_MODES.PING_PONG:
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
			const beatsPerSecond = bpm / 60;
			const currentBeat = Math.floor(currentTime * beatsPerSecond);
			const nextBeatTime = (currentBeat + 1) / beatsPerSecond;
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
				video.currentTime = 0;
				video.play().catch(console.error);
			}
		};

		const handleVideoContinue = (e: CustomEvent) => {
			if (e.detail?.layerId === layer.id) {
				if (video.paused) {
					video.play().catch(console.error);
				}
			}
		};

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

		video.onerror = async () => {
			if (!triedErrorRefresh.current) {
				triedErrorRefresh.current = true;
				const newLink = await maybeRefreshDropboxLink(true);
				if (newLink) {
					video.src = newLink;
					video.load();
					setError(null);
					setIsLoading(false);
					return;
				}
			}
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
				// Fill the entire canvas while preserving aspect ratio (may crop)
				if (videoAspect > canvasAspect) {
					// Video is wider than canvas: match height, overflow width
					drawHeight = height;
					drawWidth = height * videoAspect;
					drawX = (width - drawWidth) * position.x;
					drawY = 0;
				} else {
					// Video is taller than canvas: match width, overflow height
					drawWidth = width;
					drawHeight = width / videoAspect;
					drawX = 0;
					drawY = (height - drawHeight) * position.y;
				}
				break;
			case 'tile':
				// Fill the canvas with repeated tiles preserving aspect of one tile
				// We'll draw repeated tiles manually since 2D canvas has no background-repeat for drawImage
				{
					const tileW = height * videoAspect; // tile height matches canvas height
					const tileH = height;
					for (let x = 0; x < width + tileW; x += tileW) {
						for (let y = 0; y < height + tileH; y += tileH) {
							ctx.drawImage(video, x, y, tileW, tileH);
						}
					}
					return; // already drawn
				}
			case 'contain':
				// Fit entire video inside canvas while preserving aspect (may letterbox/pillarbox)
				if (videoAspect > canvasAspect) {
					// Video is wider: match width
					drawWidth = width;
					drawHeight = width / videoAspect;
					drawX = 0;
					drawY = (height - drawHeight) * position.y;
				} else {
					// Video is taller: match height
					drawHeight = height;
					drawWidth = height * videoAspect;
					drawX = (width - drawWidth) * position.x;
					drawY = 0;
				}
				break;
			case 'stretch':
				// Fill canvas ignoring aspect
				drawWidth = width;
				drawHeight = height;
				drawX = 0;
				drawY = 0;
				break;
			case 'none':
				// Original: draw at native pixel size; crop if exceeds canvas; black bars if smaller
				drawWidth = video.videoWidth || width;
				drawHeight = video.videoHeight || height;
				drawX = (width - drawWidth) * position.x;
				drawY = (height - drawHeight) * position.y;
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

	// File input selection not used in current UI; drag-and-drop handles import

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	};

	const handleDragLeave = () => {
		setIsDragOver(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			const file = files[0];
			if (file.type.startsWith('video/')) {
				const reader = new FileReader();
				reader.onload = (ev) => {
					const result = ev.target?.result as string;
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

	// External controls drive play/pause via events; no inline toggle

	// No seek slider in this component

	// Time formatting helper unused here

	return (
		<div
			className={`tw-relative tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden ${isDragOver ? 'tw-ring-2 tw-ring-sky-600' : ''}`}
			style={{ width, height }}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<video
				ref={videoRef}
				className="tw-w-full tw-h-full tw-object-cover tw-block"
				data-layer-id={layer.id}
				muted
				playsInline
			/>

			{isLoading && (
				<div className="tw-absolute tw-inset-0 tw-bg-black/50 tw-flex tw-items-center tw-justify-center">
					<div className="tw-animate-spin tw-h-8 tw-w-8 tw-rounded-full tw-border-2 tw-border-neutral-400 tw-border-t-transparent" />
				</div>
			)}
			{error && (
				<div className="tw-absolute tw-inset-0 tw-bg-black/70 tw-flex tw-items-center tw-justify-center">
					<p className="tw-text-red-400 tw-text-sm">Error: {error}</p>
				</div>
			)}
		</div>
	);
}; 