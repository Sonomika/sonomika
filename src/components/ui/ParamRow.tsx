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
  valueDisplay?: string;
  buttonsAfter?: boolean;
  // Layout control: auto (responsive), stacked (label above), or inline (single row)
  layout?: 'auto' | 'stacked' | 'inline';
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
  showLabel = true,
  valueDisplay,
  buttonsAfter = false,
  layout = 'auto'
}) => {

  // Handle the shadcn/ui Slider's onValueChange which receives an array
  const handleSliderChange = (values: number[]) => {
    // The Slider component passes an array, we take the first value
    if (values && values.length > 0) {
      onChange(values[0]);
    }
  };

  const formattedValue = label.toLowerCase() === 'opacity'
    ? `${Math.round(value * 100)}%`
    : (step >= 1 ? Math.round(value) : value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1));
  const displayValue = valueDisplay ?? formattedValue;

  const Buttons = showButtons && onIncrement && onDecrement ? (
    <div className="param-buttons tw-inline-flex tw-items-center tw-gap-1">
      <button type="button" className="param-btn tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-w-5 tw-h-5 xl:tw-w-6 xl:tw-h-6 leading-[1] hover:tw-bg-neutral-700" onClick={onDecrement}>
        -
      </button>
      <button type="button" className="param-btn tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-w-5 tw-h-5 xl:tw-w-6 xl:tw-h-6 leading-[1] hover:tw-bg-neutral-700" onClick={onIncrement}>
        +
      </button>
    </div>
  ) : null;

  // Stacked layout shows label on top, then a row: value | slider | +/-
  if (layout === 'stacked') {
    return (
      <div className="effect-param tw-w-full tw-min-w-0 tw-pr-0 tw-flex tw-flex-col tw-gap-1">
        {showLabel && (
          <label className="param-label tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-full">
            {label}
          </label>
        )}
        <div className="tw-w-full tw-flex tw-items-center tw-gap-2">
          {showValue && (
            <span className="param-value tw-text-xs tw-text-neutral-300 tw-tabular-nums tw-w-[44px] tw-text-left">
              {displayValue}
            </span>
          )}
          <div className="slider-container tw-flex-1 tw-min-w-0">
            <Slider
              value={[value]}
              min={min}
              max={max}
              step={step}
              onValueChange={handleSliderChange}
            />
          </div>
          {Buttons}
        </div>
      </div>
    );
  }

  // Auto/inline layout (responsive)
  return (
    <div className={
      layout === 'inline'
        ? 'effect-param tw-w-full tw-min-w-0 tw-pr-0 tw-flex tw-items-center tw-gap-1'
        : 'effect-param tw-w-full tw-min-w-0 tw-pr-0 tw-flex tw-flex-col tw-gap-1 xl:tw-flex-row xl:tw-items-center xl:tw-gap-1'
    }>
      {showLabel && (
        <label className="param-label tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-full xl:tw-w-[180px] xl:tw-shrink-0">
          {label}
        </label>
      )}

      {showValue && (
        <span className="param-value tw-text-xs tw-text-neutral-300 tw-tabular-nums tw-w-full tw-text-right xl:tw-w-[36px]">
          {displayValue}
        </span>
      )}

      {showSlider && (
        <div className="tw-w-full tw-flex tw-items-center tw-gap-2">
          {!buttonsAfter && Buttons}
          <div className="slider-container tw-flex-1 tw-min-w-0">
            <Slider
              value={[value]}
              min={min}
              max={max}
              step={step}
              onValueChange={handleSliderChange}
            />
          </div>
          {buttonsAfter && Buttons}
        </div>
      )}
    </div>
  );
};
