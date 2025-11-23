/**
 * AI Provider Template Interface
 * 
 * This interface defines the structure for AI provider templates that users can add.
 * Each template represents an AI service (OpenAI, Grok, Gemini, etc.) and contains
 * all the configuration needed to make API calls.
 */

export interface AIModel {
  value: string;
  label: string;
}

export interface AITemplate {
  /** Unique identifier for the provider (e.g., 'openai', 'grok', 'gemini') */
  id: string;
  
  /** Display name for the provider */
  name: string;
  
  /** Description of the provider */
  description: string;
  
  /** API endpoint URL for chat completions */
  apiEndpoint: string;
  
  /** Default model to use */
  defaultModel: string;
  
  /** Available models for this provider */
  models: AIModel[];
  
  /** Storage key prefix for API key (e.g., 'vj-ai-openai-api-key') */
  apiKeyStorageKey: string;
  
  /** Storage key prefix for model selection (e.g., 'vj-ai-openai-model') */
  modelStorageKey: string;
  
  /** Placeholder text for API key input */
  apiKeyPlaceholder: string;
  
  /** Pattern to detect if a model doesn't support temperature parameter */
  noTemperaturePattern?: RegExp;
  
  /** Default temperature value (if not specified in request) */
  defaultTemperature?: number;
  
  /** Function to build the request body for the API call */
  buildRequestBody: (params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
  }) => any;
  
  /** Function to build request headers */
  buildRequestHeaders: (apiKey: string) => Record<string, string>;
  
  /** Function to extract the generated text from the API response */
  extractResponseText: (responseData: any) => string;
  
  /** Function to extract error message from error response */
  extractErrorMessage?: (errorResponse: any, statusCode: number) => string;
}

