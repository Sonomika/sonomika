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

  // Build request body
  const requestBody = template.buildRequestBody({
    model,
    messages,
    temperature: temperature ?? template.defaultTemperature,
  });

  // Build request headers
  const headers = template.buildRequestHeaders(apiKey);

  // Build URL (handle special cases like Gemini's query params)
  let url = template.apiEndpoint;
  if (url.includes('{model}')) {
    url = url.replace('{model}', model);
  }
  
  // Gemini uses query parameter for API key instead of Bearer token
  if (template.id === 'gemini') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}key=${encodeURIComponent(apiKey.trim())}`;
  }

  // Make the API call
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Error ${response.status}`;
    
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
    
    throw new Error(errorMessage);
  }

  const responseData = await response.json();
  return template.extractResponseText(responseData);
}

