# Vite Dev Server Connection Fix

## Problem

When running `npm run dev:electron`, the Vite dev server was not accessible at `http://localhost:5173/`, showing `ERR_CONNECTION_REFUSED` errors. The server was binding to IPv6 (`[::1]:5173`) or a restricted interface, making it inaccessible via standard `localhost` connections.

## Solution

Update the Vite configuration to bind the dev server to all network interfaces (`0.0.0.0`) instead of a specific interface like `127.0.0.1` or `localhost`.

## Implementation

### Step 1: Locate the Vite Configuration File

Open `vite.config.ts` in the project root.

### Step 2: Update the Server Configuration

Find the `server` configuration object and change the `host` property:

**Before:**
```typescript
server: {
  host: '127.0.0.1',  // or 'localhost'
  port: 5173,
  strictPort: false,
},
```

**After:**
```typescript
server: {
  host: '0.0.0.0',
  port: 5173,
  strictPort: false,
},
```

### Step 3: Verify the Fix

1. Stop any running dev servers:
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force
   ```

2. Restart the dev server:
   ```bash
   npm run dev:electron
   ```

3. Verify the server is listening on all interfaces:
   ```powershell
   netstat -ano | findstr :5173
   ```
   
   You should see `TCP    0.0.0.0:5173` in the output, indicating it's bound to all interfaces.

4. Access the server at `http://localhost:5173/` - it should now be accessible.

## Why This Works

- `0.0.0.0` binds the server to all available network interfaces (IPv4)
- This makes the server accessible via:
  - `localhost`
  - `127.0.0.1`
  - Your machine's local IP address
  - Works with both IPv4 and IPv6 connections

## Alternative Solutions (Not Recommended)

- Using `localhost` or `127.0.0.1` can cause issues on some systems where IPv6 is preferred
- Using `true` as the host value also works but `0.0.0.0` is more explicit and cross-platform compatible

## Notes

- This change is persistent and will work for all future dev server runs
- The fix applies to the Electron development workflow (`npm run dev:electron`)
- Production builds are not affected by this configuration

