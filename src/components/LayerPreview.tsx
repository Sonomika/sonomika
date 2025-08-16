import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { RenderLoop } from '../utils/RenderLoop';
// EffectLoader import removed - using dynamic loading instead
import { AppState, LayerParamValue } from '../store/types';

interface Props {
	dimensions: {
		width: number;
		height: number;
	};
}

export const LayerPreview: React.FC<Props> = ({ dimensions }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { scenes, currentSceneId, selectedLayerId, previewMode } = useStore() as AppState;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// Calculate preview dimensions (maintaining 16:9 aspect ratio)
		const previewHeight = 200;
		const previewWidth = (previewHeight * 16) / 9;

		canvas.width = previewWidth;
		canvas.height = previewHeight;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const currentScene = scenes.find(s => s.id === currentSceneId);
		if (!currentScene) return;

		let selectedLayer = null as any;
		for (const column of currentScene.columns) {
			const layer = column.layers.find(l => l.id === selectedLayerId);
			if (layer) {
				selectedLayer = layer;
				break;
			}
		}

		const renderCallback = (deltaTime: number) => {
			ctx.clearRect(0, 0, previewWidth, previewHeight);

			if (selectedLayer) {
				// Using dynamic discovery instead of EffectLoader
				// TODO: hook into dynamic effect creation if needed

				// Draw overlay with layer info
				ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
				ctx.fillRect(0, 0, previewWidth, 30);
				ctx.fillStyle = 'white';
				ctx.font = '12px sans-serif';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(
					`${selectedLayer.name} (${selectedLayer.type}) - Opacity: ${Math.round(selectedLayer.opacity * 100)}% - Blend: ${selectedLayer.blendMode}`,
					10,
					15
				);
			} else {
				// Draw "No layer selected" message
				ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
				ctx.fillRect(0, 0, previewWidth, previewHeight);
				ctx.fillStyle = 'white';
				ctx.font = '14px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('No layer selected', previewWidth / 2, previewHeight / 2);
			}
		};

		RenderLoop.getInstance().addCallback(renderCallback);

		return () => {
			RenderLoop.getInstance().removeCallback(renderCallback);
		};
	}, [dimensions, scenes, currentSceneId, selectedLayerId, previewMode]);

	return (
		<div className="tw-w-full tw-flex tw-items-center tw-justify-center">
			<canvas ref={canvasRef} className="tw-block" />
		</div>
	);
}; 