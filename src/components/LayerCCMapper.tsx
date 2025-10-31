import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { Button, Input, Label, Select, Switch } from './ui';
import { MIDIManager } from '../midi/MIDIManager';
import { MIDIMapping } from '../store/types';
import { getEffect } from '../utils/effectRegistry';

// Build parameter options for the currently selected layer (numeric sliders only)
const useLayerParamOptions = (selectedLayer: any) => {
  return useMemo(() => {
    const options: { value: string; label: string }[] = [];
    if (!selectedLayer) return options;

    const isEffect = selectedLayer?.type === 'effect' || selectedLayer?.asset?.isEffect;
    const effectId: string | undefined = selectedLayer?.asset?.id || selectedLayer?.asset?.name || selectedLayer?.asset?.effectId;
    if (isEffect && effectId) {
      const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
      const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
      if (metadata?.parameters && Array.isArray(metadata.parameters)) {
        metadata.parameters
          .filter((p: any) => p?.type === 'number')
          .forEach((p: any) => {
            const label = p.description || p.name;
            options.push({ value: p.name, label });
          });
        return options;
      }
    }

    // Fallback to existing numeric params in layer.params
    Object.keys(selectedLayer.params || {})
      .filter((k) => typeof (selectedLayer.params?.[k]?.value) === 'number')
      .forEach((k) => options.push({ value: k, label: k }));
    return options;
  }, [selectedLayer]);
};

export const LayerCCMapper: React.FC = () => {
  const {
    midiMappings,
    setMIDIMappings,
    selectedLayerId,
    scenes,
    currentSceneId,
    timelineScenes,
    currentTimelineSceneId,
    showTimeline,
    midiCCOffset,
    setMidiCCOffset,
    midiAutoDetectOffset,
    midiAutoDetectOffsetPrimed,
    setMidiAutoDetectOffset,
    selectedTimelineClip,
  } = useStore() as any;
  const mappings = (midiMappings as MIDIMapping[]) || [];
  const timelineClipLayerId = useMemo(() => {
    if (!showTimeline || !selectedTimelineClip) return null;
    const clipId = selectedTimelineClip.id || 'clip';
    return selectedTimelineClip.layerId || `timeline-layer-${clipId}`;
  }, [showTimeline, selectedTimelineClip?.id, selectedTimelineClip?.layerId]);
  const selectedLayer = useMemo(() => {
    const sceneList = showTimeline ? timelineScenes : scenes;
    const sceneId = showTimeline ? currentTimelineSceneId : currentSceneId;
    const scene = (sceneList || []).find((s: any) => s.id === sceneId);
    if (!scene) return null;

    // If a timeline clip is selected, resolve to a real layer in the current scene
    const activeTimelineClip = showTimeline ? selectedTimelineClip : null;
    if (activeTimelineClip) {
      const allLayers = scene.columns.flatMap((c: any) => c.layers);
      // Prefer explicit layerId on the clip
      if (activeTimelineClip.layerId) {
        const byId = allLayers.find((l: any) => l.id === activeTimelineClip.layerId);
        if (byId) return byId;
      }
      // Match by asset id/name
      const assetId = activeTimelineClip?.data?.asset?.id || activeTimelineClip?.data?.asset?.name || activeTimelineClip?.data?.name;
      const isVideo = activeTimelineClip?.data?.type === 'video' || activeTimelineClip?.data?.asset?.type === 'video';
      const byAsset = isVideo
        ? allLayers.find((l: any) => l?.asset?.type === 'video' && (l?.asset?.id === assetId || l?.asset?.name === assetId))
        : allLayers.find((l: any) => (l?.asset?.isEffect || l?.type === 'effect') && (l?.asset?.id === assetId || l?.asset?.name === assetId));
      if (byAsset) return byAsset;
      // Deterministic: track number maps to same-numbered layer if present
      const trackNum = parseInt((activeTimelineClip.trackId || 'track-1').split('-')[1] || '1', 10);
      const byTrack = allLayers.find((l: any) => l.layerNum === trackNum);
      if (byTrack) return byTrack;
      // Fallback: any effect layer
      const anyEffect = allLayers.find((l: any) => l?.asset?.isEffect || l?.type === 'effect');
      if (anyEffect) return anyEffect;
      return null;
    }

    // Column mode selection
    for (const col of scene.columns || []) {
      const layer = (col.layers || []).find((l: any) => l.id === selectedLayerId);
      if (layer) return layer;
    }
    return null;
  }, [
    scenes,
    timelineScenes,
    showTimeline,
    currentSceneId,
    currentTimelineSceneId,
    selectedLayerId,
    selectedTimelineClip?.id,
    selectedTimelineClip?.trackId,
    selectedTimelineClip?.layerId,
    selectedTimelineClip?.data?.asset?.id,
    selectedTimelineClip?.data?.params,
    selectedTimelineClip?.data?.asset?.effectId,
    selectedTimelineClip?.data?.name,
  ]);

  const timelineFallbackLayer = useMemo(() => {
    if (!showTimeline) return null;
    if (selectedLayer) return null;
    if (!selectedTimelineClip) return null;
    const clip: any = selectedTimelineClip.data || {};
    const asset = clip.asset || {};
    const trackNumber = parseInt((selectedTimelineClip.trackId || 'track-1').split('-')[1] || '1', 10);
    const fallbackId = timelineClipLayerId || `timeline-layer-${selectedTimelineClip.id || 'clip'}`;
    return {
      id: fallbackId,
      name: clip.name || asset.name || `Layer ${trackNumber}`,
      layerNum: trackNumber,
      type: clip.type === 'effect' || asset.isEffect ? 'effect' : (asset.type === 'video' ? 'video' : 'effect'),
      asset,
      params: clip.params || {},
      opacity: 1,
      blendMode: 'add',
    } as any;
  }, [showTimeline, selectedLayer, selectedTimelineClip?.id, selectedTimelineClip?.layerId, selectedTimelineClip?.trackId, selectedTimelineClip?.data, timelineClipLayerId]);

  const effectiveLayer = selectedLayer || timelineFallbackLayer;
  const resolvedLayerId = selectedLayer?.id || (showTimeline ? timelineClipLayerId : null);

  let paramOptions = useLayerParamOptions(effectiveLayer);
  try {
    // In timeline mode, prefer the clip's parameter keys to mirror the Layer panel
    const clipParams = (showTimeline && selectedTimelineClip && (selectedTimelineClip.data?.params || selectedTimelineClip.params)) || null;
    if (clipParams && typeof clipParams === 'object') {
      const opts: { value: string; label: string }[] = [];
      Object.keys(clipParams).forEach((k) => {
        const v = (clipParams as any)[k];
        const num = typeof v === 'number' ? v : (v && typeof v.value === 'number' ? v.value : undefined);
        if (typeof num === 'number' && isFinite(num)) {
          opts.push({ value: k, label: k });
        }
      });
      if (opts.length > 0) {
        paramOptions = opts;
      }
    }
  } catch {}
  const [param, setParam] = useState<string>('');
  const [channel, setChannel] = useState<number>(1);
  const [ccNumber, setCcNumber] = useState<number>(1);
  const [learn, setLearn] = useState<boolean>(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // Auto-map helpers

  // Auto-map knob range (inclusive): start..end, persisted
  const [autoMapStart, setAutoMapStart] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('vj-auto-map-start') || '1', 10); return Math.max(1, Math.min(127, Number.isFinite(v) ? v : 1)); } catch { return 1; }
  });
  const [autoMapEnd, setAutoMapEnd] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('vj-auto-map-end') || '16', 10); return Math.max(1, Math.min(127, Number.isFinite(v) ? v : 16)); } catch { return 16; }
  });
  useEffect(() => { try { localStorage.setItem('vj-auto-map-start', String(Math.max(1, Math.min(127, Number(autoMapStart) || 1)))); } catch {} }, [autoMapStart]);
  useEffect(() => { try { localStorage.setItem('vj-auto-map-end', String(Math.max(1, Math.min(127, Number(autoMapEnd) || 16)))); } catch {} }, [autoMapEnd]);

  const autoMapAll = () => {
    if (!effectiveLayer || !resolvedLayerId) return;
    const start = Math.max(1, Math.min(127, Number(autoMapStart) || 1));
    const end = Math.max(start, Math.min(127, Number(autoMapEnd) || start));
    const count = end - start + 1;
    const numericParams = paramOptions.map((o) => o.value).slice(0, count);
    if (numericParams.length === 0) return;
    const ch = Math.max(1, Math.min(16, Number(channel) || 1));
    // Remove existing mappings for this layer so we end up with exactly `count`
    const base = (mappings || []).filter((m) => !(m && m.type === 'cc' && (m as any)?.target?.type === 'layer' && (m as any)?.target?.id === resolvedLayerId));
    const next = base.slice();
    numericParams.forEach((pname, idx) => {
      const ccNum = Math.max(0, Math.min(127, start + idx));
      const mapped: MIDIMapping = {
        type: 'cc',
        channel: ch,
        number: ccNum,
        enabled: true,
        target: { type: 'layer', id: resolvedLayerId, param: pname } as any,
      };
      next.push(mapped);
    });
    setMIDIMappings(next);
  };

  // Blue Hand-style: auto map when layer selection changes
  const [autoOnSelect, setAutoOnSelect] = useState<boolean>(() => {
    try { const v = localStorage.getItem('vj-auto-map-on-select'); return v === null ? true : v === '1'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('vj-auto-map-on-select', autoOnSelect ? '1' : '0'); } catch {}
  }, [autoOnSelect]);
  const prevLayerIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = selectedLayer?.id || null;
    const prevId = prevLayerIdRef.current;
    prevLayerIdRef.current = currentId;
    if (!autoOnSelect) return;
    if (!currentId) return;
    if (prevId === currentId) return;
    // Run automap when layer changes (map all params)
    autoMapAll();
  }, [selectedLayer?.id, autoOnSelect, selectedTimelineClip?.id]);

  useEffect(() => {
    if (!learn) return;
    let cleanup = () => {};
    try {
      const mgr = MIDIManager.getInstance();
      const onCC = (c: number, v: number, ch: number) => {
        setCcNumber(Math.max(0, Math.min(127, Number(c) || 0)));
        setChannel(Math.max(1, Math.min(16, Number(ch) || 1)));
        setLearn(false);
      };
      mgr.addCCCallback(onCC);
      cleanup = () => { try { mgr.removeCCCallback(onCC); } catch {} };
    } catch {}
    return cleanup;
  }, [learn]);

  useEffect(() => {
    if (!param && paramOptions.length > 0) setParam(paramOptions[0].value);
  }, [paramOptions, param]);

  const addMapping = () => {
    if (!effectiveLayer || !param || !resolvedLayerId) return;
    const next: MIDIMapping = {
      type: 'cc',
      channel: Math.max(1, Math.min(16, Number(channel) || 1)),
      number: Math.max(0, Math.min(127, Number(ccNumber) || 0)),
      enabled: true,
      target: {
        type: 'layer',
        id: resolvedLayerId,
        param,
      } as any,
    };
    if (editIndex !== null) {
      const copy = (mappings || []).slice();
      copy[editIndex] = next;
      setMIDIMappings(copy);
      setEditIndex(null);
    } else {
      setMIDIMappings([...(mappings || []), next]);
    }
  };

  const removeMappingAt = (idx: number) => {
    const next = (mappings || []).filter((_, i) => i !== idx);
    setMIDIMappings(next);
  };

  const layerMappings = (mappings || []).map((m, i) => ({ m, i }))
    .filter(({ m }) => m.type === 'cc' && (m.target as any)?.type === 'layer' && (m.target as any)?.id === resolvedLayerId);

  const ccOffsetValue = Math.max(0, Math.min(127, Number(midiCCOffset) || 0));
  const ccOffsetActive = ccOffsetValue > 0;

  return (
    <div className="tw-flex tw-flex-col tw-gap-3 tw-text-neutral-200">
      {!effectiveLayer || !resolvedLayerId ? (
        <div className="tw-text-sm tw-text-neutral-400">
          {showTimeline
            ? 'Select a clip linked to a layer to map its sliders to MIDI CC.'
            : 'Select a layer to map its sliders to MIDI CC.'}
        </div>
      ) : (
        <>
          <div className="tw-grid tw-grid-cols-2 tw-gap-2">
            <div className="tw-space-y-1">
              <Label className="tw-text-xs">Parameter</Label>
              <Select value={param} onChange={(v) => setParam(String(v))} options={paramOptions} />
            </div>
            <div className="tw-space-y-1">
              <Label className="tw-text-xs">MIDI Channel</Label>
              <Select value={String(channel)} onChange={(v) => setChannel(Number(v))} options={Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1) }))} />
            </div>
            <div className="tw-space-y-1">
              <div className="tw-flex tw-items-center tw-justify-between">
                <Label className="tw-text-xs">CC Offset</Label>
                <label className="tw-flex tw-items-center tw-gap-1 tw-text-xs">
                  <Switch
                    checked={!!midiAutoDetectOffset}
                    onCheckedChange={(v: boolean) => {
                      try {
                        setMidiAutoDetectOffset(!!v);
                      } catch {}
                    }}
                  />
                  Auto detect
                </label>
              </div>
              <Input
                value={midiCCOffset ?? 0}
                onChange={(e) => {
                  try {
                    setMidiCCOffset(Math.max(0, Math.min(127, Number(e.target.value) || 0)));
                  } catch {}
                }}
                disabled={!!midiAutoDetectOffset}
              />
              {midiAutoDetectOffset && (
                <div className="tw-text-xs tw-text-neutral-400">
                  {midiAutoDetectOffsetPrimed
                    ? 'Move any knob to learn the offset.'
                    : `Learned from CC ${Math.max(1, (Number(midiCCOffset) || 0) + 1)}.`}
                </div>
              )}
            </div>
            <div className="tw-space-y-1">
              <Label className="tw-text-xs">CC Number</Label>
              <Input value={ccNumber} onChange={(e) => setCcNumber(Math.max(0, Math.min(127, Number(e.target.value) || 0)))} />
            </div>
            <div className="tw-flex tw-flex-wrap tw-items-end tw-gap-2">
              <Button variant="secondary" onClick={() => setLearn((v) => !v)}>{learn ? 'Listening…' : 'Learn CC'}</Button>
              <Button onClick={addMapping} disabled={!param || !resolvedLayerId}>{editIndex !== null ? 'Save Mapping' : 'Add Mapping'}</Button>
              <Button variant="secondary" onClick={autoMapAll} disabled={paramOptions.length === 0 || !resolvedLayerId}>Auto Map</Button>
              <label className="tw-flex tw-items-center tw-gap-2 tw-text-xs tw-ml-2">
                <Switch checked={autoOnSelect} onCheckedChange={(v: boolean) => setAutoOnSelect(!!v)} />
                Auto Map on select
              </label>
              <div className="tw-basis-full tw-flex tw-items-end tw-gap-2">
                <Label className="tw-text-xs">Knobs</Label>
                <div className="tw-flex tw-items-center tw-gap-1">
                  <Input type="number" className="tw-w-14" value={autoMapStart} onChange={(e) => setAutoMapStart(Math.max(1, Math.min(127, Number(e.target.value) || 1)))} />
                  <span className="tw-text-neutral-400">-</span>
                  <Input type="number" className="tw-w-14" value={autoMapEnd} onChange={(e) => setAutoMapEnd(Math.max(1, Math.min(127, Number(e.target.value) || 1)))} />
                </div>
              </div>
            </div>
          </div>

          <div className="tw-mt-2 tw-space-y-1">
            <div className="tw-text-sm tw-text-neutral-300">Current CC Mappings for this Layer</div>
            <div className="tw-border tw-border-neutral-800 tw-rounded-md tw-bg-neutral-900">
              {layerMappings.length === 0 ? (
                <div className="tw-text-xs tw-text-neutral-500 tw-px-2 tw-py-2">None yet.</div>
              ) : (
                layerMappings.map(({ m, i }) => {
                  const normalizedCC = Math.max(0, Math.min(127, Number(m.number) || 0));
                  const physicalCC = ccOffsetActive
                    ? Math.max(0, Math.min(127, ccOffsetValue + normalizedCC))
                    : normalizedCC;
                  const ccLabel = ccOffsetActive
                    ? `CC ${physicalCC} → CC ${normalizedCC}`
                    : `CC ${normalizedCC}`;
                  return (
                    <div key={i} className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800 last:tw-border-b-0">
                      <div className="tw-text-xs tw-text-neutral-300">ch {m.channel} • {ccLabel} → {(m.target as any)?.param}</div>
                      <div className="tw-flex tw-items-center tw-gap-2">
                        <label className="tw-flex tw-items-center tw-gap-1 tw-text-xs">
                          <Switch checked={!!m.enabled} onCheckedChange={(v: boolean) => {
                            const next = (mappings || []).slice();
                            (next[i] as any).enabled = !!v;
                            setMIDIMappings(next);
                          }} />
                          Enabled
                        </label>
                        <Button variant="secondary" onClick={() => {
                          // Load into form for editing
                          try {
                            setEditIndex(i);
                            setParam(String((m.target as any)?.param || ''));
                            setChannel(Math.max(1, Math.min(16, Number(m.channel) || 1)));
                            setCcNumber(Math.max(0, Math.min(127, Number(m.number) || 0)));
                          } catch {}
                        }}>Edit</Button>
                        {editIndex === i && (
                          <Button variant="ghost" onClick={() => { setEditIndex(null); }}>Cancel</Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => removeMappingAt(i)}>×</Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LayerCCMapper;



