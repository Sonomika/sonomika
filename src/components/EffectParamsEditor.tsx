import React from 'react';
import { Select, Slider, ParamRow } from './ui';
import { getEffect } from '../utils/effectRegistry';

interface EffectParamsEditorProps {
  effectId: string;
  params: Record<string, any> | undefined;
  onChange: (newParams: Record<string, any>) => void;
}

export const EffectParamsEditor: React.FC<EffectParamsEditorProps> = ({ effectId, params, onChange }) => {
  const effectComponent = effectId ? getEffect(effectId) : null;
  const effectMetadata = effectComponent ? (effectComponent as any).metadata : null;

  const currentParams: Record<string, any> = params || {};

  const handleParamChange = (paramName: string, value: any, meta?: any) => {
    const updatedParams = { ...currentParams };
    // Ensure boolean parameters initialized to an object with value
    if (meta && meta.type === 'boolean' && updatedParams[paramName] === undefined) {
      updatedParams[paramName] = { value: Boolean(value) };
    } else {
      updatedParams[paramName] = { value };
    }
    onChange(updatedParams);
  };

  if (!effectId) {
    return <div className="tw-text-neutral-400 tw-text-sm">No effect selected.</div>;
  }

  if (!effectMetadata) {
    // Fallback: render based on provided params if no metadata
    return (
      <div className="tw-space-y-3">
        {Object.keys(currentParams || {}).map((paramName) => {
          const param = currentParams[paramName];
          const value = param?.value ?? 0;
          return (
            <div key={paramName} className="tw-space-y-1">
              <label className="tw-text-xs tw-uppercase tw-text-neutral-400">{paramName}</label>
              <div className="tw-flex tw-items-center tw-gap-2 tw-w-full">
                <div className="tw-flex-1">
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Number(value)]}
                    onValueChange={(values) => values && values.length > 0 && handleParamChange(paramName, values[0])}
                  />
                </div>
                <input
                  type="number"
                  value={Number(value).toFixed(0)}
                  onChange={(e) => handleParamChange(paramName, parseFloat(e.target.value))}
                  className="tw-w-[80px] tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="tw-space-y-3">
      {effectMetadata.parameters?.map((param: any) => {
        const currentValue = currentParams?.[param.name]?.value ?? param.value;
        return (
          <div key={param.name} className="tw-space-y-1">
            <label className="tw-text-xs tw-uppercase tw-text-neutral-400">{param.description || param.name}</label>
            <div className="tw-flex tw-items-center tw-gap-2">
              {param.type === 'color' && (
                <input
                  type="color"
                  value={currentValue}
                  onChange={(e) => handleParamChange(param.name, e.target.value, param)}
                  className="tw-h-8 tw-w-12 tw-rounded tw-bg-transparent tw-border tw-border-neutral-700"
                />
              )}
              {param.type === 'select' && (
                <div className="tw-w-40">
                  <Select
                    value={String(currentValue)}
                    onChange={(val) => handleParamChange(param.name, val, param)}
                    options={(param.options || []).map((opt: any) => ({ value: opt.value, label: opt.label }))}
                  />
                </div>
              )}
              {param.type === 'boolean' && (
                <button
                  type="button"
                  className={`tw-rounded tw-px-4 tw-py-2 tw-font-bold tw-transition-colors tw-min-w-[60px] ${Boolean(currentValue) ? 'tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-300'}`}
                  style={Boolean(currentValue) ? { backgroundColor: 'var(--accent)' } : undefined}
                  onClick={() => handleParamChange(param.name, !Boolean(currentValue), param)}
                >
                  {Boolean(currentValue) ? 'ON' : 'OFF'}
                </button>
              )}
              {param.type === 'number' && (
                <ParamRow
                  key={param.name}
                  label={param.description || param.name}
                  value={Number(currentValue)}
                  min={param.min || 0}
                  max={param.max || 1}
                  step={param.step || 0.1}
                  onChange={(value) => handleParamChange(param.name, value, param)}
                  onIncrement={() => handleParamChange(param.name, Math.min(param.max || 1, Number(currentValue) + (param.step || 0.1)), param)}
                  onDecrement={() => handleParamChange(param.name, Math.max(param.min || 0, Number(currentValue) - (param.step || 0.1)), param)}
                  showLabel={false}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};


