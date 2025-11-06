import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { Button, Input, Label, Select, Switch } from './ui';
import { MIDIManager } from '../midi/MIDIManager';
import { MIDIMapping } from '../store/types';
import { getEffect } from '../utils/effectRegistry';

const useGlobalEffectOptions = (scene: any) => {
  return useMemo(() => {
    const effects = (scene?.globalEffects || []).filter((g: any) => !!g);
    return effects.map((g: any, idx: number) => {
      let label = g.effectId || `Effect ${idx + 1}`;
      try {
        const comp = g.effectId ? getEffect(g.effectId) || getEffect(`${g.effectId}Effect`) : null;
        const md: any = comp ? (comp as any).metadata : null;
        if (md?.name) label = md.name;
      } catch {}
      return { value: g.id, label };
    });
  }, [scene?.globalEffects]);
};

const useGlobalParamOptions = (slot: any) => {
  return useMemo(() => {
    const options: { value: string; label: string }[] = [];
    if (!slot) return options;
    const effectId = slot?.effectId;
    const comp = effectId ? getEffect(effectId) : null;
    const metadata: any = comp ? (comp as any).metadata : null;
    if (metadata?.parameters && Array.isArray(metadata.parameters)) {
      metadata.parameters
        .filter((p: any) => p?.type === 'number')
        .forEach((p: any) => options.push({ value: p.name, label: p.description || p.name }));
      if (options.length > 0) return options;
    }
    // Fallback: look at existing numeric params
    Object.keys(slot?.params || {})
      .filter((k) => typeof (slot?.params?.[k]?.value) === 'number')
      .forEach((k) => options.push({ value: k, label: k }));
    return options;
  }, [slot?.effectId, slot?.params]);
};

const GlobalCCMapper: React.FC = () => {
  const {
    scenes,
    currentSceneId,
    midiMappings,
    setMIDIMappings,
    midiCCOffset,
    setMidiCCOffset,
    midiAutoDetectOffset,
    midiAutoDetectOffsetPrimed,
    setMidiAutoDetectOffset,
  } = useStore() as any;
  const scene = useMemo(() => (scenes || []).find((s: any) => s.id === currentSceneId), [scenes, currentSceneId]);
  const globalOptions = useGlobalEffectOptions(scene);

  const [selectedGlobalId, setSelectedGlobalId] = useState<string>(globalOptions[0]?.value || '');
  useEffect(() => { if (globalOptions.length > 0 && !selectedGlobalId) setSelectedGlobalId(globalOptions[0].value); }, [globalOptions, selectedGlobalId]);
  const slot = useMemo(() => (scene?.globalEffects || []).find((g: any) => g?.id === selectedGlobalId), [scene?.globalEffects, selectedGlobalId]);

  const paramOptions = useGlobalParamOptions(slot);
  const [param, setParam] = useState<string>('');
  useEffect(() => { if (!param && paramOptions.length > 0) setParam(paramOptions[0].value); }, [paramOptions, param]);

  const [channel, setChannel] = useState<number>(1);
  const [ccNumber, setCcNumber] = useState<number>(1);
  const [learn, setLearn] = useState<boolean>(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [autoOnSelect, setAutoOnSelect] = useState<boolean>(() => {
    try { const v = localStorage.getItem('vj-auto-map-global-on-select'); return v === null ? true : v === '1'; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('vj-auto-map-global-on-select', autoOnSelect ? '1' : '0'); } catch {} }, [autoOnSelect]);
  const mappings = (midiMappings as MIDIMapping[]) || [];

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

  const addMapping = () => {
    if (!slot || !param) return;
    const next: MIDIMapping = {
      type: 'cc',
      channel: Math.max(1, Math.min(16, Number(channel) || 1)),
      number: Math.max(0, Math.min(127, Number(ccNumber) || 0)),
      enabled: true,
      target: { type: 'global-effect', id: slot.id, param } as any,
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

  const layerMappings = (mappings || []).map((m, i) => ({ m, i }))
    .filter(({ m }) => m.type === 'cc' && (m.target as any)?.type === 'global-effect' && (m.target as any)?.id === slot?.id);

  // Also compute mappings for other filled slots so the user can see them at a glance
  const otherGlobalMappings = useMemo(() => {
    const result: Array<{ label: string; items: Array<{ m: MIDIMapping; i: number }> }> = [];
    try {
      const slots = (scene?.globalEffects || []).filter((g: any) => !!g);
      slots.forEach((s: any, idx: number) => {
        if (!s || s.id === slot?.id) return;
        const items = (mappings || [])
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.type === 'cc' && (m.target as any)?.type === 'global-effect' && (m.target as any)?.id === s.id);
        if (items.length > 0) {
          let label = s.effectId || `Effect ${idx + 1}`;
          try {
            const comp = s.effectId ? getEffect(s.effectId) || getEffect(`${s.effectId}Effect`) : null;
            const md: any = comp ? (comp as any).metadata : null;
            if (md?.name) label = md.name;
          } catch {}
          result.push({ label, items });
        }
      });
    } catch {}
    return result;
  }, [scene?.globalEffects, mappings, slot?.id]);

  const removeMappingAt = (idx: number) => {
    const next = (mappings || []).filter((_, i) => i !== idx);
    setMIDIMappings(next);
  };

  const ccOffsetValue = Math.max(0, Math.min(127, Number(midiCCOffset) || 0));
  const ccOffsetActive = ccOffsetValue > 0;

  // Auto-map knob CC range (inclusive) for global effects
  const [autoMapStart, setAutoMapStart] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('vj-auto-map-global-start') || '1', 10); return Math.max(1, Math.min(127, Number.isFinite(v) ? v : 1)); } catch { return 1; }
  });
  const [autoMapEnd, setAutoMapEnd] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('vj-auto-map-global-end') || '16', 10); return Math.max(1, Math.min(127, Number.isFinite(v) ? v : 16)); } catch { return 16; }
  });
  useEffect(() => { try { localStorage.setItem('vj-auto-map-global-start', String(Math.max(1, Math.min(127, Number(autoMapStart) || 1)))); } catch {} }, [autoMapStart]);
  useEffect(() => { try { localStorage.setItem('vj-auto-map-global-end', String(Math.max(1, Math.min(127, Number(autoMapEnd) || 16)))); } catch {} }, [autoMapEnd]);

  const autoMapAll = () => {
    const filledSlots = (scene?.globalEffects || []).filter((g: any) => !!g);
    if (!filledSlots || filledSlots.length === 0) return;
    const start = Math.max(1, Math.min(127, Number(autoMapStart) || 1));
    const end = Math.max(start, Math.min(127, Number(autoMapEnd) || start));
    const count = end - start + 1;
    const ch = Math.max(1, Math.min(16, Number(channel) || 1));

    // Remove existing mappings for all filled global effect slots to avoid duplicates
    const removeForIds = new Set(filledSlots.map((s: any) => s.id));
    const base = (mappings || []).filter((m) => !(m && m.type === 'cc' && (m as any)?.target?.type === 'global-effect' && removeForIds.has((m as any)?.target?.id)));
    const next = base.slice();

    // Helper to get numeric param names for a slot (metadata-first fallback)
    const getParamNames = (s: any): string[] => {
      const names: string[] = [];
      try {
        const comp = s?.effectId ? getEffect(s.effectId) || getEffect(`${s.effectId}Effect`) : null;
        const md: any = comp ? (comp as any).metadata : null;
        if (md?.parameters && Array.isArray(md.parameters)) {
          md.parameters.filter((p: any) => p?.type === 'number').forEach((p: any) => names.push(p.name));
        }
        if (names.length === 0) {
          Object.keys(s?.params || {}).forEach((k) => {
            const v = s?.params?.[k];
            const num = typeof v === 'number' ? v : (v && typeof v.value === 'number' ? v.value : undefined);
            if (typeof num === 'number' && isFinite(num)) names.push(k);
          });
        }
      } catch {}
      return names;
    };

    let ccCursor = start;
    filledSlots.forEach((s: any) => {
      if (ccCursor > end) return; // range exhausted
      const names = getParamNames(s);
      for (let i = 0; i < names.length && ccCursor <= end; i += 1) {
        const pname = names[i];
        const ccNum = Math.max(0, Math.min(127, ccCursor));
        next.push({ type: 'cc', channel: ch, number: ccNum, enabled: true, target: { type: 'global-effect', id: s.id, param: pname } as any } as MIDIMapping);
        ccCursor += 1;
      }
    });

    setMIDIMappings(next);
  };

  const prevSlotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOnSelect) return;
    if (!selectedGlobalId) return;
    if (prevSlotRef.current === selectedGlobalId) return;
    prevSlotRef.current = selectedGlobalId;
    autoMapAll();
  }, [selectedGlobalId, autoOnSelect]);

  return (
    <div className="tw-flex tw-flex-col tw-gap-3 tw-text-neutral-200">
      {!scene ? (
        <div className="tw-text-sm tw-text-neutral-400">No scene loaded.</div>
      ) : (
        <>
          <div className="tw-grid tw-grid-cols-2 tw-gap-2">
            <div className="tw-space-y-1">
              <Label className="tw-text-xs">Global Effect</Label>
              <Select value={selectedGlobalId} onChange={(v) => setSelectedGlobalId(String(v))} options={globalOptions} />
            </div>
            <div className="tw-space-y-1">
              <Label className="tw-text-xs">Parameter</Label>
              <Select value={param} onChange={(v) => setParam(String(v))} options={paramOptions} />
            </div>
            <div className="tw-space-y-1">
              <Label className="tw-text-xs">MIDI Channel</Label>
              <Select value={String(channel)} onChange={(v) => setChannel(Number(v))} options={Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1) }))} />
            </div>
            <div className="tw-space-y-1">
              <Label className="tw-text-xs">CC Number</Label>
              <Input value={ccNumber} onChange={(e) => setCcNumber(Math.max(0, Math.min(127, Number(e.target.value) || 0)))} />
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
            <div className="tw-col-span-2 tw-flex tw-flex-wrap tw-items-end tw-gap-2">
              <Button variant="secondary" onClick={() => setLearn((v) => !v)}>{learn ? 'Listening…' : 'Learn CC'}</Button>
              <Button onClick={addMapping} disabled={!param || !selectedGlobalId}>{editIndex !== null ? 'Save Mapping' : 'Add Mapping'}</Button>
              <Button variant="secondary" onClick={autoMapAll} disabled={paramOptions.length === 0}>Auto Map</Button>
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
            <div className="tw-text-sm tw-text-neutral-300">Current CC Mappings for this Global Effect</div>
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
                        <Button variant="secondary" onClick={() => { try { setEditIndex(i); setParam(String((m.target as any)?.param || '')); setChannel(Math.max(1, Math.min(16, Number(m.channel) || 1))); setCcNumber(Math.max(0, Math.min(127, Number(m.number) || 0))); setSelectedGlobalId(String((m.target as any)?.id || selectedGlobalId)); } catch {} }}>Edit</Button>
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
            {otherGlobalMappings.length > 0 && (
              <div className="tw-mt-3 tw-space-y-1">
                <div className="tw-border tw-border-neutral-800 tw-rounded-md tw-bg-neutral-900">
                  {otherGlobalMappings.map((grp, gi) => (
                    <div key={gi} className="tw-border-b tw-border-neutral-800 last:tw-border-b-0">
                      {grp.items.map(({ m, i }) => {
                        const normalizedCC = Math.max(0, Math.min(127, Number(m.number) || 0));
                        const physicalCC = ccOffsetActive
                          ? Math.max(0, Math.min(127, ccOffsetValue + normalizedCC))
                          : normalizedCC;
                        const ccLabel = ccOffsetActive
                          ? `CC ${physicalCC} → CC ${normalizedCC}`
                          : `CC ${normalizedCC}`;
                        return (
                          <div key={i} className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-px-2 tw-py-1 tw-border-t tw-border-neutral-800 first:tw-border-t-0">
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
                              <Button variant="secondary" onClick={() => { try { setEditIndex(i); setParam(String((m.target as any)?.param || '')); setChannel(Math.max(1, Math.min(16, Number(m.channel) || 1))); setCcNumber(Math.max(0, Math.min(127, Number(m.number) || 0))); setSelectedGlobalId(String((m.target as any)?.id || selectedGlobalId)); } catch {} }}>Edit</Button>
                              {editIndex === i && (
                                <Button variant="ghost" onClick={() => { setEditIndex(null); }}>Cancel</Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => removeMappingAt(i)}>×</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default GlobalCCMapper;


