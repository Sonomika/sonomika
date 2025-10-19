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
  const { scenes, currentSceneId, midiMappings, setMIDIMappings, midiCCOffset, setMidiCCOffset } = useStore() as any;
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

  const removeMappingAt = (idx: number) => {
    const next = (mappings || []).filter((_, i) => i !== idx);
    setMIDIMappings(next);
  };

  const [autoMapCount, setAutoMapCount] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('vj-auto-map-global-count') || '16', 10); return Math.max(1, Math.min(127, Number.isFinite(v) ? v : 16)); } catch { return 16; }
  });
  useEffect(() => { try { localStorage.setItem('vj-auto-map-global-count', String(Math.max(1, Math.min(127, Number(autoMapCount) || 16)))); } catch {} }, [autoMapCount]);

  const autoMapAll = () => {
    if (!slot) return;
    const count = Math.max(1, Math.min(127, Number(autoMapCount) || 8));
    const params = paramOptions.map((o) => o.value).slice(0, count);
    if (params.length === 0) return;
    const ch = Math.max(1, Math.min(16, Number(channel) || 1));
    // Remove existing mappings for this global effect so result size matches `count`
    const base = (mappings || []).filter((m) => !(m && m.type === 'cc' && (m as any)?.target?.type === 'global-effect' && (m as any)?.target?.id === slot.id));
    const next = base.slice();
    params.forEach((pname, idx) => {
      const ccNum = Math.max(0, Math.min(127, 1 + idx));
      const mapped: MIDIMapping = { type: 'cc', channel: ch, number: ccNum, enabled: true, target: { type: 'global-effect', id: slot.id, param: pname } as any };
      next.push(mapped);
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
              <Label className="tw-text-xs">CC Offset</Label>
              <Input value={midiCCOffset ?? 0} onChange={(e) => { try { setMidiCCOffset(Math.max(0, Math.min(127, Number(e.target.value) || 0))); } catch {} }} />
            </div>
            <div className="tw-flex tw-items-end tw-gap-2">
              <Button variant="secondary" onClick={() => setLearn((v) => !v)}>{learn ? 'Listening…' : 'Learn CC'}</Button>
              <Button onClick={addMapping} disabled={!param || !selectedGlobalId}>{editIndex !== null ? 'Save Mapping' : 'Add Mapping'}</Button>
              <Button variant="secondary" onClick={autoMapAll} disabled={paramOptions.length === 0}>Auto Map</Button>
              <label className="tw-flex tw-items-center tw-gap-2 tw-text-xs tw-ml-2">
                <Switch checked={autoOnSelect} onCheckedChange={(v: boolean) => setAutoOnSelect(!!v)} />
                Auto Map on select
              </label>
              <div className="tw-flex tw-items-end tw-gap-1">
                <Label className="tw-text-xs">Knobs</Label>
                <div className="tw-flex tw-items-center tw-gap-1">
                  <Button variant="secondary" size="icon" onClick={() => setAutoMapCount((c) => Math.max(1, (Number(c) || 1) - 1))}>-</Button>
                  <Input type="number" className="tw-w-14" value={autoMapCount} onChange={(e) => setAutoMapCount(Math.max(1, Math.min(127, Number(e.target.value) || 1)))} />
                  <Button variant="secondary" size="icon" onClick={() => setAutoMapCount((c) => Math.max(1, Math.min(127, (Number(c) || 1) + 1)))}>+</Button>
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
                layerMappings.map(({ m, i }) => (
                  <div key={i} className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800 last:tw-border-b-0">
                    <div className="tw-text-xs tw-text-neutral-300">ch {m.channel} • CC {m.number} → {(m.target as any)?.param}</div>
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
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GlobalCCMapper;


