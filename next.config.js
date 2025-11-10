/** @type {import('next').NextConfig} */
let nextConfig = {
  reactStrictMode: true,
  env: {
    // Convert boolean to string as Next.js requires all env values to be strings
    HAS_SERVER_DB_PRISMA: String(!!process.env.MONGODB_PRISMA_URL && !!process.env.MONGODB_URL_NON_POOLING),
    HAS_SERVER_KEYS_GOOGLE_CSE: String(!!process.env.GOOGLE_CLOUD_API_KEY && !!process.env.GOOGLE_CSE_ID),
    HAS_SERVER_KEY_ANTHROPIC: String(!!process.env.ANTHROPIC_API_KEY),
    HAS_SERVER_KEY_AZURE_OPENAI: String(!!process.env.AZURE_OPENAI_API_KEY && !!process.env.AZURE_OPENAI_API_ENDPOINT),
    HAS_SERVER_KEY_ELEVENLABS: String(!!process.env.ELEVENLABS_API_KEY),
    HAS_SERVER_KEY_OPENAI: String(!!process.env.OPENAI_API_KEY),
    HAS_SERVER_KEY_OPENROUTER: String(!!process.env.OPENROUTER_API_KEY),
    HAS_SERVER_KEY_PRODIA: String(!!process.env.PRODIA_API_KEY),
    // Pinecone configuration
    PINECONE_API_KEY: process.env.PINECONE_API_KEY || '',
    PINECONE_ASSISTANT_NAME: process.env.PINECONE_ASSISTANT_NAME || '',
  },
  webpack: (config, _options) => {
    // @mui/joy: anything material gets redirected to Joy
    config.resolve.alias['@mui/material'] = '@mui/joy';

    // @dqbd/tiktoken: enable asynchronous WebAssembly
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    return config;
  },
};

// conditionally enable the nextjs bundle analyzer
if (process.env.ANALYZE_BUNDLE)
  nextConfig = require('@next/bundle-analyzer')()(nextConfig);

module.exports = nextConfig;
