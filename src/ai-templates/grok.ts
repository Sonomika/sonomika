import { AITemplate } from '../types/aiTemplate';

/**
 * Grok Provider Template (xAI)
 * 
 * Template for xAI's Grok models
 */
const grokTemplate: AITemplate = {
  id: 'grok',
  name: 'Grok (xAI)',
  description: 'xAI Grok models via API',
  apiEndpoint: 'https://api.x.ai/v1/chat/completions',
  defaultModel: 'grok-2',
  models: [
    { value: 'grok-2', label: 'grok-2' },
    { value: 'grok-beta', label: 'grok-beta' },
  ],
  apiKeyStorageKey: 'vj-ai-grok-api-key',
  modelStorageKey: 'vj-ai-grok-model',
  apiKeyPlaceholder: 'xai-...',
  defaultTemperature: 0.7,
  
  buildRequestBody: (params) => ({
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? grokTemplate.defaultTemperature,
  }),
  
  buildRequestHeaders: (apiKey: string) => ({
    'Authorization': `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  }),
  
  extractResponseText: (responseData: any) => {
    return responseData?.choices?.[0]?.message?.content || '';
  },
  
  extractErrorMessage: (errorResponse: any, statusCode: number) => {
    if (typeof errorResponse === 'string') {
      try {
        const parsed = JSON.parse(errorResponse);
        return parsed.error?.message || parsed.message || `Grok error ${statusCode}`;
      } catch {
        return `Grok error ${statusCode}: ${errorResponse}`;
      }
    }
    return errorResponse?.error?.message || errorResponse?.message || `Grok error ${statusCode}`;
  },
};

export default grokTemplate;

