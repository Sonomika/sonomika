import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { Button, Input, Label, Select, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui';
import { MIDIManager } from '../midi/MIDIManager';
import { MIDIProcessor } from '../utils/MIDIProcessor';
import { MIDIMapping } from '../store/types';
import { KeyboardInputManager } from '../utils/KeyboardInputManager';

interface MIDIDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
}

export const MIDIMapper: React.FC = () => {
  const { midiMappings, setMIDIMappings } = useStore() as any;
  const [selectedDevice, setSelectedDevice] = useState<string>('Any device');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const mappings = midiMappings as MIDIMapping[];
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('midi-mapping');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [monitorEnabled, setMonitorEnabled] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [lastEvent, setLastEvent] = useState<{ type: 'note' | 'cc'; channel: number; number: number; value: number; ts: number } | null>(null);

  const [devices] = useState<MIDIDevice[]>([
    { id: 'loopmidi', name: 'Loopmidi', type: 'input' },
    { id: 'midi-keyboard', name: 'MIDI Keyboard', type: 'input' },
    { id: 'virtual-midi', name: 'Virtual MIDI', type: 'input' }
  ]);

  const inputTypeOptions = [
    { value: 'note', label: 'Note' },
    { value: 'cc', label: 'CC' },
    { value: 'key', label: 'Key' }
  ];

  const actionTypeOptions = [
    { value: 'column', label: 'Trigger Column' },
    { value: 'transport', label: 'Transport' },
    { value: 'scene', label: 'Switch Scene' },
  ];

  // Removed Ableton-style presets; mappings can still be added/edited manually

  const inputOptions = [
    'Any device',
    'Loopmidi',
    'MIDI Keyboard',
    'Virtual MIDI'
  ];

  const outputOptions = [
    'All devices',
    'Loopmidi',
    'MIDI Keyboard',
    'Virtual MIDI'
  ];

  const noteOptions = [
    'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
    'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3'
  ];

  const velocityOptions = [
    '0 - Off',
    '1-127 - Full Range',
    '1-64 - Half Range',
    '64-127 - Upper Half'
  ];

  // Ensure MIDI/Keyboard listeners route to processor
  useEffect(() => {
    try {
      const mgr = MIDIManager.getInstance();
      const proc = MIDIProcessor.getInstance();
      proc.setMappings(mappings || []);
      const onNote = (n: number, v: number, ch: number) => proc.handleNoteMessage(n, v, ch);
      const onCC = (c: number, v: number, ch: number) => proc.handleCCMessage(c, v, ch);
      mgr.addNoteCallback(onNote);
      mgr.addCCCallback(onCC);

      const keyMgr = KeyboardInputManager.getInstance();
      const onKey = (k: string, mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }) => proc.handleKeyMessage(k, mods);
      keyMgr.addKeyCallback(onKey);
      return () => {
        try { mgr.removeNoteCallback(onNote); } catch {}
        try { mgr.removeCCCallback(onCC); } catch {}
        try { keyMgr.removeKeyCallback(onKey); } catch {}
      };
    } catch {}
  }, [mappings]);

  // Lightweight input monitor (MIDI + Key)
  useEffect(() => {
    if (!monitorEnabled) return;
    try {
      const mgr = MIDIManager.getInstance();
      const keyMgr = KeyboardInputManager.getInstance();
      const onNote = (n: number, v: number, ch: number) => {
        const ts = Date.now();
        setLastEventAt(ts);
        setLastEvent({ type: 'note', channel: ch, number: n, value: v, ts });
      };
      const onCC = (c: number, v: number, ch: number) => {
        const ts = Date.now();
        setLastEventAt(ts);
        setLastEvent({ type: 'cc', channel: ch, number: c, value: v, ts });
      };
      const onKey = (k: string, mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }) => {
        const ts = Date.now();
        setLastEventAt(ts);
        // overload fields: channel as 0, value 1; show key in number via NaN sentinel
        setLastEvent({ type: 'cc', channel: 0, number: -1, value: 1, ts });
      };
      mgr.addNoteCallback(onNote);
      mgr.addCCCallback(onCC);
      keyMgr.addKeyCallback(onKey);
      return () => {
        try { mgr.removeNoteCallback(onNote); } catch {}
        try { mgr.removeCCCallback(onCC); } catch {}
        try { keyMgr.removeKeyCallback(onKey); } catch {}
      };
    } catch {}
  }, [monitorEnabled]);

  const selectedMapping = mappings?.[selectedIndex] as MIDIMapping | undefined;

  // Clamp selected index when mappings change (e.g., after delete)
  useEffect(() => {
    const len = (mappings || []).length;
    if (selectedIndex > 0 && selectedIndex >= len) {
      setSelectedIndex(Math.max(0, len - 1));
    }
  }, [mappings, selectedIndex]);

  const handleMappingSelect = (idx: number) => {
    setSelectedIndex(idx);
  };

  const updateMappings = (next: MIDIMapping[]) => {
    setMIDIMappings(next);
  };

  const updateSelected = (mutate: (m: MIDIMapping) => MIDIMapping) => {
    if (!selectedMapping) return;
    const next = mappings.map((m, i) => (i === selectedIndex ? mutate(m) : m));
    updateMappings(next);
  };

  const getNoteChannelDisplay = (mapping: MIDIMapping) => {
    if (mapping.type === 'key') {
      const parts: string[] = [];
      if (mapping.ctrl) parts.push('Ctrl');
      if (mapping.shift) parts.push('Shift');
      if (mapping.alt) parts.push('Alt');
      if (mapping.meta) parts.push('Meta');
      parts.push(mapping.key || '?');
      return parts.join('+');
    }
    return `${mapping.channel}/${mapping.number}`;
  };

  // No forced default mapping; allow empty list

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-text-neutral-200">
      <div className="tw-p-2 tw-border-b tw-border-neutral-800 tw-bg-neutral-900">
        <div className="tw-flex tw-flex-col tw-gap-2">
          <div className="tw-min-w-[160px]">
            <Select value={selectedDevice} onChange={(v) => setSelectedDevice(v as string)} options={devices.map(d => ({ value: d.name }))} />
          </div>
          <div className="tw-flex tw-gap-2 tw-flex-wrap">
            <Button variant="secondary" onClick={() => updateMappings([...(mappings || []), { type: 'note', channel: 1, number: 60, target: { type: 'transport', action: 'play' } }])}>Add</Button>
            <Button variant="secondary" onClick={() => {
              if (!selectedMapping) return;
              const clone = JSON.parse(JSON.stringify(selectedMapping)) as MIDIMapping;
              const next = mappings.slice();
              const insertAt = Math.min(mappings.length, selectedIndex + 1);
              next.splice(insertAt, 0, clone);
              updateMappings(next);
              setSelectedIndex(insertAt);
            }}>Duplicate</Button>
            <Button variant="destructive" onClick={() => { if (selectedMapping) { const next = mappings.filter((_, i) => i !== selectedIndex); updateMappings(next); setSelectedIndex(Math.max(0, selectedIndex - 1)); } }}>Remove</Button>
            <Button variant="secondary" onClick={() => { try { const n = (useStore.getState() as any).currentPresetName || 'midi-mapping'; setSaveName(String(n)); } catch { setSaveName('midi-mapping'); } setSaveOpen(true); }}>Save Preset</Button>
            <Button variant="secondary" onClick={() => {
              try {
                const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.showOpenDialog;
                if (isElectron) {
                  (async () => {
                    const result = await (window as any).electron.showOpenDialog({ title: 'Load Set', properties: ['openFile'], filters: [{ name: 'VJ Preset', extensions: ['vjpreset', 'json'] }] });
                    if (!result.canceled && result.filePaths && result.filePaths[0]) {
                      const content = await (window as any).electron.readFileText(result.filePaths[0]);
                      if (content) {
                        const blob = new Blob([content], { type: 'application/json' });
                        const file = new File([blob], result.filePaths[0]);
                        const { loadPreset } = useStore.getState() as any;
                        await loadPreset(file);
                      }
                    }
                  })();
                } else {
                  fileInputRef.current?.click();
                }
              } catch {}
            }}>Load Preset</Button>
          </div>
        </div>
        
        <div className="tw-mt-2 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-auto tw-max-h-64 tw-min-h-0 tw-bg-neutral-900">
          {(mappings || []).map((mapping, idx) => (
            <div key={idx}
              className={`tw-flex tw-justify-between tw-items-center tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800 tw-cursor-pointer hover:tw-bg-neutral-800/60 ${idx === selectedIndex ? 'tw-bg-sky-600 tw-text-black' : ''}`}
              onClick={() => handleMappingSelect(idx)}
            >
              <span className="tw-text-sm tw-font-medium">{mapping.target.type}</span>
              <span className="tw-text-xs tw-font-semibold tw-text-neutral-300">{getNoteChannelDisplay(mapping)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tw-p-2 tw-border-b tw-border-neutral-800 tw-bg-neutral-900">
        <div className="tw-grid tw-grid-cols-2 tw-gap-2">
          <div className="tw-space-y-2">
            <Label className="tw-text-xs">Input Type</Label>
            <Select value={selectedMapping?.type || 'note'} onChange={(v) => updateSelected(m => ({ ...m, type: v as any }))} options={inputTypeOptions} />
          </div>
          {selectedMapping?.type !== 'key' && (
            <div className="tw-space-y-2">
              <Label className="tw-text-xs">Channel</Label>
              <Select value={String(selectedMapping?.channel || 1)} onChange={(v) => updateSelected(m => ({ ...m, channel: Number(v) }))} options={Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1) }))} />
            </div>
          )}
          {selectedMapping?.type !== 'key' ? (
            <div className="tw-space-y-2">
              <Label className="tw-text-xs">Note/CC Number</Label>
              <Input value={selectedMapping?.number ?? 60} onChange={(e) => updateSelected(m => ({ ...m, number: Math.max(0, Math.min(127, Number(e.target.value) || 0)) }))} />
            </div>
          ) : (
            <div className="tw-space-y-2">
              <Label className="tw-text-xs">Key Combo</Label>
              <Input
                value={getNoteChannelDisplay(selectedMapping)}
                placeholder="Click and press a key"
                onFocus={(e) => {
                  const handler = (ev: KeyboardEvent) => {
                    ev.preventDefault();
                    updateSelected(m => ({ ...m, key: ev.key, ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey, meta: ev.metaKey }));
                  };
                  const onBlur = () => {
                    (e.target as HTMLInputElement).removeEventListener('keydown', handler as any);
                    (e.target as HTMLInputElement).removeEventListener('blur', onBlur);
                  };
                  (e.target as HTMLInputElement).addEventListener('keydown', handler as any, { once: true } as any);
                  (e.target as HTMLInputElement).addEventListener('blur', onBlur, { once: true } as any);
                }}
                onChange={() => {}}
                readOnly
              />
            </div>
          )}
          <div className="tw-space-y-2">
            <Label className="tw-text-xs">Action</Label>
            <Select value={selectedMapping && (selectedMapping.target as any)?.type || 'transport'} onChange={(v) => {
              const val = String(v);
              if (val === 'transport') updateSelected(m => ({ ...m, target: { type: 'transport', action: 'play' } as any }));
              else if (val === 'column') updateSelected(m => ({ ...m, target: { type: 'column', index: 1 } as any }));
              else if (val === 'scene') updateSelected(m => ({ ...m, target: { type: 'scene', id: (useStore.getState() as any).currentSceneId } as any }));
            }} options={actionTypeOptions} />
        </div>

          {selectedMapping?.target?.type === 'transport' && (
            <div className="tw-space-y-2">
              <Label className="tw-text-xs">Transport Action</Label>
              <Select value={(selectedMapping.target as any).action} onChange={(v) => updateSelected(m => ({ ...m, target: { type: 'transport', action: v as any } as any }))} options={[{ value: 'play' }, { value: 'pause' }, { value: 'stop' }]} />
          </div>
          )}
          {selectedMapping?.target?.type === 'column' && (
            <div className="tw-space-y-2">
              <Label className="tw-text-xs">Column Index</Label>
              <Input value={(selectedMapping.target as any).index} onChange={(e) => updateSelected(m => ({ ...m, target: { type: 'column', index: Math.max(1, Number(e.target.value) || 1) } as any }))} />
        </div>
          )}
          </div>
        </div>

      <div className="tw-bg-neutral-900 tw-flex-1 tw-overflow-auto tw-text-xs tw-text-neutral-300 tw-p-2">
        <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
        <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-neutral-300">MIDI Monitor</span>
            <span className={`tw-inline-block tw-w-2 tw-h-2 tw-rounded-full ${lastEventAt && Date.now() - lastEventAt < 500 ? 'tw-bg-emerald-400' : 'tw-bg-neutral-700'}`}></span>
          </div>
          <div className="tw-flex tw-gap-2">
            <Button variant="secondary" onClick={() => setMonitorEnabled(!monitorEnabled)}>{monitorEnabled ? 'Pause' : 'Resume'}</Button>
          </div>
        </div>
        <div>
          {!lastEvent ? (
            <div className="tw-text-neutral-500">No MIDI events yet. Play a note or move a control.</div>
          ) : (
            <div className="tw-flex tw-justify-between tw-border tw-border-neutral-800 tw-rounded tw-px-2 tw-py-1">
              <span className="tw-text-neutral-200">{lastEvent.type.toUpperCase()} {lastEvent.number}</span>
              <span className="tw-text-neutral-400">ch {lastEvent.channel} • val {lastEvent.value} • {new Date(lastEvent.ts).toLocaleTimeString()}</span>
      </div>
          )}
          </div>
        </div>

      {/* Hidden file input for web load */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".vjpreset,.json,application/json"
        className="tw-hidden"
        onChange={async (e) => {
          try {
            const file = e.target.files?.[0];
            if (!file) return;
            const { loadPreset } = useStore.getState() as any;
            await loadPreset(file);
            // reset input value to allow re-selecting same file later
            (e.target as HTMLInputElement).value = '';
          } catch {}
        }}
      />

      {/* Save Preset Dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Preset</DialogTitle>
            <DialogDescription>Save the current set, including MIDI mappings.</DialogDescription>
          </DialogHeader>
          <div className="tw-space-y-2">
            <Label className="tw-text-xs">Name</Label>
            <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} />
        </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              const name = (saveName || 'midi-mapping').trim();
              const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.showSaveDialog;
              if (isElectron) {
                (async () => {
                  const presetName = `preset-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.vjpreset`;
                  const result = await (window as any).electron.showSaveDialog({ title: 'Save Set', defaultPath: presetName, filters: [{ name: 'VJ Preset', extensions: ['vjpreset', 'json'] }] });
                  if (!result.canceled && result.filePath) {
                    const { savePreset } = useStore.getState() as any;
                    const key = savePreset(name.replace(/\.(vjpreset|json)$/i, ''));
                    if (key) {
                      const state = useStore.getState() as any;
                      const preset = {
                        name: key,
                        displayName: key,
                        timestamp: Date.now(),
                        version: '1.0.0',
                        description: `VJ Preset: ${key}`,
                        data: {
                          scenes: state.scenes,
                          currentSceneId: state.currentSceneId,
                          playingColumnId: state.playingColumnId,
                          bpm: state.bpm,
                          sidebarVisible: state.sidebarVisible,
                          midiMappings: state.midiMappings,
                          selectedLayerId: state.selectedLayerId,
                          previewMode: state.previewMode,
                          transitionType: state.transitionType,
                          transitionDuration: state.transitionDuration,
                          compositionSettings: state.compositionSettings,
                          assets: state.assets,
                        }
                      } as any;
                      await (window as any).electron.saveFile(result.filePath, JSON.stringify(preset, null, 2));
                    }
                  }
                  setSaveOpen(false);
                })();
              } else {
                try {
                  const { savePreset } = useStore.getState() as any;
                  savePreset(name);
                } catch {}
                setSaveOpen(false);
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}; 