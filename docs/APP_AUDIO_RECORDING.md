# App Audio Recording Feature

## Overview

The VJ app now supports recording its internal audio output, allowing you to capture the audio that's playing within the app (timeline audio clips, sequence audio, etc.) during recording sessions.

## How It Works

### Audio Context Manager
- **File**: `src/utils/AudioContextManager.ts`
- Centralized manager that creates an AudioContext and MediaStreamDestinationNode
- Captures audio from all registered audio elements in the app
- Provides a single MediaStream that contains the mixed app audio

### Audio Capture Hook
- **File**: `src/hooks/useAppAudioCapture.ts`
- React hook that automatically registers audio elements with the audio context manager
- Used by components like CustomWaveform to enable app audio capture

### Integration Points
- **CustomWaveform**: Audio elements are automatically registered for capture
- **Timeline**: Audio clips created during playback are registered for capture
- **Recording System**: New "App Audio" option in record settings

## Usage

1. **Open Record Settings**: Click the "Record" dropdown in the title bar, then "Record Settings"
2. **Select Audio Source**: Choose "App Audio (VJ internal audio)" from the dropdown
3. **Start Recording**: Click "Record" to begin recording with app audio
4. **Stop Recording**: Click "Stop Recording" to save the file

## Technical Details

### Audio Sources Captured
- Timeline audio clips
- Sequence audio (CustomWaveform)
- Any other audio elements created by the app

### Audio Processing
- All app audio is mixed into a single MediaStream
- Audio context handles proper audio routing
- Maintains normal playback while capturing for recording

### Browser Compatibility
- Uses Web Audio API (AudioContext, MediaStreamAudioDestinationNode)
- Requires modern browser with Web Audio support
- Graceful fallback if audio context initialization fails

## Files Modified
- `src/utils/AudioContextManager.ts` (new)
- `src/hooks/useAppAudioCapture.ts` (new)
- `src/components/RecordSettingsDialog.tsx`
- `src/store/store.ts`
- `src/App.tsx`
- `src/components/CustomWaveform.tsx`
- `src/components/Timeline.tsx`
