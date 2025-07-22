import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { RenderLoop } from '../utils/RenderLoop';
import { EffectLoader } from '../utils/EffectLoader';
import { SceneTransition } from '../utils/SceneTransition';
import { AppState, LayerParamValue } from '../store/types';

interface Props {
  dimensions: {
    width: number;
    height: number;
  };
}

// Map layer types to effect names
const layerTypeToEffectMap: Record<string, string> = {
  'p5': 'TestEffect',
  'shader': 'Waveform',
  'image': 'CirclePulse',
  'video': 'ColorPulse',
  'three': 'GeometricPattern',
};

export const CompositionScreen: React.FC<Props> = ({ dimensions }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { scenes, currentSceneId } = useStore() as AppState;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentScene = scenes.find(s => s.id === currentSceneId);
    if (!currentScene) return;

    const renderCallback = (deltaTime: number) => {
      try {
        if (SceneTransition.getInstance().isActive()) {
          const transitionCanvas = SceneTransition.getInstance().getCanvas();
          ctx.drawImage(transitionCanvas, 0, 0);
        } else {
          ctx.clearRect(0, 0, dimensions.width, dimensions.height);

          // Render each column
          currentScene.columns.forEach(column => {
            // Create a temporary canvas for the column
            const columnCanvas = document.createElement('canvas');
            columnCanvas.width = dimensions.width;
            columnCanvas.height = dimensions.height;
            const columnCtx = columnCanvas.getContext('2d');
            if (!columnCtx) return;

            // Render each layer in the column
            column.layers.forEach(layer => {
              if (layer.mute || (column.layers.some(l => l.solo) && !layer.solo)) {
                return;
              }

              // Map layer type to effect name
              const effectName = layerTypeToEffectMap[layer.type] || 'TestEffect';
              
              try {
                const effect = EffectLoader.getInstance().createEffect(effectName, dimensions.width, dimensions.height);

                // Set effect parameters
                Object.entries(layer.params).forEach(([name, param]) => {
                  effect.setParameter(name, (param as LayerParamValue).value);
                });

                // Render the effect
                effect.render(deltaTime);

                // Apply layer opacity and blend mode
                columnCtx.globalAlpha = layer.opacity;
                columnCtx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
                columnCtx.drawImage(effect.canvas, 0, 0);
                columnCtx.globalCompositeOperation = 'source-over';
                columnCtx.globalAlpha = 1;
              } catch (error) {
                console.error(`Error rendering layer ${layer.id}:`, error);
                // Draw a fallback rectangle
                columnCtx.fillStyle = '#ff0000';
                columnCtx.fillRect(0, 0, dimensions.width, dimensions.height);
              }
            });

            // Draw the column to the main canvas
            ctx.drawImage(columnCanvas, 0, 0);
          });
        }
      } catch (error) {
        console.error('Error in render callback:', error);
      }
    };

    RenderLoop.getInstance().addCallback(renderCallback);

    return () => {
      RenderLoop.getInstance().removeCallback(renderCallback);
    };
  }, [dimensions, scenes, currentSceneId]);

  return (
    <div className="composition-screen">
      <canvas ref={canvasRef} />
    </div>
  );
}; 