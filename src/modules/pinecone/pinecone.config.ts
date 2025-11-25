/**
 * Pinecone Configuration
 * Configure your Pinecone API key and assistant name here
 */

export const PINECONE_CONFIG = {
  apiKey: process.env.PINECONE_API_KEY || '',
  assistantName: process.env.PINECONE_ASSISTANT_NAME || 'conversation-search-assistant',
  // Default retrieval parameters
  defaultTopK: 10,
  defaultSnippetSize: 1280,
};

// Validate configuration
export function validatePineconeConfig(): boolean {
  if (!PINECONE_CONFIG.apiKey) {
    console.warn('Pinecone API key is not configured. Set PINECONE_API_KEY in your environment.');
    return false;
  }
  if (!PINECONE_CONFIG.assistantName) {
    console.warn('Pinecone assistant name is not configured. Set PINECONE_ASSISTANT_NAME in your environment.');
    return false;
  }
  return true;
}

// Check if Pinecone is enabled
export function isPineconeEnabled(): boolean {
  return !!PINECONE_CONFIG.apiKey && !!PINECONE_CONFIG.assistantName;
}

