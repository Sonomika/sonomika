import React, { useEffect, useRef, useState } from 'react';

interface EffectRendererProps {
	effectType: 'p5js' | 'threejs';
	effectName: string;
	effectFile: string;
	width: number;
	height: number;
	bpm?: number;
	isPlaying?: boolean;
}

export const EffectRenderer: React.FC<EffectRendererProps> = React.memo(({
	effectType,
	effectName,
	effectFile,
	width,
	height,
	bpm = 120,
	isPlaying = false
}) => {
	// Ensure we have valid dimensions
	const canvasWidth = width > 0 ? width : 1920;
	const canvasHeight = height > 0 ? height : 1080;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animationRef = useRef<number>();
	const effectRef = useRef<any>(null);
	const [isLoaded, setIsLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const loadEffect = async () => {
			try {
				// Wait for canvas
				let attempts = 0;
				while (!canvasRef.current && attempts < 50) {
					await new Promise(resolve => setTimeout(resolve, 10));
					attempts++;
				}
				const canvas = canvasRef.current;
				if (!canvas) {
					setError('Canvas not found');
					return;
				}

				// Dynamic discovery
				let effectModule;
				try {
					const modules = (import.meta as any).glob('../effects/*.tsx');
					const effectPath = `../effects/${effectFile}`;
					if (modules[effectPath]) {
						effectModule = await modules[effectPath]();
					} else {
						setError(`Effect not found: ${effectName}`);
						return;
					}
				} catch (importError) {
					setError(`Failed to load effect: ${effectName}`);
					return;
				}

				const EffectClass = effectModule.default || effectModule[effectName.replace(/\s+/g, '')];
				if (!EffectClass) {
					setError(`Effect class not found: ${effectName}`);
					return;
				}

				const ctx = canvas.getContext('2d');
				if (!ctx) {
					setError('Failed to get 2D context');
					return;
				}

				const effect = new EffectClass(canvasWidth, canvasHeight);
				effect.setBPM(bpm);
				effectRef.current = effect;
				setIsLoaded(true);
				setError(null);
			} catch (error) {
				setError(`Error loading effect: ${error}`);
			}
		};

		loadEffect();
		return () => {
			if (effectRef.current) {
				effectRef.current.cleanup?.();
			}
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [effectName, effectFile, effectType, width, height, bpm]);

	useEffect(() => {
		if (!isLoaded || !isPlaying || !effectRef.current) return;
		let lastTime = performance.now();
		const animate = (currentTime: number) => {
			if (!effectRef.current) return;
			const deltaTime = (currentTime - lastTime) / 1000;
			lastTime = currentTime;
			try {
				effectRef.current.render(deltaTime);
				const canvas = canvasRef.current;
				const ctx = canvas?.getContext('2d');
				if (canvas && ctx && effectRef.current.canvas) {
					ctx.clearRect(0, 0, canvasWidth, canvasHeight);
					ctx.drawImage(effectRef.current.canvas, 0, 0, canvasWidth, canvasHeight);
				}
			} catch (error) {
				setError(`Rendering error: ${error}`);
				return;
			}
			animationRef.current = requestAnimationFrame(animate);
		};
		animationRef.current = requestAnimationFrame(animate);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [isLoaded, isPlaying, width, height]);

	useEffect(() => {
		if (effectRef.current) effectRef.current.setBPM(bpm);
	}, [bpm]);

	useEffect(() => {
		if (effectRef.current) effectRef.current.resize(canvasWidth, canvasHeight);
	}, [canvasWidth, canvasHeight]);

	if (error) {
		return (
			<div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-2 tw-text-center tw-text-red-400 tw-p-4">
				<div className="tw-text-sm">{error}</div>
			</div>
		);
	}

	if (!isLoaded) {
		return (
			<div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-2 tw-text-center tw-text-neutral-300 tw-p-4">
				<div className="tw-animate-spin tw-h-8 tw-w-8 tw-rounded-full tw-border-2 tw-border-neutral-400 tw-border-t-transparent" />
				<div className="tw-text-sm">Loading {effectName}...</div>
			</div>
		);
	}

	return (
		<canvas
			ref={canvasRef}
			width={canvasWidth}
			height={canvasHeight}
			className="tw-w-full tw-h-full tw-block tw-bg-transparent"
		/>
	);
}); 