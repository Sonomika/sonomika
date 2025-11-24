/**
 * OpenAI Provider Template
 * 
 * Template for OpenAI's GPT models (GPT-4, GPT-3.5, etc.)
 */
const openaiTemplate = {
  id: 'openai',
  name: 'OpenAI (GPT)',
  description: 'OpenAI GPT models including GPT-4, GPT-3.5, and GPT-5',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  defaultModel: 'gpt-5-mini',
  models: [
    { value: 'gpt-5', label: 'gpt-5' },
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'o4-mini', label: 'o4-mini' },
  ],
  apiKeyStorageKey: 'vj-ai-openai-api-key',
  modelStorageKey: 'vj-ai-openai-model',
  apiKeyPlaceholder: 'sk-...',
  noTemperaturePattern: /^gpt-5/i,
  defaultTemperature: 0.7,
  
  buildRequestBody: (params) => {
    const body = {
      model: params.model,
      messages: params.messages,
    };
    
    // Some models (e.g., gpt-5) only support the default temperature
    if (!openaiTemplate.noTemperaturePattern?.test(params.model)) {
      body.temperature = params.temperature ?? openaiTemplate.defaultTemperature;
    }
    
    return body;
  },
  
  buildRequestHeaders: (apiKey) => ({
    'Authorization': `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  }),
  
  extractResponseText: (responseData) => {
    return responseData?.choices?.[0]?.message?.content || '';
  },
  
  extractErrorMessage: (errorResponse, statusCode) => {
    if (typeof errorResponse === 'string') {
      try {
        const parsed = JSON.parse(errorResponse);
        return parsed.error?.message || parsed.message || `OpenAI error ${statusCode}`;
      } catch {
        return `OpenAI error ${statusCode}: ${errorResponse}`;
      }
    }
    return errorResponse?.error?.message || errorResponse?.message || `OpenAI error ${statusCode}`;
  },
};

module.exports = openaiTemplate;
module.exports.default = openaiTemplate;

