/**
 * Google Gemini Provider Template
 * 
 * Template for Google's Gemini models
 */
const geminiTemplate = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Google Gemini models (Gemini Pro, Gemini Ultra, etc.)',
  apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
  defaultModel: 'gemini-pro',
  models: [
    { value: 'gemini-pro', label: 'Gemini Pro' },
    { value: 'gemini-ultra', label: 'Gemini Ultra' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  apiKeyStorageKey: 'vj-ai-gemini-api-key',
  modelStorageKey: 'vj-ai-gemini-model',
  apiKeyPlaceholder: 'AIza...',
  defaultTemperature: 0.7,
  
  buildRequestBody: (params) => {
    // Gemini uses a different format - convert messages to content
    const contentParts = params.messages
      .filter(msg => msg.role === 'user')
      .map(msg => ({ text: msg.content }));
    
    return {
      contents: [{
        parts: contentParts,
      }],
      generationConfig: {
        temperature: params.temperature ?? geminiTemplate.defaultTemperature,
      },
    };
  },
  
  buildRequestHeaders: () => ({
    'Content-Type': 'application/json',
  }),
  
  extractResponseText: (responseData) => {
    // Gemini response structure is different
    return responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  },
  
  extractErrorMessage: (errorResponse, statusCode) => {
    if (typeof errorResponse === 'string') {
      try {
        const parsed = JSON.parse(errorResponse);
        return parsed.error?.message || parsed.message || `Gemini error ${statusCode}`;
      } catch {
        return `Gemini error ${statusCode}: ${errorResponse}`;
      }
    }
    return errorResponse?.error?.message || errorResponse?.message || `Gemini error ${statusCode}`;
  },
};

module.exports = geminiTemplate;
module.exports.default = geminiTemplate;

