import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { Select } from './ui';

interface MIDIMapping {
  id: string;
  name: string;
  target: string;
  input: string;
  output: string;
  channel: number;
  note: string;
  status: string;
  velocity: string;
  isActive: boolean;
}

interface MIDIDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
}

export const MIDIMapper: React.FC = () => {
  const [selectedDevice, setSelectedDevice] = useState<string>('Loopmidi');
  const [selectedMapping, setSelectedMapping] = useState<MIDIMapping | null>(null);
  const [mappings, setMappings] = useState<MIDIMapping[]>([
    {
      id: '1',
      name: 'Composition Columns 1 Connect',
      target: 'By Position',
      input: 'Any device',
      output: 'All devices',
      channel: 1,
      note: 'C2',
      status: 'Empty',
      velocity: '0 - Off',
      isActive: true
    },
    {
      id: '2',
      name: 'Composition Columns 10 Connect',
      target: 'By Position',
      input: 'Any device',
      output: 'All devices',
      channel: 1,
      note: 'A2',
      status: 'Empty',
      velocity: '0 - Off',
      isActive: false
    },
    {
      id: '3',
      name: 'Composition Columns 2 Connect',
      target: 'By Position',
      input: 'Any device',
      output: 'All devices',
      channel: 1,
      note: 'C#2',
      status: 'Empty',
      velocity: '0 - Off',
      isActive: false
    },
    {
      id: '4',
      name: 'Composition Columns 3 Connect',
      target: 'By Position',
      input: 'Any device',
      output: 'All devices',
      channel: 1,
      note: 'D2',
      status: 'Empty',
      velocity: '0 - Off',
      isActive: false
    },
    {
      id: '5',
      name: 'Composition Columns 4 Connect',
      target: 'By Position',
      input: 'Any device',
      output: 'All devices',
      channel: 1,
      note: 'D#2',
      status: 'Empty',
      velocity: '0 - Off',
      isActive: false
    }
  ]);

  const [devices] = useState<MIDIDevice[]>([
    { id: 'loopmidi', name: 'Loopmidi', type: 'input' },
    { id: 'midi-keyboard', name: 'MIDI Keyboard', type: 'input' },
    { id: 'virtual-midi', name: 'Virtual MIDI', type: 'input' }
  ]);

  const targetOptions = [
    'By Position',
    'Composition Columns',
    'Layer Controls',
    'Scene Management',
    'Transport Controls'
  ];

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

  useEffect(() => {
    // Set first mapping as selected by default
    if (mappings.length > 0 && !selectedMapping) {
      setSelectedMapping(mappings[0]);
    }
  }, [mappings, selectedMapping]);

  const handleMappingSelect = (mapping: MIDIMapping) => {
    setSelectedMapping(mapping);
    // Update active state
    setMappings(prev => prev.map(m => ({
      ...m,
      isActive: m.id === mapping.id
    })));
  };

  const handleSettingChange = (field: keyof MIDIMapping, value: string | number) => {
    if (!selectedMapping) return;
    
    const updatedMapping = { ...selectedMapping, [field]: value };
    setSelectedMapping(updatedMapping);
    
    setMappings(prev => prev.map(m => 
      m.id === selectedMapping.id ? updatedMapping : m
    ));
  };

  const getNoteChannelDisplay = (mapping: MIDIMapping) => {
    return `${mapping.channel}/${mapping.note}`;
  };

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-text-neutral-200">
      {/* Top Section: MIDI Mappings List */}
      <div className="tw-p-2 tw-border-b tw-border-neutral-800 tw-bg-neutral-900">
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
          <div className="tw-min-w-[160px]">
            <Select
              value={selectedDevice}
              onChange={(v) => setSelectedDevice(v as string)}
              options={devices.map(d => ({ value: d.name }))}
            />
          </div>
        </div>
        
        <div className="tw-mt-2 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-max-h-64 tw-min-h-0 tw-bg-neutral-900">
          {mappings.map((mapping) => (
            <div
              key={mapping.id}
              className={`tw-flex tw-justify-between tw-items-center tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800 tw-cursor-pointer hover:tw-bg-neutral-800/60 ${mapping.isActive ? 'tw-bg-sky-600 tw-text-black' : ''}`}
              onClick={() => handleMappingSelect(mapping)}
            >
              <span className="tw-text-sm tw-font-medium">{mapping.name}</span>
              <span className="tw-text-xs tw-font-semibold tw-text-neutral-300">{getNoteChannelDisplay(mapping)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Section: MIDI Settings */}
      <div className="tw-p-2 tw-border-b tw-border-neutral-800 tw-bg-neutral-900">
        <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
          <label className="tw-w-20 tw-text-sm tw-text-neutral-300">Target:</label>
          <div className="tw-relative tw-z-[1]">
            <Select
              value={(selectedMapping?.target || '') as string}
              onChange={(v) => handleSettingChange('target', v as string)}
              options={targetOptions.map(o => ({ value: o }))}
            />
          </div>
        </div>

        <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
          <label className="tw-w-20 tw-text-sm tw-text-neutral-300">Input:</label>
          <div className="tw-relative tw-z-[1]">
            <Select
              value={(selectedMapping?.input || '') as string}
              onChange={(v) => handleSettingChange('input', v as string)}
              options={inputOptions.map(o => ({ value: o }))}
            />
          </div>
        </div>

        <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
          <label className="tw-w-20 tw-text-sm tw-text-neutral-300">Output:</label>
          <div className="tw-relative tw-z-[1]">
            <Select
              value={(selectedMapping?.output || '') as string}
              onChange={(v) => handleSettingChange('output', v as string)}
              options={outputOptions.map(o => ({ value: o }))}
            />
          </div>
        </div>

        <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
          <label className="tw-w-20 tw-text-sm tw-text-neutral-300">Channel:</label>
          <div className="tw-relative tw-z-[1]">
            <Select
              value={(selectedMapping?.channel || 1) as number}
              onChange={(v) => handleSettingChange('channel', Number(v))}
              options={Array.from({ length: 16 }, (_, i) => i + 1).map(ch => ({ value: ch, label: String(ch) }))}
            />
          </div>
        </div>

        <div className="tw-flex tw-items-center tw-gap-2">
          <label className="tw-w-20 tw-text-sm tw-text-neutral-300">Note:</label>
          <div className="tw-relative tw-z-[1]">
            <Select
              value={(selectedMapping?.note || '') as string}
              onChange={(v) => handleSettingChange('note', v as string)}
              options={noteOptions.map(n => ({ value: n }))}
            />
          </div>
        </div>
      </div>

      {/* Lower Section: MIDI Out Velocity */}
      <div className="tw-p-2 tw-border-b tw-border-neutral-800 tw-bg-neutral-900">
        <h4 className="tw-text-sm tw-font-semibold tw-mb-2">MIDI Out Velocity</h4>
        
        <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
          <label className="tw-w-20 tw-text-sm tw-text-neutral-300">Status:</label>
          <div className="tw-relative tw-z-[1]">
            <Select
              value={(selectedMapping?.status || 'Empty') as string}
              onChange={(v) => handleSettingChange('status', v as string)}
              options={[
                { value: 'Empty' },
                { value: 'Active' },
                { value: 'Inactive' }
              ]}
            />
          </div>
        </div>

        <div className="tw-flex tw-items-center tw-gap-2">
          <label className="tw-w-20 tw-text-sm tw-text-neutral-300">Velocity:</label>
          <div className="tw-min-w-[220px]">
            <Select
              value={(selectedMapping?.velocity || '') as string}
              onChange={(v) => handleSettingChange('velocity', v as string)}
              options={velocityOptions.map(v => ({ value: v }))}
            />
          </div>
        </div>
      </div>

      {/* Bottom Section: Help */}
      <div className="tw-bg-neutral-900 tw-flex-1 tw-overflow-auto">
        <div className="tw-flex tw-items-center tw-justify-between tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800">
          <span className="tw-text-sm tw-font-medium">Help</span>
          <button className="tw-w-6 tw-h-6 tw-rounded tw-flex tw-items-center tw-justify-center hover:tw-bg-neutral-800">×</button>
        </div>
        <div className="tw-p-2 tw-text-sm tw-text-neutral-300">
          Move your mouse over the interface element that you would like more info about.
        </div>
      </div>
    </div>
  );
}; 