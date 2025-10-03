import React, { useState } from 'react';
import { useStore } from '../store/store';
import { LayerEditor } from './LayerEditor';
import { EyeOpenIcon, EyeClosedIcon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';

interface LayerListProps {
	onClose: () => void;
}

export const LayerList: React.FC<LayerListProps> = ({ onClose }) => {
	const { scenes, currentSceneId, updateScene } = useStore() as any;
	const [selectedLayer, setSelectedLayer] = useState<any>(null);
	const [showLayerEditor, setShowLayerEditor] = useState(false);

	const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);

	const handleEditLayer = (layer: any) => {
		setSelectedLayer(layer);
		setShowLayerEditor(true);
	};

	const handleDeleteLayer = (layerId: string) => {
		if (!currentScene) return;

		const updatedColumns = currentScene.columns.map((column: any) => ({
			...column,
			layers: column.layers.filter((layer: any) => layer.id !== layerId)
		}));

		updateScene(currentSceneId, { columns: updatedColumns });
	};

	const handleToggleLayer = (layerId: string) => {
		if (!currentScene) return;

		const updatedColumns = currentScene.columns.map((column: any) => ({
			...column,
			layers: column.layers.map((layer: any) => 
				layer.id === layerId 
					? { ...layer, enabled: !layer.enabled }
					: layer
			)
		}));

		updateScene(currentSceneId, { columns: updatedColumns });
	};

	const handleLayerUpdate = (layerId: string, updates: any) => {
		if (!currentScene) return;

		const updatedColumns = currentScene.columns.map((column: any) => ({
			...column,
			layers: column.layers.map((layer: any) => 
				layer.id === layerId 
					? { ...layer, ...updates }
					: layer
			)
		}));

		updateScene(currentSceneId, { columns: updatedColumns });
	};

	const getLayerTypeName = (type: string) => {
		switch (type) {
			case 'image':
				return 'Image';
			case 'video':
				return 'Video';
			case 'effect':
				return 'Effect';
			case 'shader':
				return 'Shader';
			case 'p5js':
				return 'p5.js';
			case 'threejs':
				return 'Three.js';
			default:
				return type;
		}
	};

	if (!currentScene) {
		return (
			<div className="tw-fixed tw-inset-0 tw-bg-black/60 tw-z-[10000]">
				<div className="tw-fixed tw-left-1/2 tw-top-1/2 tw-w-[680px] tw-max-w-[95vw] tw--translate-x-1/2 tw--translate-y-1/2 tw-rounded-lg tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-xl tw-ring-1 tw-ring-black/10">
					<div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-neutral-800 tw-px-4 tw-py-3">
						<h2 className="tw-text-base tw-font-semibold">Layer List</h2>
						<button onClick={onClose} className="tw-border tw-border-neutral-700 tw-w-8 tw-h-8 hover:tw-bg-neutral-800">×</button>
					</div>
					<div className="tw-p-4">
						<p>No scene selected.</p>
					</div>
				</div>
			</div>
		);
	}

	const allLayers: any[] = [];
	currentScene.columns.forEach((column: any, columnIndex: number) => {
		column.layers.forEach((layer: any) => {
			allLayers.push({
				...layer,
				columnIndex,
				columnName: column.name || `Column ${columnIndex + 1}`
			});
		});
	});

	return (
		<>
			<div className="tw-fixed tw-inset-0 tw-bg-black/60 tw-z-[10000]">
				<div className="tw-fixed tw-left-1/2 tw-top-1/2 tw-w-[720px] tw-max-w-[95vw] tw-max-h-[80vh] tw-overflow-hidden tw--translate-x-1/2 tw--translate-y-1/2 tw-rounded-lg tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-xl tw-ring-1 tw-ring-black/10">
					<div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-neutral-800 tw-px-4 tw-py-3">
						<h2 className="tw-text-base tw-font-semibold">Layer List - {currentScene.name}</h2>
						<button onClick={onClose} className="tw-border tw-border-neutral-700 tw-w-8 tw-h-8 hover:tw-bg-neutral-800">×</button>
					</div>

					<div className="tw-p-4 tw-overflow-auto tw-max-h-[calc(80vh-120px)]">
						{allLayers.length === 0 ? (
							<div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-text-center tw-text-neutral-400 tw-p-6 tw-border tw-border-dashed tw-border-neutral-700 tw-rounded">
								<h3 className="tw-text-lg tw-text-white">No Layers</h3>
								<p className="tw-text-sm tw-text-neutral-400">Add layers using the sidebar buttons.</p>
							</div>
						) : (
							<div className="tw-space-y-2">
								{allLayers.map((layer) => (
									<div
										key={layer.id}
										className={`tw-flex tw-items-start tw-justify-between tw-gap-3 tw-rounded tw-border tw-p-3 ${!layer.enabled ? 'tw-bg-neutral-800 tw-border-neutral-700 tw-opacity-90' : 'tw-bg-neutral-900 tw-border-neutral-800'}`}
									>
										<div className="tw-flex-1 tw-min-w-0">
											<div className="tw-flex tw-flex-col tw-gap-0.5">
												<div className="tw-text-sm tw-text-white tw-font-medium tw-truncate">{layer.name || 'Unnamed Layer'}</div>
												<div className="tw-text-xs tw-text-neutral-400 tw-truncate">
													{getLayerTypeName(layer.type)} • Column {layer.columnIndex + 1}
													{layer.asset?.name && ` • ${layer.asset.name || layer.asset.metadata?.name || layer.asset.effect?.name || 'Unknown Effect'}`}
												</div>
											</div>
											<div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-3 tw-text-xs tw-text-neutral-300">
												<div className="tw-flex tw-items-center tw-gap-1"><span className="tw-text-neutral-400">Opacity:</span><span>{Math.round((layer.opacity || 1) * 100)}%</span></div>
												<div className="tw-flex tw-items-center tw-gap-1"><span className="tw-text-neutral-400">Scale:</span><span>{layer.scale || 1}</span></div>
												<div className="tw-flex tw-items-center tw-gap-1"><span className="tw-text-neutral-400">Rotation:</span><span>{layer.rotation || 0}°</span></div>
											</div>
										</div>

										<div className="tw-flex tw-items-center tw-gap-2 tw-shrink-0">
											<button
												className="tw-inline-flex tw-items-center tw-justify-center tw-border tw-border-neutral-700 tw-w-7 tw-h-7 hover:tw-bg-neutral-800"
												onClick={() => handleToggleLayer(layer.id)}
												title={layer.enabled ? 'Disable Layer' : 'Enable Layer'}
											>
												{layer.enabled ? (
													<EyeOpenIcon className="tw-w-3.5 tw-h-3.5" />
												) : (
													<EyeClosedIcon className="tw-w-3.5 tw-h-3.5" />
												)}
											</button>

											<button
												className="tw-inline-flex tw-items-center tw-justify-center tw-border tw-border-neutral-700 tw-w-7 tw-h-7 hover:tw-bg-neutral-800"
												onClick={() => handleEditLayer(layer)}
												title="Edit Layer"
											>
												<Pencil1Icon className="tw-w-3.5 tw-h-3.5" />
											</button>

											<button
												className="tw-inline-flex tw-items-center tw-justify-center tw-border tw-border-neutral-700 tw-w-7 tw-h-7 hover:tw-bg-neutral-800"
												onClick={() => handleDeleteLayer(layer.id)}
												title="Delete Layer"
											>
												<TrashIcon className="tw-w-3.5 tw-h-3.5" />
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="tw-border-t tw-border-neutral-800 tw-px-4 tw-py-2 tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-neutral-400">
						<div className="tw-flex tw-gap-4">
							<span>Total Layers: {allLayers.length}</span>
							<span>Enabled: {allLayers.filter(l => l.enabled).length}</span>
						</div>
					</div>
				</div>
			</div>

			{showLayerEditor && selectedLayer && (
				<LayerEditor
					layer={selectedLayer}
					onClose={() => {
						setShowLayerEditor(false);
						setSelectedLayer(null);
					}}
				/>
			)}
		</>
	);
}; 