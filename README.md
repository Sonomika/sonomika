# VJ App

A modular VJ performance application built with Electron, React, and WebGL.

## Features

- **MIDI Integration**
  - Support for multiple MIDI devices
  - Note messages trigger visual columns
  - CC messages control parameters (opacity, blend intensity, effect strength, BPM override)
  - Live MIDI mapping interface
  - Preset/tab switching via MIDI

- **BPM Sync**
  - Manual BPM input
  - Tap tempo control
  - Global BPM exposed to all visuals
  - Per-sketch BPM sync toggle

- **Visual Engine**
  - Columns triggered by MIDI notes
  - 3 stackable, reorderable layers per column
  - Layer controls: solo, mute, lock
  - Adjustable opacity and blend modes
  - Custom effect parameters

- **Layer Types**
  - Image
  - Video (loop, reverse, ping-pong)
  - Full-screen fragment shader (GLSL)
  - p5.js sketch
  - Three.js module

- **Visual Screens**
  - Composition Screen (final output)
  - Layer Screen (isolated preview)

- **Scene Management**
  - Presets stored as tabs
  - Click, rename, reorder
  - MIDI switchable
  - Configurable transitions (crossfade, fade through black, instant cut)

- **Output**
  - Stream via `canvas.captureStream()`
  - OBS compatible
  - External display support

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/vj-app.git
   cd vj-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev:electron
   ```

### Build

```bash
npm run build
```

### Project Structure

```
vj-app/
├── electron/         # Electron main process
├── src/
│   ├── components/  # React components
│   ├── effects/     # Visual effects
│   ├── engine/      # Core engine modules
│   ├── midi/        # MIDI handling
│   ├── store/       # State management
│   └── utils/       # Utility functions
├── public/          # Static assets
└── dist/           # Build output
```

### Adding Effects

1. Create a new effect class in `src/effects/` that extends `BaseEffect`
2. Implement required methods:
   - `getMetadata()`: Define effect parameters
   - `render(deltaTime)`: Draw to canvas
3. Register the effect in `EffectLoader`

Example:
```typescript
import { BaseEffect, EffectMetadata } from './BaseEffect';

export class MyEffect extends BaseEffect {
  getMetadata(): EffectMetadata {
    return {
      name: 'My Effect',
      description: 'Description',
      parameters: [
        {
          name: 'speed',
          type: 'number',
          min: 0,
          max: 1,
          default: 0.5,
        },
      ],
    };
  }

  render(deltaTime: number): void {
    // Draw to this.canvas using this.ctx
  }
}
```

### Keyboard Shortcuts

- `?` - Show keyboard shortcuts help
- `Tab` - Toggle sidebar
- `Space` - Tap tempo
- `←/→` - Previous/Next scene
- `1-9` - Switch to scene
- `M` - Toggle mute for selected layer
- `S` - Toggle solo for selected layer
- `L` - Toggle lock for selected layer

### Media Library

The VJ application includes a comprehensive Media Library for managing and importing visual assets.

#### Features:
- **Asset Management**: Browse, import, and organize media files
- **Multiple Formats**: Support for images, videos, shaders, p5.js sketches, and Three.js modules
- **Drag & Drop**: Import files by dragging them into the library
- **Search & Filter**: Find assets by name, type, or tags
- **Thumbnail Generation**: Automatic thumbnails for images and videos
- **Grid/List Views**: Switch between different viewing modes
- **Asset Validation**: Automatic file type detection and validation

#### Supported Formats:
- **Images**: JPEG, PNG, GIF, WebP
- **Videos**: MP4, WebM, OGG
- **Shaders**: GLSL fragment and vertex shaders (.frag, .vert, .glsl)
- **Sketches**: p5.js JavaScript files (.js)
- **3D Modules**: Three.js JavaScript files (.js)

#### How to Use:

1. **Open Media Library**:
   - Click "Media Library" in the sidebar
   - Or press `L` (keyboard shortcut)

2. **Import Files**:
   - Click "Import Files" button
   - Or drag and drop files into the drop zone
   - Select multiple files at once

3. **Browse Assets**:
   - Use search bar to find specific assets
   - Filter by asset type (Images, Videos, etc.)
   - Switch between Grid and List views

4. **Asset Information**:
   - View file size and creation date
   - See asset type badges
   - Preview thumbnails for images/videos

#### Asset Management:
- **Persistent Storage**: Assets are saved locally
- **Automatic Thumbnails**: Generated for images and videos
- **Metadata Tracking**: File size, dimensions, duration
- **Tag System**: Organize assets with custom tags

### MIDI Scene Mapping

The VJ application now includes a dedicated MIDI scene mapping system that allows you to assign MIDI notes to scenes for live performance control.

#### Features:
- **Scene-to-Note Mapping**: Assign any MIDI note to any scene
- **Channel Support**: Use different MIDI channels for organization
- **Visual Feedback**: See mapped notes with musical notation (C4, D#5, etc.)
- **Enable/Disable**: Toggle mappings on/off without deleting them
- **Persistent Storage**: Mappings are saved automatically

#### How to Use:

1. **Open MIDI Scene Mapper**:
   - Click "MIDI Scene Mapping" in the sidebar
   - Or press `S` (keyboard shortcut)

2. **Assign MIDI Notes**:
   - Click on a scene's MIDI button
   - Press any key on your MIDI controller
   - The note will be assigned and displayed

3. **Live Performance**:
   - Press the assigned MIDI note to switch to that scene instantly
   - Multiple scenes can be mapped to different notes
   - Use different MIDI channels to organize your setup

#### Default Mappings:
The app comes with 5 default scenes pre-mapped to MIDI notes:
- **Intro** → C4 (Note 60)
- **Build Up** → C#4 (Note 61)  
- **Drop** → D4 (Note 62)
- **Breakdown** → D#4 (Note 63)
- **Outro** → E4 (Note 64)

#### Controls:
- **Channel Selector**: Choose MIDI channel (1-16)
- **Enable/Disable**: Toggle button (●/○) to activate/deactivate mappings
- **Clear Mapping**: Click × to remove a note assignment
- **Listening Mode**: Visual feedback when assigning new notes

### MIDI Mapping

1. Click "MIDI Mapping" in the sidebar
2. Select a parameter to map
3. Move a MIDI control (note or CC)
4. The mapping will be saved automatically

### Scene Transitions

1. Click "Transition Settings" in the sidebar
2. Choose transition type:
   - Cut: Instant switch
   - Fade: Crossfade between scenes
   - Fade Through Black: Fade out, then fade in
3. Adjust duration (ms) for fade transitions

## License

ISC 