import React, { useRef, useEffect, useState } from 'react';
import { Select, Slider } from './ui';
import { useStore } from '../store/store';

interface ImageLayerProps {
	layer: any;
	width: number;
	height: number;
	onUpdate: (updates: any) => void;
}

export const ImageLayer: React.FC<ImageLayerProps> = ({ layer, width, height, onUpdate }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);

	useEffect(() => {
		if (layer.asset?.path) {
			loadImage(layer.asset.path);
		}
	}, [layer.asset?.path]);

	const loadImage = (src: string) => {
		setIsLoading(true);
		setError(null);

		const img = new Image();
		img.crossOrigin = 'anonymous';
		
		img.onload = () => {
			setImage(img);
			setIsLoading(false);
			// Auto-update layer with image dimensions
			onUpdate({
				metadata: {
					width: img.naturalWidth,
					height: img.naturalHeight,
					aspectRatio: img.naturalWidth / img.naturalHeight
				}
			});
		};

		img.onerror = () => {
			setError('Failed to load image');
			setIsLoading(false);
		};

		img.src = src;
	};

	const renderImage = () => {
		const canvas = canvasRef.current;
		if (!canvas || !image) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		// Calculate image position and size based on fit mode
		const { fitMode = 'cover', position = { x: 0.5, y: 0.5 } } = layer;
		
		let drawWidth = width;
		let drawHeight = height;
		let drawX = 0;
		let drawY = 0;

		const imageAspect = image.naturalWidth / image.naturalHeight;
		const canvasAspect = width / height;

		switch (fitMode) {
			case 'cover':
				if (imageAspect > canvasAspect) {
					drawHeight = width / imageAspect;
					drawY = (height - drawHeight) * position.y;
				} else {
					drawWidth = height * imageAspect;
					drawX = (width - drawWidth) * position.x;
				}
				break;
			case 'contain':
				if (imageAspect > canvasAspect) {
					drawWidth = height * imageAspect;
					drawX = (width - drawWidth) * position.x;
				} else {
					drawHeight = width / imageAspect;
					drawY = (height - drawHeight) * position.y;
				}
				break;
			case 'stretch':
				break;
			case 'tile':
				// Tile the image
				const tileWidth = image.naturalWidth;
				const tileHeight = image.naturalHeight;
				for (let y = 0; y < height; y += tileHeight) {
					for (let x = 0; x < width; x += tileWidth) {
						ctx.drawImage(image, x, y, tileWidth, tileHeight);
					}
				}
				return;
		}

		// Apply layer transformations
		ctx.save();
		ctx.translate(drawX + drawWidth / 2, drawY + drawHeight / 2);
		ctx.scale(layer.scale || 1, layer.scale || 1);
		ctx.rotate((layer.rotation || 0) * Math.PI / 180);
		ctx.translate(-drawWidth / 2, -drawHeight / 2);

		// Draw the image
		ctx.drawImage(image, 0, 0, drawWidth, drawHeight);
		ctx.restore();
	};

	useEffect(() => {
		renderImage();
	}, [image, layer, width, height]);

	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			setError('Please select an image file');
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result as string;
			onUpdate({
				asset: {
					path: result,
					name: file.name,
					type: 'image',
					size: file.size
				}
			});
		};
		reader.readAsDataURL(file);
	};

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
			if (file.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = (ev) => {
					const result = ev.target?.result as string;
					onUpdate({
						asset: {
							path: result,
							name: file.name,
							type: 'image',
							size: file.size
						}
					});
				};
				reader.readAsDataURL(file);
			} else {
				setError('Please drop an image file');
			}
		}
	};

	return (
		<div className="tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden">
			<div className="tw-flex tw-items-center tw-justify-between tw-px-4 tw-py-2 tw-border-b tw-border-neutral-800">
				<h3 className="tw-text-sm tw-text-white">Image Layer: {layer.name}</h3>
				<div className="tw-flex tw-items-center tw-gap-2">
					<input
						type="file"
						accept="image/*"
						onChange={handleFileSelect}
						className="tw-hidden"
						id={`image-input-${layer.id}`}
					/>
					<label htmlFor={`image-input-${layer.id}`} className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-1.5 hover:tw-bg-neutral-700 tw-cursor-pointer">
						Choose Image
					</label>
				</div>
			</div>

			<div className="tw-p-4">
				<div
					className={`tw-flex tw-items-center tw-justify-center tw-text-center tw-border-2 tw-border-dashed tw-rounded-md tw-p-6 ${isDragOver ? 'tw-ring-2 tw-ring-sky-600' : 'tw-border-neutral-700'} tw-text-neutral-300`}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
				>
					{isLoading ? (
						<div className="tw-flex tw-flex-col tw-items-center tw-gap-2">
							<div className="tw-animate-spin tw-h-8 tw-w-8 tw-rounded-full tw-border-2 tw-border-neutral-400 tw-border-t-transparent" />
							<p className="tw-text-sm">Loading image...</p>
						</div>
					) : error ? (
						<div className="tw-text-red-400 tw-text-sm">{error}</div>
					) : image ? (
						<canvas
							ref={canvasRef}
							width={width}
							height={height}
							className="tw-block"
						/>
					) : (
						<div className="tw-text-sm tw-text-neutral-400">
							Drop an image here or click to browse
						</div>
					)}
				</div>
			</div>

			{image && (
				<div className="tw-space-y-3 tw-border-t tw-border-neutral-800 tw-p-4">
					<div>
						<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Fit Mode:</label>
						<div className="tw-max-w-[160px]">
							<Select
								value={layer.fitMode || 'cover'}
								onChange={(val) => onUpdate({ fitMode: val })}
								options={[
									{ value: 'cover', label: 'Cover' },
									{ value: 'contain', label: 'Contain' },
									{ value: 'stretch', label: 'Stretch' },
									{ value: 'tile', label: 'Tile' },
								]}
							/>
						</div>
					</div>

					<div>
						<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Scale: {layer.scale || 1}</label>
						<Slider
							min={0.1}
							max={3}
							step={0.1}
							value={[layer.scale || 1]}
							onValueChange={(values) => values && values.length > 0 && onUpdate({ scale: values[0] })}
						/>
					</div>

					<div>
						<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Rotation: {layer.rotation || 0}°</label>
						<Slider
							min={0}
							max={360}
							step={1}
							value={[layer.rotation || 0]}
							onValueChange={(values) => values && values.length > 0 && onUpdate({ rotation: values[0] })}
						/>
					</div>

					<div>
						<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Opacity: {Math.round((layer.opacity || 1) * 100)}%</label>
						<Slider
							min={0}
							max={1}
							step={0.01}
							value={[layer.opacity || 1]}
							onValueChange={(values) => values && values.length > 0 && onUpdate({ opacity: values[0] })}
						/>
					</div>

					<div>
						<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Position X: {Math.round((layer.position?.x || 0.5) * 100)}%</label>
						<Slider
							min={0}
							max={1}
							step={0.01}
							value={[layer.position?.x || 0.5]}
							onValueChange={(values) => values && values.length > 0 && onUpdate({ position: { ...layer.position, x: values[0] } })}
						/>
					</div>

					<div>
						<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Position Y: {Math.round((layer.position?.y || 0.5) * 100)}%</label>
						<Slider
							min={0}
							max={1}
							step={0.01}
							value={[layer.position?.y || 0.5]}
							onValueChange={(values) => values && values.length > 0 && onUpdate({ position: { ...layer.position, y: values[0] } })}
						/>
					</div>
				</div>
			)}
		</div>
	);
}; 