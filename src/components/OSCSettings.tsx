import React, { useEffect, useMemo, useState } from 'react';
import { Input, Button, Label, Select } from './ui';
import { Switch } from './ui/switch';
import { useStore } from '../store/store';
import { MIDIMapping } from '../store/types';
import { getEffectComponentSync } from '../utils/EffectLoader';

const clampPort = (value: unknown): number => {
  return Math.max(1, Math.min(65535, Math.floor(Number(value) || 7000)));
};

const useLayerParamOptions = (selectedLayer: any) => {
  return useMemo(() => {
    const options: { value: string; label: string }[] = [];
    if (!selectedLayer) return options;

    options.push({ value: 'opacity', label: 'Opacity' });

    const isEffect = selectedLayer?.type === 'effect' || selectedLayer?.asset?.isEffect;
    const effectId: string | undefined =
      selectedLayer?.asset?.id || selectedLayer?.asset?.name || selectedLayer?.asset?.effectId;
    if (isEffect && effectId) {
      const effectComponent = getEffectComponentSync(effectId);
      const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
      if (metadata?.parameters && Array.isArray(metadata.parameters)) {
        metadata.parameters
          .filter((p: any) => p?.type === 'number' || p?.type === 'button')
          .forEach((p: any) => {
            const label = p.description || p.name;
            options.push({ value: p.name, label });
          });
        return options;
      }
    }

    Object.keys(selectedLayer.params || {})
      .filter((k) => typeof (selectedLayer.params?.[k]?.value) === 'number')
      .forEach((k) => {
        if (!options.some((option) => option.value === k)) {
          options.push({ value: k, label: k });
        }
      });
    return options;
  }, [selectedLayer]);
};

export const OSCSettings: React.FC = () => {
  const {
    oscInputEnabled,
    oscInputPort,
    setOscInputEnabled,
    setOscInputPort,
    midiMappings,
    setMIDIMappings,
    selectedLayerId,
    scenes,
    currentSceneId,
  } = useStore() as any;

  const enabled = oscInputEnabled !== false;
  const port = clampPort(oscInputPort);
  const [draftPort, setDraftPort] = useState(String(port));
  const [ipAddress, setIpAddress] = useState('127.0.0.1');
  const [status, setStatus] = useState('');
  const [oscAddress, setOscAddress] = useState('/composition/layers/1/dashboard/link1');
  const [param, setParam] = useState('');
  const [learn, setLearn] = useState(false);
  const [lastOscAddress, setLastOscAddress] = useState('');
  const [lastOscValue, setLastOscValue] = useState('');

  const hasElectronOsc = useMemo(() => {
    try {
      const electron = (window as any).electron;
      return Boolean(electron?.getOscInputState && electron?.configureOscInput);
    } catch {
      return false;
    }
  }, []);
  const hasOscMessageListener = useMemo(() => {
    try {
      return Boolean((window as any).electron?.onOscMessage);
    } catch {
      return false;
    }
  }, []);

  const selectedLayer = useMemo(() => {
    const scene = (scenes || []).find((s: any) => s.id === currentSceneId);
    if (!scene || !selectedLayerId) return null;

    for (const col of scene.columns || []) {
      const layer = (col.layers || []).find((l: any) => l.id === selectedLayerId);
      if (layer) return layer;
    }
    return null;
  }, [scenes, currentSceneId, selectedLayerId]);
  const selectedLayerName = selectedLayer?.asset?.metadata?.name
    || selectedLayer?.asset?.name
    || selectedLayer?.name
    || 'selected cell';

  const paramOptions = useLayerParamOptions(selectedLayer);
  const mappings = (midiMappings as MIDIMapping[]) || [];
  const oscLayerMappings = mappings
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => (
      m.type === 'osc'
      && (m.target as any)?.type === 'layer'
      && !!selectedLayerId
      && (m.target as any)?.id === selectedLayerId
    ));

  const applyOscSettings = async (nextEnabled = enabled, nextPort = port) => {
    const cleanPort = clampPort(nextPort);
    setOscInputEnabled?.(nextEnabled);
    setOscInputPort?.(cleanPort);
    setDraftPort(String(cleanPort));

    if (!hasElectronOsc) {
      setStatus('OSC input is available in the Electron app.');
      return;
    }

    try {
      const result = await (window as any).electron.configureOscInput({
        enabled: nextEnabled,
        port: cleanPort,
      });
      if (result?.ipAddress) setIpAddress(String(result.ipAddress));
      if (result?.error) {
        setStatus(`Could not start OSC on port ${cleanPort}: ${result.error}`);
      } else {
        setStatus(nextEnabled ? `Listening on port ${result?.port || cleanPort}` : 'OSC input off');
      }
    } catch (error: any) {
      setStatus(`Could not update OSC input: ${error?.message || String(error)}`);
    }
  };

  useEffect(() => {
    setDraftPort(String(port));
  }, [port]);

  useEffect(() => {
    if (paramOptions.length > 0 && (!param || !paramOptions.some((option) => option.value === param))) {
      setParam(paramOptions[0].value);
    }
  }, [paramOptions, param]);

  useEffect(() => {
    const unsubscribe = (window as any).electron?.onOscMessage?.((payload: any) => {
      const address = String(payload?.address || '');
      if (!address) return;
      setLastOscAddress(address);
      const firstArg = Array.isArray(payload?.args) ? payload.args[0] : undefined;
      setLastOscValue(firstArg === undefined ? 'no value' : String(firstArg));
      if (learn) {
        setOscAddress(address);
        setLearn(false);
      }
    });

    return () => {
      try { unsubscribe?.(); } catch {}
    };
  }, [learn]);

  useEffect(() => {
    if (!hasElectronOsc) return;
    let cancelled = false;

    const sync = async () => {
      try {
        const current = await (window as any).electron.getOscInputState();
        if (cancelled) return;
        if (current?.ipAddress) setIpAddress(String(current.ipAddress));
        await applyOscSettings(enabled, port);
      } catch {}
    };

    sync();
    return () => {
      cancelled = true;
    };
    // Run once on mount to apply persisted settings to the main-process OSC server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasElectronOsc]);

  const commitPort = () => {
    applyOscSettings(enabled, clampPort(draftPort));
  };

  const addMapping = () => {
    const cleanAddress = String(oscAddress || '').trim();
    if (!selectedLayer || !selectedLayerId || !param || !cleanAddress.startsWith('/')) return;

    const next: MIDIMapping = {
      type: 'osc',
      address: cleanAddress,
      enabled: true,
      target: {
        type: 'layer',
        id: selectedLayerId,
        param,
      } as any,
    };

    setMIDIMappings([...(mappings || []), next]);
  };

  const removeMappingAt = (idx: number) => {
    setMIDIMappings((mappings || []).filter((_, i) => i !== idx));
  };

  return (
    <div className="tw-space-y-5 tw-text-neutral-100">
      <div className="tw-text-sm tw-font-semibold">IP Address: {ipAddress}</div>

      <div className="tw-flex tw-items-center tw-gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => applyOscSettings(Boolean(checked), port)}
          aria-label="Enable OSC input"
        />
        <div className="tw-text-sm">OSC Input</div>
      </div>

      <div className="tw-flex tw-items-center tw-gap-4">
        <label htmlFor="osc-input-port" className="tw-text-sm tw-text-neutral-200">
          Incoming Port
        </label>
        <Input
          id="osc-input-port"
          type="number"
          min={1}
          max={65535}
          step={1}
          value={draftPort}
          disabled={!enabled}
          onChange={(event) => setDraftPort(event.target.value)}
          onBlur={commitPort}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          className="tw-w-24 tw-bg-neutral-800 tw-border-neutral-700"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!enabled}
          onClick={commitPort}
        >
          Apply
        </Button>
      </div>

      {status && (
        <div className="tw-text-xs tw-text-neutral-400">{status}</div>
      )}

      <div className="tw-border tw-border-neutral-800 tw-rounded-md tw-bg-neutral-900 tw-p-2 tw-space-y-2">
        <div className="tw-space-y-1">
          <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">Map OSC to Selected Cell</h4>
          <p className="tw-text-xs tw-text-neutral-500">
            Click an effect cell first. OSC mappings are saved to that cell, so the same effect in another column can use its own mappings.
          </p>
        </div>

        {!hasOscMessageListener ? (
          <div className="tw-text-sm tw-text-neutral-400">OSC parameter mapping is available in the Electron app.</div>
        ) : !selectedLayer ? (
          <div className="tw-text-sm tw-text-neutral-400">Select an effect cell to map its sliders to OSC addresses.</div>
        ) : (
          <>
            <div className="tw-text-xs tw-text-neutral-400">
              Focus: <span className="tw-text-neutral-200">{selectedLayerName}</span>
            </div>
            <div className="tw-grid tw-grid-cols-2 tw-gap-2">
              <div className="tw-space-y-1">
                <Label className="tw-text-xs">Parameter</Label>
                <Select value={param} onChange={(v) => setParam(String(v))} options={paramOptions} />
              </div>
              <div className="tw-space-y-1">
                <Label className="tw-text-xs">OSC Address</Label>
                <Input
                  value={oscAddress}
                  onChange={(event) => setOscAddress(event.target.value)}
                  className="tw-bg-neutral-800 tw-border-neutral-700"
                />
              </div>
            </div>
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              <Button variant="secondary" onClick={() => setLearn((v) => !v)}>
                {learn ? 'Listening...' : 'Learn Address'}
              </Button>
              <Button onClick={addMapping} disabled={!param || !oscAddress.trim().startsWith('/')}>
                Add Mapping
              </Button>
              {lastOscAddress && (
                <div className="tw-text-xs tw-text-neutral-400">Last OSC: {lastOscAddress} {lastOscValue}</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="tw-border tw-border-neutral-800 tw-rounded-md tw-bg-neutral-900 tw-p-2 tw-space-y-2">
        <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">Current OSC Cell Mappings</h4>
        {oscLayerMappings.length === 0 ? (
          <div className="tw-text-sm tw-text-neutral-400">
            {selectedLayer ? 'No OSC mappings for this cell yet.' : 'Select a cell to view its OSC mappings.'}
          </div>
        ) : (
          <div className="tw-space-y-1">
            {oscLayerMappings.map(({ m, i }) => (
              <div key={`${(m as any).address}-${i}`} className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-border tw-border-neutral-800 tw-rounded tw-px-2 tw-py-1">
                <div className="tw-min-w-0">
                  <div className="tw-text-xs tw-text-neutral-200 tw-truncate">{(m as any).address}</div>
                  <div className="tw-text-xs tw-text-neutral-500 tw-truncate">{(m.target as any)?.param || 'parameter'}</div>
                </div>
                <div className="tw-flex tw-items-center tw-gap-2">
                  <label className="tw-flex tw-items-center tw-gap-1 tw-text-xs">
                    <Switch checked={m.enabled !== false} onCheckedChange={(checked) => {
                      const next = (mappings || []).slice();
                      (next[i] as any).enabled = !!checked;
                      setMIDIMappings(next);
                    }} />
                    Enabled
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => removeMappingAt(i)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
