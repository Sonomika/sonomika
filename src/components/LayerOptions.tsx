import React, { useRef, useState } from 'react';
import { Select, Input } from './ui';
import { LOOP_MODES, type LoopMode } from '../constants/video';
import type { Layer } from '../types/layer';
import { getEffect } from '../utils/effectRegistry';
import { ParamRow, ButtonGroup, Slider } from './ui';
import { randomizeEffectParams as globalRandomize } from '../utils/ParameterRandomizer';
import { useStore } from '../store/store';
import { useLFOStore } from '../store/lfoStore';
import { useVideoOptionsStore } from '../store/videoOptionsStore';
import { CircleIcon } from '@radix-ui/react-icons';
import { LockedIcon, UnlockedIcon } from './ui';

interface LayerOptionsProps {
  selectedLayer: Layer | null;
  onUpdateLayer: (layerId: string, options: Partial<Layer>) => void;
}

// Radix replacements for lock/unlock and dice
const LockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <LockedIcon className={className || 'tw-w-3.5 tw-h-3.5'} />
);
const UnlockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <UnlockedIcon className={className || 'tw-w-3.5 tw-h-3.5'} />
);
const DiceIcon: React.FC<{ className?: string }> = ({ className }) => (
  <CircleIcon className={className || 'tw-w-3.5 tw-h-3.5'} />
);

export const LayerOptions: React.FC<LayerOptionsProps> = ({ selectedLayer, onUpdateLayer }) => {
  const { defaultVideoRenderScale, showTimeline, selectedTimelineClip, setSelectedTimelineClip } = useStore() as any;
  // Subscribe to live LFO modulations so sliders reflect movement during playback (esp. timeline)
  const modulatedValues = useLFOStore((state) => state.modulatedValues);
  // Video options store
  const getVideoOptionsForLayer = useVideoOptionsStore((state) => state.getVideoOptionsForLayer);
  const setVideoOptionsForLayerMode = useVideoOptionsStore((state) => state.setVideoOptionsForLayerMode);
  const ensureVideoOptionsForLayer = useVideoOptionsStore((state) => state.ensureVideoOptionsForLayer);
  const [isTimelinePlaying, setIsTimelinePlaying] = React.useState<boolean>(Boolean((window as any).__vj_timeline_is_playing__ === true));
  React.useEffect(() => {
    const onPlay = () => setIsTimelinePlaying(true);
    const onStop = () => setIsTimelinePlaying(false);
    document.addEventListener('timelinePlay', onPlay as any);
    document.addEventListener('timelineStop', onStop as any);
    return () => {
      document.removeEventListener('timelinePlay', onPlay as any);
      document.removeEventListener('timelineStop', onStop as any);
    };
  }, []);
  // Get video options for current mode
  const videoOptions = selectedLayer ? getVideoOptionsForLayer(selectedLayer.id, showTimeline) : null;
  
  // Update local state when selectedLayer changes
  const [loopMode, setLoopMode] = useState<LoopMode>(
    videoOptions?.loopMode || LOOP_MODES.NONE
  );
  const [loopCount, setLoopCount] = useState(
    videoOptions?.loopCount || 1
  );
  // Blend mode and opacity controls removed; values still exist in rendering but are no longer editable here
  const [playMode, setPlayMode] = useState<'restart' | 'continue'>(
    videoOptions?.playMode || 'restart'
  );
  // Removed opacity RAF bookkeeping (UI removed)
  const [localParamValues, setLocalParamValues] = useState<Record<string, any>>({});
  const [lockedParams, setLockedParams] = useState<Record<string, boolean>>({});
  // Global randomization smoothing
  const [randSmoothing, setRandSmoothing] = useState<number>(0.1);
  const randAnimRafRef = useRef<number | null>(null);

  // Expose smoothing globally so mapper/random triggers can respect it
  React.useEffect(() => {
    try {
      const v = Math.max(0, Math.min(1, Number(randSmoothing)));
      (window as any).__vj_rand_smoothing = Number.isFinite(v) ? v : 0.1;
    } catch {}
  }, [randSmoothing]);

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

  // Build a lookup of live modulated values for the current layer
  const liveModulatedByParam: Record<string, number> = React.useMemo(() => {
    const out: Record<string, number> = {};
    const lid = selectedLayer?.id ? String(selectedLayer.id) : null;
    if (!lid) return out;
    try {
      Object.entries(modulatedValues || {}).forEach(([key, val]: any) => {
        if (key.startsWith(`${lid}-`) && val && typeof val.modulatedValue === 'number') {
          const pname = key.slice(lid.length + 1);
          out[pname] = Number(val.modulatedValue);
        }
      });
    } catch {}
    return out;
  }, [modulatedValues, selectedLayer?.id]);

  // When timeline is playing, mirror live modulated values into local UI state
  React.useEffect(() => {
    if (!showTimeline || !isTimelinePlaying) return;
    if (!selectedLayer) return;
    const keys = Object.keys(liveModulatedByParam);
    if (keys.length === 0) return;
    setLocalParamValues((prev) => {
      const next = { ...prev } as Record<string, any>;
      keys.forEach((k) => { next[k] = liveModulatedByParam[k]; });
      return next;
    });
  }, [showTimeline, isTimelinePlaying, selectedLayer?.id, liveModulatedByParam]);

  const handleFitModeChange = (mode: 'cover' | 'contain' | 'stretch' | 'none' | 'tile') => {
    // Update video options store
    if (selectedLayer) {
      setVideoOptionsForLayerMode(selectedLayer.id, {
        fitMode: mode,
        backgroundSizeMode: mode === 'tile' ? 'contain' : undefined,
        backgroundRepeat: mode === 'tile' ? 'repeat' as any : 'no-repeat' as any,
        backgroundSizeCustom: undefined
      }, showTimeline);
      
      // Also update the layer data in the main store for immediate rendering
      onUpdateLayer(selectedLayer.id, {
        fitMode: mode,
        backgroundSizeMode: mode === 'tile' ? 'contain' : undefined,
        backgroundRepeat: mode === 'tile' ? 'repeat' as any : 'no-repeat' as any,
        backgroundSizeCustom: undefined
      } as any);
    }

    // In timeline mode, also update the selectedTimelineClip data so preview works independently
    try {
      if (showTimeline && selectedTimelineClip && typeof setSelectedTimelineClip === 'function') {
        const prev = selectedTimelineClip as any;
        const nextData = { ...(prev.data || {}) } as any;
        // Store fitMode at the top level of clip data, not in params
        nextData.fitMode = mode;
        nextData.backgroundSizeMode = mode === 'tile' ? 'contain' : undefined;
        nextData.backgroundRepeat = mode === 'tile' ? 'repeat' : 'no-repeat';
        nextData.backgroundSizeCustom = undefined;
        setSelectedTimelineClip({ ...prev, data: nextData });
      }
    } catch {}
  };

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

    // Tween when smoothing > 0; instant when 0
    const smoothing = Math.max(0, Math.min(1, randSmoothing));
    if (smoothing > 0) {
      // Build targets and immediate non-numeric params
      const targets: Record<string, number> = {};
      const starts: Record<string, number> = {};
      const immediateNonNumeric: Record<string, any> = {};
      (unlockedDefs as any[]).forEach((def: any) => {
        const name = def.name;
        const randomizedObj = (randomized as any)[name];
        const randomTarget = randomizedObj ? randomizedObj.value : (prevParams[name]?.value ?? def.value);
        if (def.type === 'number') {
          const metaMin = typeof def.min === 'number' ? def.min : 0;
          const metaMax = typeof def.max === 'number' ? def.max : 1;
          const currentVal: number = Number(prevParams[name]?.value ?? def.value);
          const target = Math.max(metaMin, Math.min(metaMax, Number(randomTarget)));
          targets[name] = target;
          starts[name] = currentVal;
        } else {
          // Non-numeric: store immediate value to always apply
          immediateNonNumeric[name] = { ...(prevParams[name] || {}), value: randomTarget };
        }
      });

      // Cancel any running animation
      if (randAnimRafRef.current != null) {
        cancelAnimationFrame(randAnimRafRef.current);
        randAnimRafRef.current = null;
      }

      // Duration scales with smoothing (0..1 → 0..2000ms)
      const baseDuration = 2000; // ms at max smoothing
      const duration = baseDuration * smoothing;
      const easeInOut = (x: number) => {
        // cubic easeInOut
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      };

      let startTime: number | null = null;
      const step = (ts: number) => {
        if (startTime == null) startTime = ts;
        // Start from previous params and merge immediate non-numeric updates
        const frameParams = { ...prevParams, ...immediateNonNumeric } as Record<string, any>;
        Object.keys(targets).forEach((name) => {
          const from = starts[name];
          const to = targets[name];
          const elapsed = ts - startTime!;
          const pLin = Math.max(0, Math.min(1, duration > 0 ? elapsed / duration : 1));
          const p = easeInOut(pLin);
          const v = from + (to - from) * p;
          frameParams[name] = { ...(prevParams[name] || {}), value: v };
        });
        onUpdateLayer(selectedLayer.id, { params: frameParams });
        setLocalParamValues((prev) => {
          const next = { ...prev } as Record<string, any>;
          Object.keys(targets).forEach((name) => { next[name] = frameParams[name].value; });
          return next;
        });
        const allDone = (ts - startTime!) >= duration;
        if (!allDone) {
          randAnimRafRef.current = requestAnimationFrame(step);
        } else {
          randAnimRafRef.current = null;
        }
      };
      randAnimRafRef.current = requestAnimationFrame(step);
      return;
    }

    // Otherwise apply instant step (no ease)
    (unlockedDefs as any[]).forEach((def: any) => {
      const name = def.name;
      const metaMin = typeof def.min === 'number' ? def.min : 0;
      const metaMax = typeof def.max === 'number' ? def.max : 1;
      const currentVal: any = prevParams[name]?.value ?? def.value;
      const randomizedObj = (randomized as any)[name];
      const randomTarget = randomizedObj ? randomizedObj.value : currentVal;
      if (def.type === 'number') {
        const target = Math.max(metaMin, Math.min(metaMax, Number(randomTarget)));
        updatedParams[name] = { ...(prevParams[name] || {}), value: target };
      } else {
        updatedParams[name] = { ...(prevParams[name] || {}), value: randomTarget };
      }
    });

    onUpdateLayer(selectedLayer.id, { params: updatedParams });

    setLocalParamValues((prev) => {
      const next = { ...prev } as Record<string, any>;
      (unlockedDefs as any[]).forEach((def: any) => { next[def.name] = updatedParams[def.name]?.value; });
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

  // Sync local state with video options and live param changes
  React.useEffect(() => {
    if (selectedLayer) {
      // Ensure video options exist for this layer
      ensureVideoOptionsForLayer(selectedLayer.id, showTimeline);
      const options = getVideoOptionsForLayer(selectedLayer.id, showTimeline);
      
      setLoopMode(options.loopMode || LOOP_MODES.NONE);
      setLoopCount(options.loopCount || 1);
      // Blend mode and opacity no longer controlled via UI
      
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

      const currentPlayMode = options.playMode;
      if (currentPlayMode === undefined) {
        const defaultPlayMode = 'restart';
        setPlayMode(defaultPlayMode);
        setVideoOptionsForLayerMode(selectedLayer.id, { playMode: defaultPlayMode }, showTimeline);
      } else {
        setPlayMode(currentPlayMode);
      }
    }
  }, [selectedLayer?.id, selectedLayer?.params, hasEffect, effectMetadata?.parameters, showTimeline, ensureVideoOptionsForLayer, getVideoOptionsForLayer, setVideoOptionsForLayerMode]);

  // Opacity UI removed

  const handleLoopModeChange = (mode: LoopMode) => {
    setLoopMode(mode);
    if (selectedLayer) {
      setVideoOptionsForLayerMode(selectedLayer.id, {
        loopMode: mode,
        loopCount: mode === LOOP_MODES.NONE ? 1 : loopCount,
        reverseEnabled: mode === LOOP_MODES.REVERSE,
        pingPongEnabled: mode === LOOP_MODES.PING_PONG
      }, showTimeline);
      
      // Also update the layer data in the main store for immediate rendering
      onUpdateLayer(selectedLayer.id, {
        loopMode: mode,
        loopCount: mode === LOOP_MODES.NONE ? 1 : loopCount,
        reverseEnabled: mode === LOOP_MODES.REVERSE,
        pingPongEnabled: mode === LOOP_MODES.PING_PONG
      } as any);
    }

    // In timeline mode, also update the selectedTimelineClip data
    try {
      if (showTimeline && selectedTimelineClip && typeof setSelectedTimelineClip === 'function') {
        const prev = selectedTimelineClip as any;
        const nextData = { ...(prev.data || {}) } as any;
        nextData.loopMode = mode;
        nextData.loopCount = mode === LOOP_MODES.NONE ? 1 : loopCount;
        nextData.reverseEnabled = mode === LOOP_MODES.REVERSE;
        nextData.pingPongEnabled = mode === LOOP_MODES.PING_PONG;
        setSelectedTimelineClip({ ...prev, data: nextData });
      }
    } catch {}
  };

  const handleLoopCountChange = (count: number) => {
    setLoopCount(count);
    if (selectedLayer) {
      setVideoOptionsForLayerMode(selectedLayer.id, {
        loopCount: count
      }, showTimeline);
      
      // Also update the layer data in the main store for immediate rendering
      onUpdateLayer(selectedLayer.id, {
        loopCount: count
      } as any);
    }

    // In timeline mode, also update the selectedTimelineClip data
    try {
      if (showTimeline && selectedTimelineClip && typeof setSelectedTimelineClip === 'function') {
        const prev = selectedTimelineClip as any;
        const nextData = { ...(prev.data || {}) } as any;
        nextData.loopCount = count;
        setSelectedTimelineClip({ ...prev, data: nextData });
      }
    } catch {}
  };

  // Blend mode UI removed

  const handlePlayModeChange = (mode: 'restart' | 'continue') => {
    setPlayMode(mode);
    if (selectedLayer) {
      setVideoOptionsForLayerMode(selectedLayer.id, {
        playMode: mode
      }, showTimeline);
      
      // Also update the layer data in the main store for immediate rendering
      onUpdateLayer(selectedLayer.id, {
        playMode: mode
      } as any);
    }

    // In timeline mode, also update the selectedTimelineClip data
    try {
      if (showTimeline && selectedTimelineClip && typeof setSelectedTimelineClip === 'function') {
        const prev = selectedTimelineClip as any;
        const nextData = { ...(prev.data || {}) } as any;
        nextData.playMode = mode;
        setSelectedTimelineClip({ ...prev, data: nextData });
      }
    } catch {}
  };

  // Opacity UI removed

  const handleRenderScaleChange = (value: number) => {
    if (!selectedLayer) return;
    const clamped = Number.isFinite(value) ? Math.max(0.1, Math.min(1, value)) : 1;
    setVideoOptionsForLayerMode(selectedLayer.id, { renderScale: clamped }, showTimeline);
    
    // Also update the layer data in the main store for immediate rendering
    onUpdateLayer(selectedLayer.id, { renderScale: clamped } as any);

    // In timeline mode, also update the selectedTimelineClip data
    try {
      if (showTimeline && selectedTimelineClip && typeof setSelectedTimelineClip === 'function') {
        const prev = selectedTimelineClip as any;
        const nextData = { ...(prev.data || {}) } as any;
        nextData.renderScale = clamped;
        setSelectedTimelineClip({ ...prev, data: nextData });
      }
    } catch {}

    // Keep sequence transport alive if active
    try {
      const st: any = useStore.getState();
      if (st.sequenceEnabledGlobal && typeof st.globalPlay === 'function') {
        st.globalPlay();
      }
    } catch {}
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
    <div className="tw-text-neutral-200 tw-pt-2 tw-pr-4 sm:tw-pr-8">
      <div className="tw-space-y-4">
        {hasEffect && (
          <div className="tw-space-y-2">
            {/* Header row: stack through lg; grid on >=xxl */}
            <div className="tw-flex tw-flex-col xxl:tw-grid xxl:tw-items-center" style={{ gridTemplateColumns: '180px 1fr 48px' }}>
              <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300 xxl:tw-col-span-2 tw-min-w-0 tw-pr-2 tw-truncate">
                Effect Parameters{effectId ? ` · ${String(effectId)}` : ''}
              </h4>
              <div className="tw-flex tw-justify-end tw-items-center tw-gap-1 tw-mt-1 xxl:tw-mt-0">
                {/* Smoothing (0..1) */}
                <div className="tw-flex tw-items-center tw-gap-1" title="Smoothing (0 = instant, 1 = full tween)">
                  <span className="tw-text-xs tw-text-neutral-400">Smooth</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={1}
                    value={Number(randSmoothing).toFixed(1)}
                    onChange={(e) => setRandSmoothing(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                    className="tw-w-[52px] tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-1 tw-py-0.5"
                  />
                </div>
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
            <div className="tw-space-y-3 tw-pr-0">
              {effectMetadata ? (
                effectMetadata.parameters?.map((param: any) => {
                  const currentValue = selectedLayer.params?.[param.name]?.value ?? param.value;
                  const uiValue = localParamValues[param.name] ?? currentValue;
                  const isLocked = !!lockedParams[param.name];
                  
                  return (
                    <div key={param.name} className="tw-w-full tw-min-w-0 tw-flex tw-flex-col xxl:tw-grid xxl:tw-items-center tw-gap-1 xxl:tw-gap-2" style={{ gridTemplateColumns: '160px 1fr 40px' }}>
                      {/* Label (stacks above on small screens) */}
                      <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-full xxl:tw-w-[160px] xxl:tw-shrink-0">{param.description || param.name}</label>

                      {/* Numeric inline: value, +/- and slider in one row */}
                      {param.type === 'number' && (
                        <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap tw-min-w-0">
                          <div className="tw-flex-1 tw-min-w-0">
                            <ParamRow
                              key={param.name}
                              label={param.description || param.name}
                              value={Number.isFinite(Number(uiValue)) ? Number(uiValue) : (typeof param.min === 'number' ? param.min : 0)}
                              min={param.min || 0}
                              max={param.max || 1}
                              step={param.step || 0.1}
                              buttonsAfter
                              layout="stacked"
                              onChange={(value) => {
                                if (isLocked) return;
                                const v = Number(value);
                                if (!Number.isFinite(v)) return;
                                setLocalParamValues(prev => ({ ...prev, [param.name]: v }));
                                handleEffectParamChange(param.name, v);
                              }}
                              onIncrement={() => {
                                if (isLocked) return;
                                const currentVal = Number(localParamValues[param.name] ?? currentValue);
                                const step = param.step || 0.1;
                                const base = Number.isFinite(currentVal) ? currentVal : (typeof param.min === 'number' ? param.min : 0);
                                const newValue = Math.min(param.max || 1, base + step);
                                setLocalParamValues(prev => ({ ...prev, [param.name]: newValue }));
                                handleEffectParamChange(param.name, newValue);
                              }}
                              onDecrement={() => {
                                if (isLocked) return;
                                const currentVal = Number(localParamValues[param.name] ?? currentValue);
                                const step = param.step || 0.1;
                                const base = Number.isFinite(currentVal) ? currentVal : (typeof param.min === 'number' ? param.min : 0);
                                const newValue = Math.max(param.min || 0, base - step);
                                setLocalParamValues(prev => ({ ...prev, [param.name]: newValue }));
                                handleEffectParamChange(param.name, newValue);
                              }}
                              showLabel={false}
                            />
                          </div>
                          <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xxl:tw-hidden">
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
                      )}

                      {/* Other control types keep compact width */}
                      {param.type === 'color' && (
                        <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                          <input
                            type="color"
                            value={currentValue}
                            onChange={(e) => handleEffectParamChange(param.name, e.target.value)}
                            className="tw-h-8 tw-w-12 tw-rounded tw-bg-transparent tw-border tw-border-neutral-700"
                            disabled={isLocked}
                          />
                          <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xxl:tw-hidden">
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
                      )}
                      {param.type === 'string' && (
                        <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                          <div className="tw-flex-1 tw-min-w-0">
                            <Input
                              value={String(uiValue ?? '')}
                              onChange={(e) => {
                                if (isLocked) return;
                                const v = e.target.value;
                                setLocalParamValues(prev => ({ ...prev, [param.name]: v }));
                                handleEffectParamChange(param.name, v);
                              }}
                            />
                          </div>
                          <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xxl:tw-hidden">
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
                      )}
                      {param.type === 'select' && (
                        <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap tw-min-w-0">
                          <div className="tw-w-full sm:tw-w-auto sm:tw-min-w-[160px] tw-min-w-0">
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
                          <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xxl:tw-hidden">
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
                      )}
                      {param.type === 'boolean' && (
                        <div className="tw-w-full tw-flex tw-items-center tw-gap-2 tw-flex-nowrap">
                          <button
                            type="button"
                            className={`tw-rounded tw-px-4 tw-py-2 tw-font-bold tw-transition-colors tw-min-w-[60px] tw-appearance-none tw-border tw-border-neutral-700 tw-shadow-none tw-outline-none focus:tw-outline-none focus:tw-ring-0 focus:tw-shadow-none ${Boolean(currentValue) ? 'tw-bg-graphite tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-300'} ${isLocked ? 'tw-opacity-50' : ''}`}
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
                          <div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-flex-none tw-w-[40px] tw-justify-end xl:tw-hidden">
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
                      )}

                      {/* Trailing icons column for xxl+ to align across rows */}
                      <div className="tw-hidden xxl:tw-flex tw-items-center tw-gap-1 tw-justify-end">
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
                      <div className="tw-flex tw-flex-col sm:tw-flex-row sm:tw-items-center sm:tw-justify-between tw-gap-1">
                        <label className="tw-text-xs tw-uppercase tw-text-neutral-400">{paramName}</label>
                        <div className="tw-flex tw-items-center tw-gap-1 sm:tw-ml-auto">
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
                      <div className="tw-flex tw-flex-col sm:tw-flex-row sm:tw-items-center tw-gap-2">
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
                                value={[
                                  // During timeline playback, prefer live LFO modulated value if available
                                  (showTimeline && isTimelinePlaying && liveModulatedByParam[paramName] !== undefined)
                                    ? Number(liveModulatedByParam[paramName])
                                    : Number(localParamValues[paramName] ?? (param?.value ?? 0))
                                ]}
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
              <div className="tw-grid tw-grid-cols-2 tw-gap-3 tw-items-end">
                {/* Video Size (Original, Fit, Fill, Stretch) */}
                <div className="tw-col-span-2">
                  <label className="tw-block tw-text-xs tw-uppercase tw-text-neutral-400 tw-mb-1">Video Size</label>
                  <ButtonGroup
                    options={[
                      { value: 'none', label: 'Original' },
                      { value: 'contain', label: 'Fit' },
                      { value: 'cover', label: 'Fill' },
                      { value: 'stretch', label: 'Stretch' },
                      { value: 'tile', label: 'Tile' },
                    ]}
                    value={videoOptions?.fitMode || 'cover'}
                    onChange={(v) => handleFitModeChange(v as 'cover' | 'contain' | 'stretch' | 'none' | 'tile')}
                    columns={5}
                    size="small"
                  />
                </div>
                {/* Render Resolution / Scale as numeric value (0.1 .. 1.0) */}
                <div className="tw-col-span-2 sm:tw-col-span-1">
                  <label className="tw-block tw-text-xs tw-uppercase tw-text-neutral-400 tw-mb-1">Render Resolution</label>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <div className="tw-flex-1 tw-min-w-0">
                      <ParamRow
                        label="Render Resolution"
                        value={Number((videoOptions?.renderScale ?? defaultVideoRenderScale ?? 1))}
                        min={0.1}
                        max={1}
                        step={0.01}
                        buttonsAfter
                        showLabel={false}
                        onChange={(value) => handleRenderScaleChange(Number(value))}
                        onIncrement={() => {
                          if (!selectedLayer) return;
                          const cur = Number((videoOptions?.renderScale ?? defaultVideoRenderScale ?? 1));
                          const next = Math.min(1, Math.round((cur + 0.01) * 100) / 100);
                          handleRenderScaleChange(next);
                        }}
                        onDecrement={() => {
                          if (!selectedLayer) return;
                          const cur = Number((videoOptions?.renderScale ?? defaultVideoRenderScale ?? 1));
                          const next = Math.max(0.1, Math.round((cur - 0.01) * 100) / 100);
                          handleRenderScaleChange(next);
                        }}
                      />
                    </div>
                    <input
                      type="number"
                      step={0.01}
                      min={0.1}
                      max={1}
                      value={Number((videoOptions?.renderScale ?? defaultVideoRenderScale ?? 1)).toFixed(2)}
                      onChange={(e) => handleRenderScaleChange(parseFloat(e.target.value))}
                      className="tw-w-[72px] tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="tw-flex tw-flex-wrap tw-gap-2">
                  <button
                    className={`tw-rounded tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.NONE ? 'tw-bg-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 hover:tw-bg-neutral-700'}`}
                    
                    onClick={() => handleLoopModeChange(LOOP_MODES.NONE)}
                  >
                    None
                  </button>
                  <button
                    className={`tw-rounded tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.LOOP ? 'tw-bg-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 hover:tw-bg-neutral-700'}`}
                    
                    onClick={() => handleLoopModeChange(LOOP_MODES.LOOP)}
                  >
                    Loop
                  </button>
                  <button
                    className={`tw-rounded tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.REVERSE ? 'tw-bg-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 hover:tw-bg-neutral-700'}`}
                    
                    onClick={() => handleLoopModeChange(LOOP_MODES.REVERSE)}
                  >
                    Reverse
                  </button>
                  <button
                    className={`tw-rounded tw-px-2 tw-py-1 tw-text-sm ${loopMode === LOOP_MODES.PING_PONG ? 'tw-bg-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 hover:tw-bg-neutral-700'}`}
                    
                    onClick={() => handleLoopModeChange(LOOP_MODES.PING_PONG)}
                  >
                    Ping-Pong
                  </button>
                </div>
              </div>
              
              <div>
                <label className="tw-text-sm">Play Mode:</label>
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
                  className="tw-rounded tw-bg-neutral-800 tw-text-neutral-100 tw-px-2 tw-py-1 hover:tw-bg-neutral-700 disabled:tw-opacity-50"
                  onClick={() => handleLoopCountChange(Math.max(1, loopCount - 1))}
                  disabled={loopCount <= 1}
                >
                  -
                </button>
                <span className="tw-min-w-[2ch] tw-text-center">{loopCount}</span>
                <button
                  className="tw-rounded tw-bg-neutral-800 tw-text-neutral-100 tw-px-2 tw-py-1 hover:tw-bg-neutral-700"
                  onClick={() => handleLoopCountChange(loopCount + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="tw-space-y-2">
          <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">Description</h4>
          <p className="tw-text-xs tw-text-neutral-400">
            {hasEffect ? (effectMetadata?.description || 'No description available.') : 'Video layer'}
          </p>
        </div>


      </div>
    </div>
  );
}; 