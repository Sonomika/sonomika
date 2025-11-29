# macOS App Bundle Format Explained

## What is a .app file?

On macOS, `.app` files are **application bundles** - they look like single files but are actually folders containing all the app's resources. This is the standard way macOS apps work.

### Key Points:

1. **All macOS apps are folders** - Even system apps like Safari, Chrome, and Logic Pro are `.app` bundles (folders)
2. **macOS treats them as applications** - You double-click them just like any app
3. **They're self-contained** - Everything the app needs is inside the bundle
4. **This is the only standalone format** - macOS doesn't have a "single executable file" option like Windows

## Your Build Output

When you build your macOS app, you get:

### ZIP Files (Standalone/Portable)
- `Sonomika-1.0.0-x64.zip` (Intel Mac)
- `Sonomika-1.0.0-arm64.zip` (Apple Silicon Mac)

**Inside the ZIP:**
```
Sonomika.app/          ← This is a folder, but macOS treats it as an app
  ├── Contents/
  │   ├── MacOS/
  │   │   └── Sonomika      ← The actual executable
  │   ├── Resources/        ← App resources, icons, etc.
  │   └── Info.plist        ← App metadata
  └── ...other files
```

### DMG Files (Installer)
- `Sonomika-1.0.0-x64.dmg`
- `Sonomika-1.0.0-arm64.dmg`

DMG files are disk images that mount when opened, showing the app to drag to Applications.

## How to Use the Standalone ZIP

1. **Download** the ZIP file
2. **Extract** it (double-click the ZIP)
3. **Double-click** `Sonomika.app` - it will launch immediately
4. **No installation needed** - it runs from anywhere

Even though `Sonomika.app` appears as a folder if you right-click it, **just double-click it** and it will run like any other macOS app.

## Comparison with Windows

| Platform | Format | What it is |
|----------|--------|------------|
| **Windows** | `.exe` | Single executable file |
| **macOS** | `.app` | Application bundle (folder) |
| **Linux** | AppImage/Deb | Various formats |

## Can you make a single file?

No - macOS doesn't support single-file executables for GUI applications. The `.app` bundle format is the standard and only way to distribute standalone macOS apps.

### Why bundles instead of single files?

- **Organization** - All resources (icons, assets, libraries) are neatly organized
- **Internationalization** - Easy to include multiple language files
- **Updating** - Can update specific parts without replacing everything
- **Security** - macOS can verify and sign the entire bundle
- **Integration** - macOS can read metadata (icons, file associations) easily

## Your App IS Standalone

The ZIP format you're already building **is the standalone version**:
- ✅ No installation required
- ✅ Can run from USB drive
- ✅ Can run from any folder
- ✅ No admin privileges needed (unless code signed issues)

The only difference from Windows portable is the format - macOS uses bundles, Windows uses executables.

