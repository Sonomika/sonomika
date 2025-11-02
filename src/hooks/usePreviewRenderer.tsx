import React, { useState, useCallback } from 'react';
import { useStore } from '../store/store';
import { CanvasRenderer } from '../components/CanvasRenderer';

interface PreviewContent {
  type: 'column' | 'layer' | 'timeline';
  columnId?: string;
  layerId?: string;
  column?: any;
  layer?: any;
  asset?: any;
  layers?: any[];
  isEmpty?: boolean;
  activeClips?: any[];
  currentTime?: number;
  duration?: number;
}

export const usePreviewRenderer = () => {
  const { scenes, currentSceneId, playingColumnId, compositionSettings } = useStore() as any;
  const [previewContent, setPreviewContent] = useState<PreviewContent | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleTimelinePreviewUpdate = useCallback((previewContent: PreviewContent) => {
    setPreviewContent(previewContent);
    
    // Update isPlaying state based on previewContent.isPlaying
    if (previewContent && typeof (previewContent as any).isPlaying === 'boolean') {
      console.log('🎭 usePreviewRenderer updating isPlaying to:', (previewContent as any).isPlaying);
      setIsPlaying((previewContent as any).isPlaying);
    }
  }, []);

  const handleColumnPlay = useCallback((columnId: string) => {
    console.log('🎵 handleColumnPlay called with columnId:', columnId);
    const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
    const column = currentScene?.columns.find((col: any) => col.id === columnId);
    console.log('🎵 Found column:', column);
    
    if (column) {
      const layersWithContent = column.layers.filter((layer: any) => layer.asset);
      console.log('🎵 Column layers with content:', layersWithContent);
      console.log('🎵 Total layers in column:', column.layers.length);
      
      if (layersWithContent.length === 0) {
        console.log('❌ No layers with content in column:', columnId);
        // Show a helpful message in the preview
        setPreviewContent({
          type: 'column',
          columnId: columnId,
          column: column,
          layers: column.layers || [],
          isEmpty: true
        });
        setIsPlaying(false); // Don't start playing if no content
        return;
      }
      
      // Update preview content immediately without causing flash
      const newPreviewContent: PreviewContent = {
        type: 'column',
        columnId: columnId,
        column: column,
        layers: column.layers || []
      };
      
      console.log('🎵 Setting preview content for column:', columnId);
      console.log('🎵 Preview content will be:', newPreviewContent);
      
      // Batch state updates to prevent flash
      setPreviewContent(newPreviewContent);
      setIsPlaying(true);
      console.log('✅ Playing column:', columnId, column);
    } else {
      console.error('❌ Column not found:', columnId);
    }
  }, [scenes, currentSceneId]);

  const handleLayerPlay = useCallback((layerId: string) => {
    const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
    const layer = currentScene?.columns
      .flatMap((col: any) => col.layers)
      .find((layer: any) => layer.id === layerId);
    
    if (layer && layer.asset) {
      console.log('Playing layer:', layerId, layer.asset);
      setPreviewContent({
        type: 'layer',
        layerId: layerId,
        layer: layer,
        asset: layer.asset
      });
      setIsPlaying(true);
    }
  }, [scenes, currentSceneId]);

  const handleStop = useCallback(() => {
    console.log('🛑 handleStop called');
    setIsPlaying(false);
    setPreviewContent(null);
  }, []);

  const renderPreviewContent = useCallback(() => {
    console.log('🎨 renderPreviewContent called');
    console.log('🎨 previewContent:', previewContent);
    console.log('🎨 isPlaying:', isPlaying);
    
    if (!previewContent) {
      console.log('🎨 No preview content, showing placeholder');
      return (
        <div className="tw-w-full tw-h-full tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-text-sm tw-py-4">
          <div className="tw-text-center">
            <div>No preview available</div>
            <div className="tw-text-xs tw-text-neutral-500">Select a layer to see preview</div>
          </div>
        </div>
      );
    }

    if (previewContent.type === 'column') {
      console.log('🎨 Rendering column preview');
      // Show the first layer with content as the main preview
      const layersWithContent = previewContent.layers?.filter((layer: any) => layer.asset) || [];
      console.log('🎨 Layers with content:', layersWithContent);
      
      // Check if this is an empty column
      if (previewContent.isEmpty || layersWithContent.length === 0) {
        console.log('🎨 No layers with content, showing empty column message');
        return (
          <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden">
            <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
              <h4 className="tw-text-sm tw-text-white">Column Preview</h4>
              <span className="tw-text-xs tw-text-neutral-400">Empty</span>
            </div>
            <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-1 tw-p-4">
              <p className="tw-text-neutral-300">No media content</p>
              <small className="tw-text-neutral-500">Drag assets from the Media Library to layers to see preview</small>
              <div className="tw-mt-2 tw-text-neutral-400 tw-text-xs tw-space-y-1">
                <p className="tw-font-semibold">How to add content:</p>
                <ol className="tw-list-decimal tw-list-inside tw-space-y-0.5">
                  <li>Open the Media Library (bottom right)</li>
                  <li>Import or drag media files</li>
                  <li>Drag assets from Media Library to layer cells</li>
                  <li>Click the play button to preview</li>
                </ol>
              </div>
            </div>
          </div>
        );
      }

      // Use the new ColumnPreview component for combined layer rendering
      console.log('🎨 Rendering combined column preview with p5.js');
      console.log('🎨 Column data:', previewContent.column);
      console.log('🎨 Composition settings:', compositionSettings);
      
      // Calculate aspect ratio dynamically
      const aspectRatio = compositionSettings.width / compositionSettings.height;
      
      const previewElement = (
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden">
          <div 
            className="tw-relative tw-w-full"
            data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
            style={{ aspectRatio: aspectRatio }}
          >
            <div className="tw-flex tw-items-center tw-justify-center tw-w-full tw-h-full tw-bg-black/80">
              <div className="tw-text-center tw-text-neutral-300 tw-text-sm">
                <div>Column Preview Component</div>
                <div className="tw-text-xs tw-text-neutral-500">This would render the actual ColumnPreview component</div>
              </div>
            </div>
          </div>
          <div className="tw-px-3 tw-py-2">
            <h5 className="tw-text-sm tw-font-semibold tw-text-white">Layers in Column:</h5>
            {layersWithContent.map((layer: any, index: number) => (
              <div key={layer.id} className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-neutral-300 tw-border-b tw-border-neutral-800 tw-py-1">
                <div className="tw-font-medium">{layer.name}</div>
                <div className="tw-text-neutral-400">{layer.asset.type}</div>
              </div>
            ))}
          </div>
        </div>
      );
      
      console.log('🎨 Returning column preview element:', previewElement);
      return previewElement;
    }

    if (previewContent.type === 'layer') {
      return (
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden">
          <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
            <h4 className="tw-text-sm tw-text-white">Layer Preview</h4>
            <span className="tw-text-xs tw-text-neutral-400">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="tw-p-2">
            <div className="tw-text-sm tw-text-neutral-200 tw-mb-2">{previewContent.layer.name}</div>
            {previewContent.asset && (
              <div className="tw-rounded tw-border tw-border-neutral-800 tw-bg-black tw-p-4">
                <div className="tw-text-center tw-text-neutral-300 tw-text-sm">Canvas Renderer Component</div>
                <div className="tw-text-center tw-text-neutral-500 tw-text-xs">This would render the actual CanvasRenderer component</div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (previewContent.type === 'timeline') {
      const activeClips = previewContent.activeClips || [];
      // Map timeline clips to the same asset/layer model used by column rendering
      const assets = activeClips.map((clip: any) => {
        const type = clip?.asset?.type === 'image' ? 'image' : (clip?.asset?.type === 'video' ? 'video' : 'effect');
        const opacity = (() => {
          try {
            const p = clip?.params?.opacity;
            if (p && typeof p.value === 'number') return Math.max(0, Math.min(1, p.value));
          } catch {}
          return typeof clip?.opacity === 'number' ? Math.max(0, Math.min(1, clip.opacity)) : 1;
        })();
        const blendMode = (clip && (clip as any).blendMode) || 'add';
        return {
          type,
          asset: clip.asset,
          layer: { opacity, blendMode, params: clip.params || {} }
        } as any;
      });

      return (
        <div className="tw-h-full tw-flex tw-flex-col">
          <div className="tw-flex tw-items-center tw-gap-3 tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
            <h4 className="tw-text-sm tw-text-white">Timeline Preview</h4>
            <span className="tw-text-xs tw-text-neutral-400">{isPlaying ? 'Playing' : 'Stopped'}</span>
            <div className="tw-text-xs tw-text-neutral-400">
              Time: {Math.floor(previewContent.currentTime || 0)}s / {Math.floor(previewContent.duration || 0)}s
            </div>
          </div>
          <div className="tw-flex tw-flex-col tw-gap-2 tw-flex-1 tw-p-2 tw-rounded-md tw-bg-neutral-900 tw-border tw-border-neutral-800">
            {assets.length === 0 ? (
              <div className="tw-flex tw-items-center tw-justify-center tw-h-48 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded">
                <div className="tw-text-center tw-text-neutral-300">
                  <div className="tw-text-sm">No clips playing at current time</div>
                  <div className="tw-mt-1 tw-text-xs tw-text-neutral-400">{Math.floor(previewContent.currentTime || 0)}s</div>
                </div>
              </div>
            ) : (
              <div className="tw-flex tw-flex-col tw-gap-2">
                <div 
                  className="tw-relative tw-rounded tw-border tw-border-neutral-800 tw-bg-black"
                  data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
                  style={{ aspectRatio: compositionSettings.width / compositionSettings.height }}
                >
                  <CanvasRenderer 
                    assets={assets}
                    width={compositionSettings.width}
                    height={compositionSettings.height}
                    bpm={useStore.getState().bpm}
                    isPlaying={isPlaying}
                  />
                </div>
                <div className="tw-mt-2">
                  <h5 className="tw-text-sm tw-font-semibold tw-text-white">Active Timeline Clips:</h5>
                  {activeClips.map((clip: any, index: number) => (
                    <div key={`info-${clip.id}-${index}`} className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-neutral-300 tw-border-b tw-border-neutral-800 tw-py-1">
                      <div className="tw-font-medium">Track {String(clip?.trackId || '').split('-')[1] || '-'}</div>
                      <div className="tw-text-neutral-400">{clip.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="tw-w-full tw-h-full tw-bg-black" />
    );
  }, [previewContent, isPlaying, compositionSettings]);

  return {
    previewContent,
    isPlaying,
    handleTimelinePreviewUpdate,
    handleColumnPlay,
    handleLayerPlay,
    handleStop,
    renderPreviewContent
  };
}; 