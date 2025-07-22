import React from 'react';
import { MIDIMapper } from './MIDIMapper';

export const MIDITestPage: React.FC = () => {
  return (
    <div style={{
      height: '100vh',
      backgroundColor: '#000000',
      color: '#ffffff',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h1 style={{ marginBottom: '20px' }}>MIDI Mapper Test</h1>
      <div style={{ flex: 1, border: '1px solid #333' }}>
        <MIDIMapper />
      </div>
    </div>
  );
}; 