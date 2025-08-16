import React, { useEffect, useRef, useState } from 'react';
import { SceneTransition } from '../utils/SceneTransition';

interface TransitionPreviewProps {
  type: 'cut' | 'fade' | 'fade-through-black';
  duration: number;
}

export const TransitionPreview: React.FC<TransitionPreviewProps> = ({ type, duration }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create sample images
    const fromCanvas = document.createElement('canvas');
    const toCanvas = document.createElement('canvas');
    fromCanvas.width = canvas.width;
    toCanvas.width = canvas.width;
    fromCanvas.height = canvas.height;
    toCanvas.height = canvas.height;

    // Draw sample content
    const fromCtx = fromCanvas.getContext('2d');
    const toCtx = toCanvas.getContext('2d');
    if (!fromCtx || !toCtx) return;

    // Draw "from" content (red square)
    fromCtx.fillStyle = '#e74c3c';
    fromCtx.fillRect(
      canvas.width * 0.25,
      canvas.height * 0.25,
      canvas.width * 0.5,
      canvas.height * 0.5
    );

    // Draw "to" content (blue circle)
    toCtx.fillStyle = '#3498db';
    toCtx.beginPath();
    toCtx.arc(
      canvas.width * 0.5,
      canvas.height * 0.5,
      Math.min(canvas.width, canvas.height) * 0.3,
      0,
      Math.PI * 2
    );
    toCtx.fill();

    // Initial state
    ctx.drawImage(fromCanvas, 0, 0);

    // Start transition on click
    const handleClick = () => {
      if (isTransitioning) return;

      setIsTransitioning(true);
      SceneTransition.getInstance().transition(
        fromCanvas,
        toCanvas,
        { type, duration }
      );
    };

    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('click', handleClick);
    };
  }, [type, duration, isTransitioning]);

  return (
    <div className="tw-flex tw-flex-col tw-items-center tw-gap-2">
      <canvas
        ref={canvasRef}
        width={200}
        height={150}
        className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900"
      />
      <div className="tw-text-xs tw-text-neutral-400">
        {isTransitioning ? 'Transitioning...' : 'Click to preview transition'}
      </div>
    </div>
  );
}; 