import React, { useRef, useState } from 'react';
import { Select } from './ui';
import { LOOP_MODES, type LoopMode } from '../constants/video';
import type { Layer } from '../types/layer';
import { getEffect } from '../utils/effectRegistry';
import { ParamRow, ButtonGroup, Slider } from './ui';
import { randomizeEffectParams as globalRandomize } from '../utils/ParameterRandomizer';

interface LayerOptionsProps {
  selectedLayer: Layer | null;
  onUpdateLayer: (layerId: string, options: Partial<Layer>) => void;
}

// Minimal inline SVG icons for lock/unlock (no emoji)
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
// Minimal dice icon
const DiceIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2"/>
    <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="15" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="9" cy="15" r="1.5" fill="currentColor"/>
  </svg>
);

export const LayerOptions: React.FC<LayerOptionsProps> = ({ selectedLayer, onUpdateLayer }) => {
  // Update local state when selectedLayer changes
  const [loopMode, setLoopMode] = useState<LoopMode>(
    (selectedLayer as any)?.loopMode || LOOP_MODES.NONE
  );
  const [loopCount, setLoopCount] = useState(
    (selectedLayer as any)?.loopCount || 1
  );
  const [blendMode, setBlendMode] = useState(selectedLayer?.blendMode || 'add');
  const [opacity, setOpacity] = useState(selectedLayer?.opacity || 1.0);
  const [playMode, setPlayMode] = useState<'restart' | 'continue'>(
    (selectedLayer as any)?.playMode || 'restart'
  );
  const opacityRafRef = useRef<number | null>(null);
  const opacityPendingRef = useRef<number>(selectedLayer?.opacity || 1.0);
  const [localParamValues, setLocalParamValues] = useState<Record<string, any>>({});
  const [lockedParams, setLockedParams] = useState<Record<string, boolean>>({});

  // Check if the layer has an effect
  const hasEffect = selectedLayer?.type === 'effect' || (selectedLayer as any)?.asset?.type === 'effect' || (selectedLayer as any)?.asset?.isEffect;
  const effectId: string | undefined = (selectedLayer as any)?.asset?.id || (selectedLayer as any)?.asset?.name;
  
  // Try multiple ways to find the effect component
  let effectComponent = null;
  if (hasEffect) {
    effectComponent = effectId ? getEffect(effectId) : null;
    if (!effectComponent && effectId) {
      const variations = [
        effectId,
        effectId.replace(/-/g, ''),
        effectId.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''),
        effectId.toLowerCase(),
        effectId.toUpperCase(),
        effectId.replace(/Effect$/, ''),
        effectId + 'Effect',
      ];
      for (const variation of variations) {
        effectComponent = getEffect(variation);
        if (effectComponent) {
          console.log(`✅ Found effect using variation: ${variation}`);
          break;
        }
      }
    }
  }
  
  const effectMetadata = effectComponent ? (effectComponent as any).metadata : null;

  const toggleLock = (name: string) => {
    setLockedParams(prev => {
      const next = { ...prev, [name]: !prev[name] };
      if (selectedLayer) {
        const params = { ...(selectedLayer.params || {}) } as Record<string, any>;
        if (!params[name]) {
          const def = (effectMetadata?.parameters || []).find((p: any) => p.name === name);
          params[name] = { value: def?.value };
        }
        params[name] = { ...(params[name] || {}), locked: next[name] };
        onUpdateLayer(selectedLayer.id, { params });
      }
      return next;
    });
  };

  // Randomize effect parameters (excludes blend mode, opacity, and locked params)
  const randomizeEffectParams = () => {
    if (!selectedLayer || !hasEffect || !effectMetadata) return;

    const unlockedDefs = (effectMetadata.parameters || []).filter((p: any) => !lockedParams[p.name]);
    if (unlockedDefs.length === 0) return;

    const randomized = globalRandomize(unlockedDefs, selectedLayer.params);
    if (!randomized || Object.keys(randomized).length === 0) return;

    const prevParams = { ...(selectedLayer.params || {}) } as Record<string, any>;
    const updatedParams = { ...prevParams } as Record<string, any>;
    Object.entries(randomized).forEach(([name, obj]) => {
      updatedParams[name] = { ...(prevParams[name] || {}), value: (obj as any).value };
    });

    onUpdateLayer(selectedLayer.id, { params: updatedParams });

    setLocalParamValues((prev) => {
      const next = { ...prev } as Record<string, any>;
      Object.entries(randomized).forEach(([name, obj]) => {
        (next as any)[name] = (obj as any).value;
      });
      return next;
    });
  };

  // Randomize a single parameter
  const randomizeSingleParam = (paramDef: any) => {
    if (!selectedLayer || !hasEffect || !effectMetadata) return;
    const name = paramDef.name;
    if (lockedParams[name]) return;
    const randomized = globalRandomize([paramDef], selectedLayer.params);
    if (!randomized || !randomized[name]) return;
    const val = (randomized[name] as any).value;
    const prevParams = { ...(selectedLayer.params || {}) } as Record<string, any>;
    const updatedParams = {
      ...prevParams,
      [name]: { ...(prevParams[name] || {}), value: val }
    } as Record<string, any>;
    onUpdateLayer(selectedLayer.id, { params: updatedParams });
    setLocalParamValues(prev => ({ ...prev, [name]: val }));
  };

  // Sync local state with selectedLayer and live param changes
  React.useEffect(() => {
    if (selectedLayer) {
      setLoopMode((selectedLayer as any).loopMode || LOOP_MODES.NONE);
      setLoopCount((selectedLayer as any).loopCount || 1);
      setBlendMode(selectedLayer.blendMode || 'add');
      setOpacity(selectedLayer.opacity || 1.0);
      
      if (hasEffect && effectMetadata?.parameters) {
        const baseParams = { ...(selectedLayer.params || {}) } as Record<string, any>;
        let needsUpdate = false;
        (effectMetadata.parameters as any[]).forEach((p: any) => {
          if (baseParams[p.name] === undefined) {
            baseParams[p.name] = { value: p.value };
            needsUpdate = true;
          }
        });
        if (needsUpdate) {
          onUpdateLayer(selectedLayer.id, { params: baseParams });
        }
      }
      
      const initialLocks: Record<string, boolean> = {};
      if (hasEffect && effectMetadata?.parameters) {
        (effectMetadata.parameters as any[]).forEach((p: any) => {
          const persisted = (selectedLayer.params as any)?.[p.name]?.locked;
          if (typeof persisted === 'boolean') initialLocks[p.name] = persisted;
          else if (p.lockDefault) initialLocks[p.name] = true;
        });
      }
      setLockedParams(initialLocks);
      
      const paramValues: Record<string, any> = {};
      if (selectedLayer.params) {
        Object.keys(selectedLayer.params).forEach(paramName => {
          const param = selectedLayer.params?.[paramName];
          if (param && param.value !== undefined) {
            paramValues[paramName] = param.value;
          }
        });
      }
      
      setLocalParamValues(prev => {
        const hasChanges = Object.keys(paramValues).some(key => 
          prev[key] !== paramValues[key]
        );
        return hasChanges ? paramValues : prev;
      });

      const currentPlayMode = (selectedLayer as any)?.playMode;
      if (currentPlayMode === undefined) {
        const defaultPlayMode = 'restart';
        setPlayMode(defaultPlayMode);
        onUpdateLayer(selectedLayer.id, { playMode: defaultPlayMode });
      } else {
        setPlayMode(currentPlayMode);
      }
    }
  }, [selectedLayer?.id, selectedLayer?.params, hasEffect, effectMetadata?.parameters]);

  // Reflect external opacity changes (e.g., LFO) into the local UI state
  React.useEffect(() => {
    if (typeof selectedLayer?.opacity === 'number') {
      setOpacity(selectedLayer.opacity);
    }
  }, [selectedLayer?.opacity]);

  const handleLoopModeChange = (mode: LoopMode) => {
    setLoopMode(mode);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        loopMode: mode,
        loopCount: mode === LOOP_MODES.NONE ? 1 : loopCount,
        reverseEnabled: mode === LOOP_MODES.REVERSE,
        pingPongEnabled: mode === LOOP_MODES.PING_PONG
      });
    }
  };

  const handleLoopCountChange = (count: number) => {
    setLoopCount(count);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...(selectedLayer as any),
        loopCount: count
      });
    }
  };

  const handleBlendModeChange = (mode: string) => {
    setBlendMode(mode);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...(selectedLayer as any),
        blendMode: mode
      });
    }
  };

  const handlePlayModeChange = (mode: 'restart' | 'continue') => {
    setPlayMode(mode);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...(selectedLayer as any),
        playMode: mode
      });
    }
  };

  const commitOpacity = (value: number) => {
    if (!selectedLayer) return;
    onUpdateLayer(selectedLayer.id, {
      ...(selectedLayer as any),
      opacity: value,
    });
  };

  const handleOpacityChange = (value: number) => {
    setOpacity(value);
    opacityPendingRef.current = value;
    if (opacityRafRef.current == null) {
      opacityRafRef.current = requestAnimationFrame(() => {
        commitOpacity(opacityPendingRef.current);
        opacityRafRef.current = null;
      });
    }
  };

  const handleEffectParamChange = (paramName: string, value: any) => {
    if (selectedLayer) {
      const currentParams = { ...(selectedLayer.params || {}) } as Record<string, any>;
      if (currentParams[paramName] === undefined) currentParams[paramName] = {};
      const prevLocked = currentParams[paramName].locked;
      currentParams[paramName] = { ...currentParams[paramName], value, ...(prevLocked !== undefined ? { locked: prevLocked } : {}) };
      onUpdateLayer(selectedLayer.id, { params: currentParams });
      setLocalParamValues(prev => ({
        ...prev,
        [paramName]: value
      }));
    }
  };

  if (!selectedLayer) {
    return (
      <div className="tw-space-y-4 tw-text-neutral-200">
        <div className="tw-border-b tw-border-neutral-800 tw-pb-2">
          <h3 className="tw-text-base tw-font-semibold">Layer Options</h3>
        </div>
        <div className="tw-space-y-2">
          <h3 className="tw-text-sm tw-font-medium">No Layer Selected</h3>
          <p className="tw-text-neutral-400 tw-text-sm">Select a layer to configure options</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-text-neutral-200 tw-pt-2 tw-pr-12">
      <div className="tw-space-y-4">
        {hasEffect && (
          <div className="tw-space-y-2">
            <div className="tw-grid tw-items-center" style={{ gridTemplateColumns: '180px 1fr 48px' }}>
              <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300 tw-col-span-2 tw-min-w-0 tw-pr-2 tw-truncate">
                Effect Parameters{effectId ? ` · ${String(effectId)}` : ''}
              </h4>
              <div className="tw-flex tw-justify-end tw-items-center tw-gap-1">
                <button
                  type="button"
                  onClick={randomizeEffectParams}
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
                    if (!selectedLayer || !effectMetadata) return;
                    const lock = !allLocked;
                    const params = { ...(selectedLayer.params || {}) } as Record<string, any>;
                    (effectMetadata.parameters as any[]).forEach((p: any) => {
                      const prev = params[p.name] || { value: p.value };
                      params[p.name] = { ...prev, locked: lock };
                    });
                    onUpdateLayer(selectedLayer.id, { params });
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
            </div>
            <div className="tw-space-y-3 tw-pr-6">
              {effectMetadata ? (
                effectMetadata.parameters?.map((param: any) => {
                  const currentValue = selectedLayer.params?.[param.name]?.value ?? param.value;
                  const uiValue = localParamValues[param.name] ?? currentValue;
                  const isLocked = !!lockedParams[param.name];
                  
                  return (
                    <div key={param.name} className="tw-flex tw-items-center tw-gap-2 tw-w-full">
                      {/* Label */}
                      <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-shrink-0 tw-w-[180px]">{param.description || param.name}</label>

                      {/* Numeric inline: value, +/- and slider in one row */}
                      {param.type === 'number' && (
                        <div className="tw-flex-1 tw-min-w-0">
                          <ParamRow
                            key={param.name}
                            label={param.description || param.name}
                            value={uiValue}
                            min={param.min || 0}
                            max={param.max || 1}
                            step={param.step || 0.1}
                            buttonsAfter
                            onChange={(value) => {
                              if (isLocked) return;
                              setLocalParamValues(prev => ({ ...prev, [param.name]: value }));
                              handleEffectParamChange(param.name, value);
                            }}
                            onIncrement={() => {
                              if (isLocked) return;
                              const currentVal = localParamValues[param.name] ?? currentValue;
                              const step = param.step || 0.1;
                              const newValue = Math.min(param.max || 1, currentVal + step);
                              setLocalParamValues(prev => ({ ...prev, [param.name]: newValue }));
                              handleEffectParamChange(param.name, newValue);
                            }}
                            onDecrement={() => {
                              if (isLocked) return;
                              const currentVal = localParamValues[param.name] ?? currentValue;
                              const step = param.step || 0.1;
                              const newValue = Math.max(param.min || 0, currentVal - step);
                              setLocalParamValues(prev => ({ ...prev, [param.name]: newValue }));
                              handleEffectParamChange(param.name, newValue);
                            }}
                            showLabel={false}
                          />
                        </div>
                      )}

                      {/* Other control types keep compact width */}
                      {param.type === 'color' && (
                        <input
                          type="color"
                          value={currentValue}
                          onChange={(e) => handleEffectParamChange(param.name, e.target.value)}
                          className="tw-h-8 tw-w-12 tw-rounded tw-bg-transparent tw-border tw-border-neutral-700"
                          disabled={isLocked}
                        />
                      )}
                      {param.type === 'select' && (
                        <div className="tw-w-[240px]">
                          <Select
                            value={String(uiValue)}
                            onChange={(val) => {
                              if (isLocked) return;
                              setLocalParamValues(prev => ({ ...prev, [param.name]: val as any }));
                              handleEffectParamChange(param.name, val);
                            }}
                            options={(param.options || []).map((opt: any) => (typeof opt === 'string' ? { value: opt, label: opt } : { value: opt.value, label: opt.label || opt.value }))}
                          />
                        </div>
                      )}
                      {param.type === 'boolean' && (
                        <div>
                          <button
                            type="button"
                            className={`tw-rounded tw-px-4 tw-py-2 tw-font-bold tw-transition-colors tw-min-w-[60px] tw-appearance-none tw-border tw-border-neutral-700 tw-shadow-none tw-outline-none focus:tw-outline-none focus:tw-ring-0 focus:tw-shadow-none ${Boolean(currentValue) ? 'tw-bg-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-300'} ${isLocked ? 'tw-opacity-50' : ''}`}
                            onClick={() => {
                              if (isLocked) return;
                              const newValue = !Boolean(currentValue);
                              handleEffectParamChange(param.name, newValue);
                              setLocalParamValues(prev => ({
                                ...prev,
                                [param.name]: newValue
                              }));
                            }}
                            disabled={isLocked}
                          >
                            {Boolean(currentValue) ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      )}

                      {/* Icons at end */}
                      <div className="tw-flex tw-items-center tw-gap-1 tw-shrink-0 tw-ml-auto tw-w-[48px] tw-justify-end">
                        <button
                          type="button"
                          onClick={() => randomizeSingleParam(param)}
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
                })
              ) : (
                selectedLayer.params && Object.keys(selectedLayer.params).map((paramName) => {
                  const param = selectedLayer.params?.[paramName];
                  const currentValue = param?.value ?? 1.0;
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
                            onClick={() => {
                              // Without metadata we cannot safely randomize; no-op
                            }}
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
                      <div className="tw-flex tw-items-center tw-gap-2">
                        {paramName === 'color' ? (
                          <input
                            type="color"
                            value={currentValue}
                            onChange={(e) => handleEffectParamChange(paramName, e.target.value)}
                            className="tw-h-8 tw-w-12 tw-rounded tw-bg-transparent tw-border tw-border-neutral-700"
                            disabled={isLocked}
                          />
                        ) : (
                          <div className="tw-flex tw-items-center tw-gap-2 tw-w-full">
                            <div className="tw-flex-1">
                              <Slider
                                min={param?.min || 0}
                                max={param?.max || 100}
                                step={param?.step || 1}
                                value={[localParamValues[paramName] ?? (param?.value ?? 0)]}
                                onValueChange={(values) => !isLocked && values && values.length > 0 && handleEffectParamChange(paramName, values[0])}
                              />
                            </div>
                            <input
                              type="number"
                              value={Number(localParamValues[paramName] ?? (param?.value ?? 0)).toFixed(0)}
                              onChange={(e) => !isLocked && handleEffectParamChange(paramName, parseFloat(e.target.value))}
                              className="tw-w-[80px] tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
                              disabled={isLocked}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }).filter(Boolean)
              )}
            </div>
          </div>
        )}

        {/* Video-specific options */}
        {(() => {
          const assetName = (selectedLayer as any)?.asset?.name || '';
          const isVideoLayer = selectedLayer?.type === 'video' || 
                               (selectedLayer as any)?.asset?.type === 'video' ||
                               assetName.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i);
          
          return isVideoLayer ? (
            <div className="tw-space-y-2">
              <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">Video Options</h4>
              <div>
                <div className="tw-flex tw-flex-wrap tw-gap-2">
                  <button
                    className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.NONE ? 'tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                    style={loopMode === LOOP_MODES.NONE ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                    onClick={() => handleLoopModeChange(LOOP_MODES.NONE)}
                  >
                    None
                  </button>
                  <button
                    className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.LOOP ? 'tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                    style={loopMode === LOOP_MODES.LOOP ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                    onClick={() => handleLoopModeChange(LOOP_MODES.LOOP)}
                  >
                    Loop
                  </button>
                  <button
                    className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.REVERSE ? 'tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                    style={loopMode === LOOP_MODES.REVERSE ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                    onClick={() => handleLoopModeChange(LOOP_MODES.REVERSE)}
                  >
                    Reverse
                  </button>
                  <button
                    className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.PING_PONG ? 'tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                    style={loopMode === LOOP_MODES.PING_PONG ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                    onClick={() => handleLoopModeChange(LOOP_MODES.PING_PONG)}
                  >
                    Ping-Pong
                  </button>
                </div>
              </div>
              
              <div>
                <label>Play Mode:</label>
                <ButtonGroup
                  options={[
                    { value: 'restart', label: 'Restart' },
                    { value: 'continue', label: 'Continue' }
                  ]}
                  value={playMode}
                  onChange={(value) => handlePlayModeChange(value as 'restart' | 'continue')}
                  columns={2}
                  size="small"
                />
              </div>
            </div>
          ) : null;
        })()}

        {loopMode !== LOOP_MODES.NONE && (
          <div className="tw-space-y-2">
            <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">Loop Count</h4>
            <div>
              <div className="tw-inline-flex tw-items-center tw-gap-2">
                <button
                  className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-2 tw-py-1 hover:tw-bg-neutral-700 disabled:tw-opacity-50"
                  onClick={() => handleLoopCountChange(Math.max(1, loopCount - 1))}
                  disabled={loopCount <= 1}
                >
                  -
                </button>
                <span className="tw-min-w-[2ch] tw-text-center">{loopCount}</span>
                <button
                  className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-2 tw-py-1 hover:tw-bg-neutral-700"
                  onClick={() => handleLoopCountChange(loopCount + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="tw-space-y-2">
          <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">Blend Mode</h4>
          <div>
            <div className="tw-flex tw-flex-wrap tw-gap-2">
              <button
                className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${blendMode === 'add' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                onClick={() => handleBlendModeChange('add')}
                title="Add - Brightens overlapping areas"
              >
                Add
              </button>
              <button
                className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${blendMode === 'multiply' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                onClick={() => handleBlendModeChange('multiply')}
                title="Multiply - Darkens overlapping areas"
              >
                Multiply
              </button>
              <button
                className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${blendMode === 'screen' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                onClick={() => handleBlendModeChange('screen')}
                title="Screen - Lightens overlapping areas"
              >
                Screen
              </button>
              <button
                className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${blendMode === 'overlay' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                onClick={() => handleBlendModeChange('overlay')}
                title="Overlay - Combines multiply and screen"
              >
                Overlay
              </button>
              <button
                className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${blendMode === 'difference' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                onClick={() => handleBlendModeChange('difference')}
                title="Difference - Shows differences between layers"
              >
                Difference
              </button>
            </div>
          </div>
        </div>

        <div className="tw-space-y-2">
          <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">General</h4>
          <div className="tw-flex tw-items-center tw-gap-2 tw-pr-6">
            <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-shrink-0 tw-w-[180px]">Opacity</label>
            <div className="tw-flex-1 tw-min-w-0">
              <ParamRow
                label="Opacity"
                value={opacity}
                min={0}
                max={1}
                step={0.01}
                buttonsAfter
                showLabel={false}
                onChange={(value) => handleOpacityChange(value)}
                onIncrement={() => handleOpacityChange(Math.min(1, opacity + 0.01))}
                onDecrement={() => handleOpacityChange(Math.max(0, opacity - 0.01))}
              />
            </div>
            {/* Spacer to align with random/lock icons column on other rows */}
            <div className="tw-ml-2 tw-w-[48px] tw-shrink-0" />
          </div>
        </div>


      </div>
    </div>
  );
}; 