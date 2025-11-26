/**
 * AI API Caller
 * 
 * Utility function to make API calls using any AI template
 */

import { AITemplate } from '../types/aiTemplate';

export interface AIGenerateParams {
  template: AITemplate;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
}

export async function callAIAPI(params: AIGenerateParams): Promise<string> {
  const { template, apiKey, model, messages, temperature } = params;

  // Normalize model name - remove any accidental "models/" prefix
  let normalizedModel = String(model || '').trim();
  if (normalizedModel.startsWith('models/')) {
    normalizedModel = normalizedModel.replace(/^models\//, '');
    console.warn(`[AIApiCaller] Removed "models/" prefix from model name: ${model} -> ${normalizedModel}`);
  }

  // Auto-fix for deprecated Gemini 1.5 models (which are no longer available in some accounts)
  // This handles cases where the user's local storage or template file still references old models
  if (template.id === 'gemini') {
    if (normalizedModel === 'gemini-1.5-flash' || normalizedModel === 'gemini-pro') {
      console.warn(`[AIApiCaller] Model "${normalizedModel}" is deprecated. Auto-switching to "gemini-2.5-flash".`);
      normalizedModel = 'gemini-2.5-flash';
    } else if (normalizedModel === 'gemini-1.5-pro') {
      console.warn(`[AIApiCaller] Model "${normalizedModel}" is deprecated. Auto-switching to "gemini-2.5-pro".`);
      normalizedModel = 'gemini-2.5-pro';
    }
  }

  // Build request body
  const requestBody = template.buildRequestBody({
    model: normalizedModel,
    messages,
    temperature: temperature ?? template.defaultTemperature,
  });

  // Build request headers
  const headers = template.buildRequestHeaders(apiKey);

  // Build URL
  let url = template.apiEndpoint;
  if (url.includes('{model}')) {
    url = url.replace('{model}', normalizedModel);
  }

  // Log the final URL for debugging
  console.log(`[AIApiCaller] Making request to ${template.name}:`, {
    url: url, // URL doesn't contain API key (using header auth)
    model: normalizedModel,
    messageCount: messages.length,
  });

  // Make the API call
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Error ${response.status}`;
    
    // Log the error details for debugging
    console.error(`[AIApiCaller] ${template.name} API error:`, {
      status: response.status,
      statusText: response.statusText,
      url: url, // URL doesn't contain API key (using header auth)
      model: normalizedModel,
      errorText: errorText.substring(0, 500), // Limit log size
    });
    
    if (template.extractErrorMessage) {
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = template.extractErrorMessage(errorData, response.status);
      } catch {
        errorMessage = template.extractErrorMessage(errorText, response.status);
      }
    } else {
      errorMessage = `${template.name} error ${response.status}: ${errorText}`;
    }
    
    // Add helpful context for common errors
    if (response.status === 404 && template.id === 'gemini') {
      errorMessage += `\n\nTip: The model "${normalizedModel}" may not be available. ` +
        `Check available models at: https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY`;
    }
    
    throw new Error(errorMessage);
  }

  const responseData = await response.json();
  return template.extractResponseText(responseData);
}

