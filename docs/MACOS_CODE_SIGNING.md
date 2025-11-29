# macOS Code Signing Setup for GitHub Actions

This guide explains how to set up code signing for your macOS Electron app builds in GitHub Actions.

## Why Code Signing?

- **Security**: Prevents "unidentified developer" warnings
- **Gatekeeper**: Allows users to open the app without right-clicking
- **Distribution**: Required for distributing outside the Mac App Store
- **Notarization**: Required for macOS Catalina 10.15+ (separate process)

## Prerequisites

1. **Apple Developer Account** (paid membership required)
   - Sign up at [developer.apple.com](https://developer.apple.com)
   - Cost: $99/year

2. **Mac computer** to export certificates (can be done once)

## Step 1: Create Certificates

### Option A: Using Xcode (Easiest)

1. Open Xcode
2. Go to **Xcode → Settings → Accounts**
3. Sign in with your Apple ID
4. Select your team and click **Manage Certificates**
5. Click the **+** button and select **Developer ID Application**
6. Certificate is automatically added to your Keychain

### Option B: Using Keychain Access

1. Open **Keychain Access** app
2. Go to **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**
3. Fill in your email and name
4. Select **Save to disk** and click Continue
5. Upload the `.certSigningRequest` file to Apple Developer Portal
6. Download and install the certificate

## Step 2: Export Certificate as .p12

1. Open **Keychain Access**
2. Find your **Developer ID Application** certificate
3. Expand it to see the private key
4. Select both the certificate and its private key
5. Right-click and select **Export 2 items...**
6. Save as `.p12` format
7. Set a password (you'll need this for GitHub Secrets)

## Step 3: Convert Certificate to Base64

On macOS Terminal:

```bash
base64 -i certificate.p12 -o certificate-base64.txt
```

Or copy directly:

```bash
base64 -i certificate.p12 | pbcopy
```

## Step 4: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New repository secret** and add:

   - **Name**: `APPLE_CERTIFICATE`
   - **Value**: Paste the base64-encoded certificate content
   
   - **Name**: `APPLE_CERTIFICATE_PASSWORD`
   - **Value**: The password you set when exporting the .p12 file
   
   - **Name**: `APPLE_KEYCHAIN_PASSWORD`
   - **Value**: A temporary password (e.g., `temp-keychain-password-123`)

## Step 5: Update package.json (Optional)

When you're ready to enable code signing, update `package.json`:

```json
"mac": {
  "hardenedRuntime": true,
  "gatekeeperAssess": true,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

You'll also need to create `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.debugger</key>
    <true/>
  </dict>
</plist>
```

## Building Without Code Signing

The workflow works fine without certificates. Users will see a security warning but can still run the app by:

1. Right-clicking the app
2. Selecting **Open**
3. Clicking **Open** in the security dialog

## Notarization (Advanced)

For macOS 10.15+, you may also want to notarize your app. This requires:

- App-specific password from Apple ID
- Notarization after building
- Additional GitHub Actions steps

See [electron-builder notarization docs](https://www.electron.build/code-signing#macos) for details.

## Troubleshooting

### "No identity found"
- Check that the certificate is in your Keychain
- Verify the certificate hasn't expired
- Ensure you're using "Developer ID Application" (not "Mac Development")

### Build fails with signing error
- Check GitHub Secrets are set correctly
- Verify base64 encoding is correct (no extra whitespace)
- Check certificate password is correct

### "Resource fork, Finder information, or similar detritus not allowed"
- This is a common DMG error
- The workflow handles this automatically
- If it persists, check file permissions

## Resources

- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [Apple Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
- [GitHub Actions macOS Runners](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners#supported-runners-and-hardware-resources)

