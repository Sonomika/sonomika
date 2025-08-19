import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Slider, Select } from './ui';
import { ImageLayer } from './ImageLayer';
import { VideoLayer } from './VideoLayer';
import { useStore } from '../store/store';

interface LayerEditorProps {
	layer: any;
	onClose: () => void;
}

export const LayerEditor: React.FC<LayerEditorProps> = ({ layer, onClose }) => {
	const { updateLayer } = useStore() as any;
	const [activeTab, setActiveTab] = useState<'preview' | 'controls' | 'settings'>('preview');

	const handleLayerUpdate = (updates: any) => {
		updateLayer(layer.id, updates);
	};

	const renderLayerContent = () => {
		switch (layer.type) {
			case 'image':
				return (
					<ImageLayer
						layer={layer}
						width={400}
						height={300}
						onUpdate={handleLayerUpdate}
					/>
				);
			
			case 'video':
				return (
					<VideoLayer
						layer={layer}
						width={400}
						height={300}
						onUpdate={handleLayerUpdate}
					/>
				);
			
			case 'effect':
				return (
					<div className="tw-text-sm tw-text-neutral-300">
						<h3 className="tw-text-white tw-font-semibold tw-mb-1">Effect Layer: {layer.name}</h3>
						<p>Effect layers are rendered in the composition screen.</p>
					</div>
				);
			
			case 'shader':
				return (
					<div className="tw-text-sm tw-text-neutral-300">
						<h3 className="tw-text-white tw-font-semibold tw-mb-1">Shader Layer: {layer.name}</h3>
						<p>GLSL shader rendering will be implemented.</p>
					</div>
				);
			
			case 'p5js':
				return (
					<div className="tw-text-sm tw-text-neutral-300">
						<h3 className="tw-text-white tw-font-semibold tw-mb-1">p5.js Layer: {layer.name}</h3>
						<p>p5.js sketch rendering will be implemented.</p>
					</div>
				);
			
			case 'threejs':
				return (
					<div className="tw-text-sm tw-text-neutral-300">
						<h3 className="tw-text-white tw-font-semibold tw-mb-1">Three.js Layer: {layer.name}</h3>
						<p>Three.js 3D rendering will be implemented.</p>
					</div>
				);
			
			default:
				return (
					<div className="tw-text-sm tw-text-neutral-300">
						<h3 className="tw-text-white tw-font-semibold tw-mb-1">Unknown Layer Type: {layer.type}</h3>
						<p>This layer type is not yet supported.</p>
					</div>
				);
		}
	};

	const renderLayerControls = () => {
		return (
			<div className="tw-space-y-4">
				<div>
					<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Layer Name:</label>
					<input
						type="text"
						value={layer.name || 'Unnamed Layer'}
						onChange={(e) => handleLayerUpdate({ name: e.target.value })}
						className="tw-w-full tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
						style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
					/>
				</div>

				<div>
					<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Opacity: {Math.round((layer.opacity || 1) * 100)}%</label>
					<div className="tw-max-w-[260px]">
						<Slider
							min={0}
							max={1}
							step={0.01}
							value={[layer.opacity || 1]}
							onValueChange={(values) => values && values.length > 0 && handleLayerUpdate({ opacity: values[0] })}
						/>
					</div>
				</div>

				<div>
					<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Scale: {layer.scale || 1}</label>
					<div className="tw-max-w-[260px]">
						<Slider
							min={0.1}
							max={3}
							step={0.1}
							value={[layer.scale || 1]}
							onValueChange={(values) => values && values.length > 0 && handleLayerUpdate({ scale: values[0] })}
						/>
					</div>
				</div>

				<div>
					<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Rotation: {layer.rotation || 0}°</label>
					<div className="tw-max-w-[260px]">
						<Slider
							min={0}
							max={360}
							step={1}
							value={[layer.rotation || 0]}
							onValueChange={(values) => values && values.length > 0 && handleLayerUpdate({ rotation: Math.round(values[0]) })}
						/>
					</div>
				</div>

				<div>
					<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Blend Mode:</label>
					<div className="tw-max-w-[260px]">
						<Select
							value={(layer.blendMode || 'normal') as string}
							onChange={(v) => handleLayerUpdate({ blendMode: v as string })}
							options={[
								'normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion'
							].map(m => ({ value: m }))}
						/>
					</div>
				</div>

				<div className="tw-flex tw-items-center tw-gap-4">
					<label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-neutral-300">
						<input
							type="checkbox"
							checked={layer.enabled !== false}
							onChange={(e) => handleLayerUpdate({ enabled: e.target.checked })}
							className="tw-rounded tw-border tw-border-neutral-700"
						/>
						Enabled
					</label>
					<label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-neutral-300">
						<input
							type="checkbox"
							checked={layer.locked || false}
							onChange={(e) => handleLayerUpdate({ locked: e.target.checked })}
							className="tw-rounded tw-border tw-border-neutral-700"
						/>
						Locked
					</label>
				</div>
			</div>
		);
	};

	const renderLayerSettings = () => {
		return (
			<div className="tw-space-y-4">
				<div>
					<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Layer Type:</label>
					<div className="tw-max-w-[260px]">
						<Select
							value={layer.type as string}
							onChange={(v) => handleLayerUpdate({ type: v as string })}
							options={[ 'effect','image','video','shader','p5js','threejs' ].map(t => ({ value: t }))}
						/>
					</div>
				</div>

				<div>
					<label className="tw-block tw-text-sm tw-text-neutral-300 tw-mb-1">Layer ID:</label>
					<input
						type="text"
						value={layer.id}
						readOnly
						className="tw-w-full tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
					/>
				</div>

				{layer.metadata && (
					<div>
						<h4 className="tw-text-sm tw-font-semibold tw-text-white tw-mb-2">Metadata</h4>
						<div className="tw-grid tw-gap-2 tw-grid-cols-1 md:tw-grid-cols-2">
							{Object.entries(layer.metadata).map(([key, value]) => (
								<div key={key} className="tw-flex tw-items-center tw-justify-between tw-text-sm tw-bg-white/5 tw-px-2 tw-py-1">
									<span className="tw-text-neutral-300">{key}:</span>
									<span className="tw-text-white tw-font-medium">{String(value)}</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="tw-fixed tw-inset-0 tw-bg-black/60 tw-z-[10000]">
			<div className="tw-fixed tw-left-1/2 tw-top-1/2 tw-w-[860px] tw-max-w-[95vw] tw-max-h-[80vh] tw-overflow-hidden tw--translate-x-1/2 tw--translate-y-1/2 tw-rounded-lg tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-xl tw-ring-1 tw-ring-black/10">
				<div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-neutral-800 tw-px-4 tw-py-3">
					<h2 className="tw-text-base tw-font-semibold">Layer Editor: {layer.name}</h2>
					<button onClick={onClose} className="tw-border tw-border-neutral-700 tw-w-8 tw-h-8 hover:tw-bg-neutral-800">×</button>
				</div>

				<div className="tw-p-4">
					<Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'preview' | 'controls' | 'settings')}>
						<TabsList>
							<TabsTrigger value="preview">Preview</TabsTrigger>
							<TabsTrigger value="controls">Controls</TabsTrigger>
							<TabsTrigger value="settings">Settings</TabsTrigger>
						</TabsList>
						<TabsContent value="preview">
							<div className="tw-p-2">{renderLayerContent()}</div>
						</TabsContent>
						<TabsContent value="controls">
							<div className="tw-p-2">{renderLayerControls()}</div>
						</TabsContent>
						<TabsContent value="settings">
							<div className="tw-p-2">{renderLayerSettings()}</div>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}; 