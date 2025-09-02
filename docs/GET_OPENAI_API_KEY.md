## Get an OpenAI (ChatGPT) API Key

This guide shows you how to create an OpenAI API key and use it in the app for AI-generated effects.

### 1) Create or sign in to your OpenAI account
- Visit the OpenAI platform and sign in: [OpenAI Platform](https://platform.openai.com/)

### 2) Ensure billing is enabled for API usage
- API access requires a valid payment method. Check or add one in: [Billing settings](https://platform.openai.com/account/billing)

### 3) Create a new API key
1. Go to: [API Keys](https://platform.openai.com/api-keys)
2. Click “Create new secret key”
3. Give it a name (for your own reference)
4. Copy the key (starts with `sk-...`). You will not be able to view it again

### 4) Add the key in the app
1. Open the app
2. Open Settings (title bar → Settings)
3. Find the “OpenAI API Key” field
4. Paste your key and click “Save Key”
5. Click “Test Connection” to verify

Notes:
- Keys are stored locally and encrypted using Electron safeStorage on this device
- Keys are never synced or uploaded by this app

### 5) Use the AI Effect Generator
1. Open the right panel → “AI Generator” tab
2. Describe the effect you want and click “Generate Effect”
3. Preview, tweak parameters, and save the effect

### Troubleshooting
- 401 Unauthorized: The key is invalid, expired, or lacks permissions → Create a new key on the [API Keys](https://platform.openai.com/api-keys) page
- Billing required: Add a payment method in [Billing settings](https://platform.openai.com/account/billing)
- Network errors: Check firewall/VPN/proxy; ensure `https://api.openai.com` is reachable
- Model access errors: Your account may not have access to a requested model → choose a supported model
- Rotation: Revoke compromised keys and create new ones on the [API Keys](https://platform.openai.com/api-keys) page

### Security Best Practices
- Treat your API key like a password; do not share it
- Do not paste keys into presets, logs, or commit them to Git
- Rotate keys periodically and immediately if exposed

If you need help, see the official docs: [OpenAI API documentation](https://platform.openai.com/docs/overview)




