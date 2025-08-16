import React from 'react';
import { Slider } from './Slider';

interface ParamRowProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  showButtons?: boolean;
  showSlider?: boolean;
  showValue?: boolean;
  showLabel?: boolean;
}

export const ParamRow: React.FC<ParamRowProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.1,
  onChange,
  onIncrement,
  onDecrement,
  showButtons = true,
  showSlider = true,
  showValue = true,
  showLabel = true
}) => {

  return (
    <div className="effect-param">
      {showLabel && <label className="param-label">{label}</label>}
      <div className="param-control">
        {showValue && (
          <span className="param-value">
            {label.toLowerCase() === 'opacity' 
              ? `${Math.round(value * 100)}%`
              : step >= 1 
                ? Math.round(value) 
                : value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)
            }
          </span>
        )}
        
        {showButtons && onIncrement && onDecrement && (
          <div className="param-buttons">
            <button type="button" className="param-btn" onClick={onDecrement}>
              -
            </button>
            <button type="button" className="param-btn" onClick={onIncrement}>
              +
            </button>
          </div>
        )}
        
        {showSlider && (
          <div className="slider-container" style={{ minWidth: 120, flex: 1 }}>
            <Slider value={value} min={min} max={max} step={step} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
};
