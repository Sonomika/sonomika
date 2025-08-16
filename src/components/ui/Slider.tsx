import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

interface SingleValueSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
}

export const Slider: React.FC<SingleValueSliderProps> = ({
  value,
  min = 0,
  max = 1,
  step = 0.1,
  onChange,
  className = ''
}) => {
  const handleValueChange = (val: number[]) => {
    const next = Array.isArray(val) && val.length > 0 ? val[0] : value;
    onChange(next);
  };

  return (
    <SliderPrimitive.Root
      className={`tw-relative tw-flex tw-items-center tw-h-5 tw-w-full tw-select-none tw-touch-none ${className}`}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={handleValueChange}
      aria-label="Slider"
   >
      <SliderPrimitive.Track className="tw-relative tw-h-1.5 tw-flex-1 tw-rounded-full tw-bg-neutral-700">
        <SliderPrimitive.Range className="tw-absolute tw-h-full tw-rounded-full tw-bg-purple-500" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="tw-block tw-h-3.5 tw-w-3.5 tw-rounded-full tw-bg-white tw-border tw-border-neutral-300 tw-shadow focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-purple-500" />
    </SliderPrimitive.Root>
  );
};


