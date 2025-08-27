import React from 'react';
import { Select, Slider, ParamRow, Input } from './ui';
import { getEffect } from '../utils/effectRegistry';
import { randomizeEffectParams as globalRandomize } from '../utils/ParameterRandomizer';

interface EffectParamsEditorProps {
  effectId: string;
  params: Record<string, any> | undefined;
  onChange: (newParams: Record<string, any>) => void;
}

export const EffectParamsEditor: React.FC<EffectParamsEditorProps> = ({ effectId, params, onChange }) => {
  // Be forgiving with effect IDs discovered via dynamic scanning
  const resolveEffectComponent = (id: string | undefined) => {
    if (!id) return null;
    let comp = getEffect(id);
    if (!comp) {
      const variations = [
        id,
        id.replace(/-/g, ''),
        id.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''),
        id.toLowerCase(),
        id.toUpperCase(),
        id.replace(/Effect$/, ''),
        id + 'Effect',
      ];
      for (const variation of variations) {
        comp = getEffect(variation);
        if (comp) break;
      }
    }
    return comp;
  };

  const effectComponent = effectId ? resolveEffectComponent(effectId) : null;
  const effectMetadata = effectComponent ? (effectComponent as any).metadata : null;

  const currentParams: Record<string, any> = params || {};

  // Minimal inline SVG icons for lock/unlock and dice (no emoji, essential only)
  const LockIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
  const UnlockIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 10V8a5 5 0 1 1 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
  const DiceIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2"/>
      <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
      <circle cx="15" cy="15" r="1.5" fill="currentColor"/>
      <circle cx="15" cy="9" r="1.5" fill="currentColor"/>
      <circle cx="9" cy="15" r="1.5" fill="currentColor"/>
    </svg>
  );

  const [lockedParams, setLockedParams] = React.useState<Record<string, boolean>>({});
  const [localParamValues, setLocalParamValues] = React.useState<Record<string, any>>({});

  // Initialize defaults, locks, and local values when metadata/params change
  React.useEffect(() => {
    const nextLocks: Record<string, boolean> = {};
    const nextValues: Record<string, any> = {};
    if (effectMetadata?.parameters) {
      (effectMetadata.parameters as any[]).forEach((p: any) => {
        const persisted = (currentParams as any)?.[p.name]?.locked;
        if (typeof persisted === 'boolean') nextLocks[p.name] = persisted;
        else if (p.lockDefault) nextLocks[p.name] = true;
        const v = (currentParams as any)?.[p.name]?.value;
        if (v !== undefined) nextValues[p.name] = v;
      });
    } else {
      Object.keys(currentParams || {}).forEach((name) => {
        const persisted = (currentParams as any)[name]?.locked;
        if (typeof persisted === 'boolean') nextLocks[name] = persisted;
        const v = (currentParams as any)[name]?.value;
        if (v !== undefined) nextValues[name] = v;
      });
    }
    setLockedParams(nextLocks);
    setLocalParamValues(nextValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectId, effectMetadata?.parameters, JSON.stringify(Object.keys(currentParams || {}))]);

  const handleParamChange = (paramName: string, value: any, meta?: any) => {
    const updatedParams = { ...currentParams } as Record<string, any>;
    const prevLocked = updatedParams[paramName]?.locked;
    // Ensure boolean parameters initialized to an object with value
    if (meta && meta.type === 'boolean' && updatedParams[paramName] === undefined) {
      updatedParams[paramName] = { value: Boolean(value), ...(prevLocked !== undefined ? { locked: prevLocked } : {}) };
    } else {
      updatedParams[paramName] = { ...(updatedParams[paramName] || {}), value, ...(prevLocked !== undefined ? { locked: prevLocked } : {}) };
    }
    onChange(updatedParams);
    setLocalParamValues((prev) => ({ ...prev, [paramName]: value }));
  };

  const toggleLock = (name: string) => {
    setLockedParams((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      const updated = { ...currentParams } as Record<string, any>;
      if (!updated[name]) updated[name] = { value: effectMetadata?.parameters?.find((p: any) => p.name === name)?.value };
      updated[name] = { ...(updated[name] || {}), locked: next[name] };
      onChange(updated);
      return next;
    });
  };

  const randomizeAll = () => {
    if (!effectMetadata?.parameters) return;
    const unlockedDefs = (effectMetadata.parameters as any[]).filter((p: any) => !lockedParams[p.name]);
    if (unlockedDefs.length === 0) return;
    const randomized = globalRandomize(unlockedDefs, currentParams);
    if (!randomized || Object.keys(randomized).length === 0) return;
    const updated = { ...currentParams } as Record<string, any>;
    Object.entries(randomized).forEach(([name, obj]) => {
      updated[name] = { ...(updated[name] || {}), value: (obj as any).value };
    });
    onChange(updated);
    setLocalParamValues((prev) => {
      const next = { ...prev } as Record<string, any>;
      Object.entries(randomized).forEach(([name, obj]) => {
        (next as any)[name] = (obj as any).value;
      });
      return next;
    });
  };

  const randomizeSingle = (paramDef: any) => {
    const name = paramDef?.name;
    if (!name || lockedParams[name]) return;
    if (!effectMetadata?.parameters) return;
    const randomized = globalRandomize([paramDef], currentParams);
    if (!randomized || !randomized[name]) return;
    const val = (randomized[name] as any).value;
    const updated = { ...currentParams } as Record<string, any>;
    updated[name] = { ...(updated[name] || {}), value: val };
    onChange(updated);
    setLocalParamValues((prev) => ({ ...prev, [name]: val }));
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
          const isLocked = !!lockedParams[paramName];
          return (
            <div key={paramName} className="tw-space-y-1">
              <div className="tw-flex tw-items-center tw-justify-between">
                <label className="tw-text-xs tw-uppercase tw-text-neutral-400">{paramName}</label>
                <div className="tw-flex tw-items-center tw-gap-1">
                  <button
                    type="button"
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title="Randomize this parameter"
                    onClick={() => { /* no metadata; skip safe randomization */ }}
                  >
                    <DiceIcon className="tw-text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(paramName)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title={isLocked ? 'Unlock parameter' : 'Lock parameter'}
                    aria-pressed={isLocked}
                  >
                    {isLocked ? <LockIcon className="tw-text-neutral-400" /> : <UnlockIcon className="tw-text-white" />}
                  </button>
                </div>
              </div>
              <div className="tw-flex tw-items-center tw-gap-2 tw-w-full">
                <div className="tw-flex-1">
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Number(value)]}
                    onValueChange={(values) => values && values.length > 0 && !isLocked && handleParamChange(paramName, values[0])}
                  />
                </div>
                <input
                  type="number"
                  value={Number(value).toFixed(0)}
                  onChange={(e) => !isLocked && handleParamChange(paramName, parseFloat(e.target.value))}
                  className="tw-w-[80px] tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
                  disabled={isLocked}
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
      {/* Toolbar: Randomize all unlocked + Lock/Unlock all */}
      <div className="tw-flex tw-flex-wrap tw-justify-end tw-items-center tw-gap-1">
        <button
          type="button"
          onClick={randomizeAll}
          className="tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none"
          title="Randomize unlocked parameters"
        >
          <DiceIcon className="tw-text-white" />
        </button>
        {(() => {
          const total = (effectMetadata?.parameters || []).length;
          const lockedCount = (effectMetadata?.parameters || []).reduce((acc: number, p: any) => acc + (lockedParams[p.name] ? 1 : 0), 0);
          const allLocked = total > 0 && lockedCount === total;
          const toggleAllLocks = () => {
            if (!effectMetadata?.parameters) return;
            const lock = !allLocked;
            const updated = { ...currentParams } as Record<string, any>;
            (effectMetadata.parameters as any[]).forEach((p: any) => {
              const prev = updated[p.name] || { value: p.value };
              updated[p.name] = { ...prev, locked: lock };
            });
            onChange(updated);
            const nextLocks: Record<string, boolean> = {};
            (effectMetadata.parameters as any[]).forEach((p: any) => { nextLocks[p.name] = lock; });
            setLockedParams(nextLocks);
          };
          return (
            <button
              type="button"
              onClick={toggleAllLocks}
              className="tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none"
              aria-pressed={allLocked}
              title={allLocked ? 'Unlock all parameters' : 'Lock all parameters'}
            >
              {allLocked ? (
                <LockIcon className="tw-text-neutral-300" />
              ) : (
                <UnlockIcon className="tw-text-white" />
              )}
            </button>
          );
        })()}
      </div>

      {effectMetadata.parameters?.map((param: any) => {
        const currentValue = currentParams?.[param.name]?.value ?? param.value;
        const uiValue = localParamValues[param.name] ?? currentValue;
        const isLocked = !!lockedParams[param.name];
        return (
          <div key={param.name} className="tw-w-full tw-min-w-0 tw-flex tw-flex-col xl:tw-grid xl:tw-items-center tw-gap-1 xl:tw-gap-2" style={{ gridTemplateColumns: '160px 1fr 40px' }}>
            {/* Label */}
            <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-full xl:tw-w-[160px] xl:tw-shrink-0">{param.description || param.name}</label>

            {/* Numeric inline */}
            {param.type === 'number' && (
              <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                <div className="tw-flex-1 tw-min-w-0">
                  <ParamRow
                    key={param.name}
                    label={param.description || param.name}
                    value={Number(uiValue)}
                    min={param.min || 0}
                    max={param.max || 1}
                    step={param.step || 0.1}
                    buttonsAfter
                    layout="stacked"
                    onChange={(value) => {
                      if (isLocked) return;
                      setLocalParamValues((prev) => ({ ...prev, [param.name]: value }));
                      handleParamChange(param.name, value, param);
                    }}
                    onIncrement={() => {
                      if (isLocked) return;
                      const currentVal = (localParamValues as any)[param.name] ?? currentValue;
                      const step = param.step || 0.1;
                      const newValue = Math.min(param.max || 1, Number(currentVal) + step);
                      setLocalParamValues((prev) => ({ ...prev, [param.name]: newValue }));
                      handleParamChange(param.name, newValue, param);
                    }}
                    onDecrement={() => {
                      if (isLocked) return;
                      const currentVal = (localParamValues as any)[param.name] ?? currentValue;
                      const step = param.step || 0.1;
                      const newValue = Math.max(param.min || 0, Number(currentVal) - step);
                      setLocalParamValues((prev) => ({ ...prev, [param.name]: newValue }));
                      handleParamChange(param.name, newValue, param);
                    }}
                    showLabel={false}
                  />
                </div>
                <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xl:tw-hidden">
                  <button
                    type="button"
                    onClick={() => randomizeSingle(param)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title="Randomize this parameter"
                  >
                    <DiceIcon className="tw-text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(param.name)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title={isLocked ? 'Unlock parameter' : 'Lock parameter'}
                    aria-pressed={isLocked}
                  >
                    {isLocked ? <LockIcon className="tw-text-neutral-400" /> : <UnlockIcon className="tw-text-white" />}
                  </button>
                </div>
              </div>
            )}

            {param.type === 'color' && (
              <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                <input
                  type="color"
                  value={uiValue}
                  onChange={(e) => !isLocked && handleParamChange(param.name, e.target.value, param)}
                  className="tw-h-8 tw-w-12 tw-rounded tw-bg-transparent tw-border tw-border-neutral-700"
                  disabled={isLocked}
                />
                <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xl:tw-hidden">
                  <button
                    type="button"
                    onClick={() => randomizeSingle(param)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title="Randomize this parameter"
                  >
                    <DiceIcon className="tw-text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(param.name)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title={isLocked ? 'Unlock parameter' : 'Lock parameter'}
                    aria-pressed={isLocked}
                  >
                    {isLocked ? <LockIcon className="tw-text-neutral-400" /> : <UnlockIcon className="tw-text-white" />}
                  </button>
                </div>
              </div>
            )}
            {param.type === 'string' && (
              <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                <div className="tw-flex-1 tw-min-w-0">
                  <Input
                    value={String(uiValue ?? '')}
                    onChange={(e) => {
                      if (isLocked) return;
                      const v = e.target.value;
                      setLocalParamValues((prev) => ({ ...prev, [param.name]: v }));
                      handleParamChange(param.name, v, param);
                    }}
                  />
                </div>
                <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xl:tw-hidden">
                  <button
                    type="button"
                    onClick={() => randomizeSingle(param)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title="Randomize this parameter"
                  >
                    <DiceIcon className="tw-text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(param.name)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title={isLocked ? 'Unlock parameter' : 'Lock parameter'}
                    aria-pressed={isLocked}
                  >
                    {isLocked ? <LockIcon className="tw-text-neutral-400" /> : <UnlockIcon className="tw-text-white" />}
                  </button>
                </div>
              </div>
            )}
            {param.type === 'select' && (
              <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                <div className="tw-w-full sm:tw-w-[240px]">
                  <Select
                    value={String(uiValue)}
                    onChange={(val) => {
                      if (isLocked) return;
                      setLocalParamValues((prev) => ({ ...prev, [param.name]: val as any }));
                      handleParamChange(param.name, val, param);
                    }}
                    options={(param.options || []).map((opt: any) => (typeof opt === 'string' ? { value: opt, label: opt } : { value: opt.value, label: opt.label || opt.value }))}
                  />
                </div>
                <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xl:tw-hidden">
                  <button
                    type="button"
                    onClick={() => randomizeSingle(param)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title="Randomize this parameter"
                  >
                    <DiceIcon className="tw-text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(param.name)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title={isLocked ? 'Unlock parameter' : 'Lock parameter'}
                    aria-pressed={isLocked}
                  >
                    {isLocked ? <LockIcon className="tw-text-neutral-400" /> : <UnlockIcon className="tw-text-white" />}
                  </button>
                </div>
              </div>
            )}
            {param.type === 'boolean' && (
              <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                <button
                  type="button"
                  className={`tw-rounded tw-px-4 tw-py-2 tw-font-bold tw-transition-colors tw-min-w-[60px] tw-appearance-none tw-border tw-border-neutral-700 tw-shadow-none tw-outline-none focus:tw-outline-none focus:tw-ring-0 focus:tw-shadow-none ${Boolean(currentValue) ? 'tw-bg-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-300'} ${isLocked ? 'tw-opacity-50' : ''}`}
                  onClick={() => {
                    if (isLocked) return;
                    const newValue = !Boolean(currentValue);
                    handleParamChange(param.name, newValue, param);
                    setLocalParamValues((prev) => ({ ...prev, [param.name]: newValue }));
                  }}
                  disabled={isLocked}
                >
                  {Boolean(currentValue) ? 'ON' : 'OFF'}
                </button>
                <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xl:tw-hidden">
                  <button
                    type="button"
                    onClick={() => randomizeSingle(param)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title="Randomize this parameter"
                  >
                    <DiceIcon className="tw-text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(param.name)}
                    className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                    title={isLocked ? 'Unlock parameter' : 'Lock parameter'}
                    aria-pressed={isLocked}
                  >
                    {isLocked ? <LockIcon className="tw-text-neutral-400" /> : <UnlockIcon className="tw-text-white" />}
                  </button>
                </div>
              </div>
            )}

            {/* Trailing icons column for xl+ to align across rows */}
            <div className="tw-hidden xl:tw-flex tw-items-center tw-gap-1 tw-justify-end">
              <button
                type="button"
                onClick={() => randomizeSingle(param)}
                className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                title="Randomize this parameter"
              >
                <DiceIcon className="tw-text-white" />
              </button>
              <button
                type="button"
                onClick={() => toggleLock(param.name)}
                className={`tw-inline-flex tw-items-center tw-text-xs tw-p-0 tw-bg-transparent tw-border-none tw-appearance-none`}
                title={isLocked ? 'Unlock parameter' : 'Lock parameter'}
                aria-pressed={isLocked}
              >
                {isLocked ? <LockIcon className="tw-text-neutral-400" /> : <UnlockIcon className="tw-text-white" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};


