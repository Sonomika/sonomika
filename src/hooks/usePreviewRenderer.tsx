import React, { useState, useCallback } from 'react';
import { useStore } from '../store/store';

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
      const newPreviewContent = {
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
        <div className="preview-placeholder">
          <p>No preview available</p>
          <small>Select a layer to see preview</small>
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
          <div className="preview-column">
            <div className="preview-header-info">
              <h4>Column Preview</h4>
              <span className="preview-status">Empty</span>
            </div>
            <div className="preview-placeholder">
              <div className="preview-icon">📁</div>
              <p>No media content</p>
              <small>Drag assets from the Media Library to layers to see preview</small>
              <div className="preview-help">
                <p><strong>How to add content:</strong></p>
                <ol>
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
        <div className="preview-column">
          <div 
            className="preview-main-content"
            data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
            style={{ aspectRatio: aspectRatio }}
          >
            {/* ColumnPreview component would be imported and used here */}
            <div className="column-preview-placeholder">
              <p>Column Preview Component</p>
              <small>This would render the actual ColumnPreview component</small>
            </div>
          </div>
          <div className="preview-layers-info">
            <h5>Layers in Column:</h5>
            {layersWithContent.map((layer: any, index: number) => (
              <div key={layer.id} className="preview-layer-item">
                <div className="preview-layer-name">{layer.name}</div>
                <div className="preview-layer-asset-type">{layer.asset.type}</div>
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
        <div className="preview-layer">
          <div className="preview-header-info">
            <h4>Layer Preview</h4>
            <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="preview-layer-content">
            <div className="preview-layer-info">
              <div className="preview-layer-name">{previewContent.layer.name}</div>
            </div>
            {previewContent.asset && (
              <div className="preview-asset-display">
                {/* CanvasRenderer component would be imported and used here */}
                <div className="canvas-renderer-placeholder">
                  <p>Canvas Renderer Component</p>
                  <small>This would render the actual CanvasRenderer component</small>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (previewContent.type === 'timeline') {
      const activeClips = previewContent.activeClips || [];
      
      return (
        <div className="preview-timeline">
          <div className="preview-header-info">
            <h4>Timeline Preview</h4>
            <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
            <div className="preview-time-display">
              Time: {Math.floor(previewContent.currentTime || 0)}s / {Math.floor(previewContent.duration || 0)}s
            </div>
          </div>
          
          <div className="preview-timeline-content">
            {activeClips.length === 0 ? (
              <div className="timeline-preview-empty">
                <div className="timeline-preview-placeholder">
                  <div className="placeholder-text">No clips playing at current time</div>
                  <div className="placeholder-time">{Math.floor(previewContent.currentTime || 0)}s</div>
                </div>
              </div>
            ) : (
              <div className="preview-column">
                <div 
                  className="preview-main-content"
                  data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
                  style={{ aspectRatio: compositionSettings.width / compositionSettings.height }}
                >
                  {/* TimelineComposer component would be imported and used here */}
                  <div className="timeline-composer-placeholder">
                    <p>Timeline Composer Component</p>
                    <small>This would render the actual TimelineComposer component</small>
                  </div>
                </div>
                
                <div className="preview-layers-info">
                  <h5>Active Timeline Clips:</h5>
                  {activeClips.map((clip: any, index: number) => (
                    <div key={`info-${clip.id}-${index}`} className="preview-layer-item">
                      <div className="preview-layer-name">Track {clip.trackId.split('-')[1]}</div>
                      <div className="preview-layer-asset-type">{clip.name}</div>
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
      <div className="preview-placeholder">
        <p>Preview not available</p>
      </div>
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