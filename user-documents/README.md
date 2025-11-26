# User Documents Assets

This folder contains assets that will be deployed to users' `Documents/Sonomika/` folder on first run.

## Structure

The folder structure here mirrors what gets created in `Documents/Sonomika/`:

- **`sets/`** - Preset files (.vjpreset)
- **`midi mapping/`** - MIDI mapping files
- **`music/`** - Music files
- **`recordings/`** - Recording templates or examples
- **`video/`** - Video files or examples

## How It Works

1. Files you add to this folder will be included in the app build
2. On first run, the app copies these folders to `Documents/Sonomika/`
3. Files are only copied if they don't already exist (won't overwrite user files)

## Adding Assets

Simply add your files to the appropriate subfolder:
- Example MIDI mapping → `midi mapping/example.mid`
- Example music → `music/example.mp3`
- Example video → `video/example.mp4`

## Note

The following folders are handled separately:
- **`bank/`** - Effects and sources (copied from root `bank/` folder)
- **`ai-templates/`** - AI templates (seeded from `src/ai-templates/`)


