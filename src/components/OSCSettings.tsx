import React, { useEffect, useMemo, useState } from 'react';
import { Input, Button } from './ui';
import { Switch } from './ui/switch';
import { useStore } from '../store/store';

const clampPort = (value: unknown): number => {
  return Math.max(1, Math.min(65535, Math.floor(Number(value) || 7000)));
};

export const OSCSettings: React.FC = () => {
  const {
    oscInputEnabled,
    oscInputPort,
    setOscInputEnabled,
    setOscInputPort,
  } = useStore() as any;

  const enabled = oscInputEnabled !== false;
  const port = clampPort(oscInputPort);
  const [draftPort, setDraftPort] = useState(String(port));
  const [ipAddress, setIpAddress] = useState('127.0.0.1');
  const [status, setStatus] = useState('');

  const hasElectronOsc = useMemo(() => {
    try {
      const electron = (window as any).electron;
      return Boolean(electron?.getOscInputState && electron?.configureOscInput);
    } catch {
      return false;
    }
  }, []);

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
    </div>
  );
};
