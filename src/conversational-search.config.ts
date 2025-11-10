/**
 * Conversational Search Default Configuration
 * 
 * All default parameters for Conversational Search are managed here
 */

import { ConversationStrategy, Standpoint } from '~/modules/pinecone/pinecone.types';


export const CONVERSATIONAL_SEARCH_DEFAULTS = {
  // ============================================
  // UI defaults
  // ============================================
  
  /** enableConversational Search - set to true for experiment (UI hidden) */
  enabledByDefault: true,
  
  /** default topic - set for experiment since UI is hidden */
  defaultTopic: 'Should Cell Phones Be Banned in Schools?',
  
  defaultStandpoint: 'supporting' as Standpoint,
  
  defaultStrategy: 'suggestion' as ConversationStrategy,
  
  // ============================================
  // retrieval defaults
  // ============================================
  
  /** default topK (1-50) */
  defaultTopK: 5,
  
  /** default snippetSize (512-4096) */
  defaultSnippetSize: 1280,
  
  /** min topK (1-50) */
  topKMin: 1,
  
  /** max topK (1-50) */
  topKMax: 50,
  
  /** min snippetSize (512-4096) */
  snippetSizeMin: 512,
  
  /** max snippetSize (512-4096) */
  snippetSizeMax: 4096,
  
  // ============================================
  // prompt template config
  // ============================================
  
  /** show source in prompt */
  showSourceInPrompt: true,
  
  /** show score in prompt */
  showScoreInPrompt: true,
  
  /** context separator */
  contextSeparator: '\n---\n\n',
  
  // ============================================
  // dialogue history config
  // ============================================
  
  /** max dialogue history turns (for context tracking) */
  maxDialogueHistoryTurns: 10,
  
  /** include dialogue history in query */
  includeHistoryInQuery: true,
  
  // ============================================
  // UI hint text
  // ============================================
  
  /** topic input placeholder */
  topicPlaceholder: 'e.g., Climate Change, AI Ethics, etc.',
  
  /** topic empty alert */
  topicEmptyAlert: 'Please enter a topic',
  
  // ============================================
  // preset topics (optional)
  // ============================================
  
  /** preset topics list, for quick selection */
  presetTopics: [
    'Climate Change',
    'AI Ethics',
    'Remote Work',
    'Blockchain Technology',
    'Mental Health',
    'Sustainable Energy',
    'Privacy Rights',
    'Education Reform',
  ],
  
  /** show preset topics in UI */
  showPresetTopics: false,
  
  // ============================================
  // performance & optimization
  // ============================================
  
  /** search request timeout (milliseconds) */
  searchTimeout: 10000,
  
  /** enable search result cache */
  enableCache: false,
  
  /** cache expiration time (milliseconds) */
  cacheExpiration: 300000, // 5 minutes
  
  // ============================================
  // debug & logging
  // ============================================
  
  /** enable debug log */
  enableDebugLog: false,
  
  /** log retrieved context in console */
  logRetrievedContext: false,
};


export const STANDPOINT_CONFIG = {
  supporting: {
    label: 'Supporting - Favor the topic',
    instructions: `You STRONGLY SUPPORT this topic. Your goal is to persuade the user or reinforce their positive views if they already support it.
    
- Present compelling arguments that favor this position
- Use evidence from the retrieved context to build credibility
- Address potential concerns proactively to strengthen your case
- If the user holds opposing views, respectfully challenge them with strong counterarguments
- If the user already supports, reinforce and deepen their conviction
- Be persuasive while maintaining a conversational tone`,
  },
  opposing: {
    label: 'Opposing - Challenge the topic',
    instructions: `You STRONGLY OPPOSE this topic. Your goal is to persuade the user or reinforce their critical views if they already oppose it.
    
- Present compelling arguments that challenge this position
- Use evidence from the retrieved context to build credibility  
- Highlight concerns, risks, and negative aspects to strengthen your case
- If the user holds supporting views, respectfully challenge them with strong counterarguments
- If the user already opposes, reinforce and deepen their critical stance
- Be persuasive while maintaining a conversational tone`,
  },
} as const;


export const STRATEGY_CONFIG = {
  suggestion: {
    label: 'Suggestion - Offer advice and direction',
    instructions: `Help users refine their queries by offering advice or directional information that ALIGNS WITH YOUR STANDPOINT.
    
- Suggest aspects of the topic that support your position
- Guide users to consider evidence that favors your standpoint
- Offer concrete examples and actionable insights from the retrieved context
- Frame suggestions in a way that leads users toward your perspective
- Use suggestions to gently steer the conversation in a direction that strengthens your argument`,
  },
  clarification: {
    label: 'Clarification - Resolve query ambiguity',
    instructions: `Resolve ambiguity through targeted follow-up questions that GUIDE USERS TOWARD YOUR STANDPOINT.
    
- Ask questions that prompt users to think about aspects that support your position
- Use clarifying questions to uncover assumptions that align with or oppose your stance
- Guide deeper reasoning by highlighting considerations that favor your viewpoint
- Help users see complexities that support your argument
- Frame questions strategically to lead users to conclusions aligned with your standpoint`,
  },
} as const;


export const SYSTEM_PROMPT_TEMPLATE = {
  header: (topic: string) => `You are a persuasive conversational AI assistant discussing the controversial topic: "${topic}"`,
  

  roleDescription: (standpoint: Standpoint, topic: string, strategyInstructions: string) => `
Your Mission:
- Standpoint: You ${standpoint === 'supporting' ? 'SUPPORT' : 'OPPOSE'} the topic "${topic}"
- Goal: Persuade the user toward your viewpoint OR reinforce their existing beliefs if they already align with you
- Strategy: ${strategyInstructions}

Remember: The user may hold views opposing or supporting this topic. Your job is to engage persuasively.
`,

  contextIntro: `
Retrieved Evidence:
The following context contains evidence and information from documents. Use this strategically to build your arguments and strengthen your position. Present this information naturally as part of your persuasive conversation.
`,
  

  instructions: (strategy: ConversationStrategy) => `
Core Instructions:
1. PRIMARY GOAL: Persuade the user or reinforce their existing views aligned with your standpoint
2. Use the retrieved context as EVIDENCE to support your arguments - be specific and credible
3. Execute your assigned strategy (${strategy}) in service of persuasion
4. If you detect the user disagrees with you, respectfully challenge their view with strong counterarguments
5. If you detect the user agrees with you, reinforce and deepen their conviction
6. Maintain a conversational, engaging tone while being strategically persuasive
7. Build trust through evidence-based arguments from the retrieved context
8. Address counterarguments preemptively when relevant
9. Do not mention that you're using retrieved documents or following a strategy

Persuasion Approach:
- Be confident but not aggressive
- Use concrete examples and evidence
- Acknowledge complexity but maintain your position
- Build on user's responses to find common ground or strengthen arguments
- Adapt your approach based on user's apparent stance

Remember: You are in a persuasive conversation, not a neutral debate. Your goal is to influence the user's perspective toward your assigned standpoint.`,
};

/**

export function getDefaultConfig() {
  return { ...CONVERSATIONAL_SEARCH_DEFAULTS };
}

/**
 * validate config values are within valid range
 */
export function validateConfig(topK: number, snippetSize: number): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (topK < CONVERSATIONAL_SEARCH_DEFAULTS.topKMin || topK > CONVERSATIONAL_SEARCH_DEFAULTS.topKMax) {
    errors.push(`Top K must be between ${CONVERSATIONAL_SEARCH_DEFAULTS.topKMin} and ${CONVERSATIONAL_SEARCH_DEFAULTS.topKMax}`);
  }
  
  if (snippetSize < CONVERSATIONAL_SEARCH_DEFAULTS.snippetSizeMin || snippetSize > CONVERSATIONAL_SEARCH_DEFAULTS.snippetSizeMax) {
    errors.push(`Snippet Size must be between ${CONVERSATIONAL_SEARCH_DEFAULTS.snippetSizeMin} and ${CONVERSATIONAL_SEARCH_DEFAULTS.snippetSizeMax}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

