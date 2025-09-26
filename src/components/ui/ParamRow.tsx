import React from 'react';
import { Slider } from './Slider';
import { Button } from './button';

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
      <Button size="icon" variant="secondary" onClick={onDecrement}>
        -
      </Button>
      <Button size="icon" variant="secondary" onClick={onIncrement}>
        +
      </Button>
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
        : 'effect-param tw-w-full tw-min-w-0 tw-pr-0 tw-flex tw-flex-col tw-gap-1 xxl:tw-flex-row xxl:tw-items-center xxl:tw-gap-1'
    }>
      {showLabel && (
        <label className="param-label tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-full xxl:tw-w-[180px] xxl:tw-shrink-0">
          {label}
        </label>
      )}

      {showValue && (
        <span className="param-value tw-text-xs tw-text-neutral-300 tw-tabular-nums tw-w-full tw-text-right xxl:tw-w-[36px]">
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
