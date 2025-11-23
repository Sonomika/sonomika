# AI Provider Templates

This directory contains templates for different AI providers. Each template defines how to interact with a specific AI service (OpenAI, Grok, Gemini, etc.).

## Adding a New AI Provider Template

To add support for a new AI provider, create a new TypeScript file in this directory following this structure:

```typescript
import { AITemplate } from '../types/aiTemplate';

const myProviderTemplate: AITemplate = {
  id: 'my-provider',                    // Unique identifier
  name: 'My Provider',                  // Display name
  description: 'Description of provider',
  apiEndpoint: 'https://api.example.com/v1/chat',  // API endpoint URL
  defaultModel: 'model-name',           // Default model to use
  models: [                             // Available models
    { value: 'model-name', label: 'Model Name' },
  ],
  apiKeyStorageKey: 'vj-ai-myprovider-api-key',    // Storage key for API key
  modelStorageKey: 'vj-ai-myprovider-model',       // Storage key for model
  apiKeyPlaceholder: 'key-...',         // Placeholder for API key input
  defaultTemperature: 0.7,              // Default temperature (optional)
  
  // Build the request body for API calls
  buildRequestBody: (params) => ({
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    // Add any provider-specific parameters here
  }),
  
  // Build request headers (usually includes Authorization)
  buildRequestHeaders: (apiKey: string) => ({
    'Authorization': `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  }),
  
  // Extract the generated text from API response
  extractResponseText: (responseData: any) => {
    return responseData?.choices?.[0]?.message?.content || '';
  },
  
  // Optional: Custom error message extraction
  extractErrorMessage: (errorResponse: any, statusCode: number) => {
    return errorResponse?.error?.message || `Error ${statusCode}`;
  },
};

export default myProviderTemplate;
```

### Special Cases

**For providers that use query parameters instead of Bearer tokens** (like Gemini):

The `AIApiCaller` utility automatically handles query parameter API keys for templates with `id === 'gemini'`. For other providers, you can modify the `apiEndpoint` to include `{model}` placeholder if needed, and handle the API key in your custom logic.

### Required Fields

- `id`: Unique identifier (lowercase, no spaces, e.g., 'openai', 'grok')
- `name`: Display name shown in Settings
- `apiEndpoint`: Full API endpoint URL
- `defaultModel`: Model to use by default
- `models`: Array of available models
- `buildRequestBody`: Function to build the request body
- `buildRequestHeaders`: Function to build request headers
- `extractResponseText`: Function to extract text from response

### Optional Fields

- `description`: Provider description shown in Settings
- `apiKeyPlaceholder`: Placeholder text for API key input
- `defaultTemperature`: Default temperature value
- `noTemperaturePattern`: Regex pattern to detect models that don't support temperature
- `extractErrorMessage`: Custom error message extraction

Once you create a template file, it will be automatically discovered and loaded when the app starts. Users can then select it from the Settings → AI Provider dropdown.

## User Templates (Editable)

**Templates are automatically copied to your Documents folder on first run!**

When the app starts, all templates from `src/ai-templates/` are copied to:
- **Windows**: `Documents/Sonomika/ai-templates/`
- **macOS/Linux**: `Documents/Sonomika/ai-templates/`

### Editing Templates

You can edit templates in the Documents folder to customize them:
1. Navigate to `Documents/Sonomika/ai-templates/`
2. Edit any `.js` file (or copy a `.ts` file and rename to `.js`)
3. Restart the app or reload templates

**Note**: User templates must be `.js` files (JavaScript), not TypeScript. If you copy a `.ts` file, remove type annotations or convert it to JavaScript.

### Template Loading Priority

1. **User templates** (from Documents folder) - loaded first, can override bundled templates
2. **Bundled templates** (from app source) - loaded if no user version exists

This means you can:
- Edit existing templates by modifying files in Documents folder
- Add new templates by creating `.js` files in Documents folder
- Override bundled templates with your own versions

