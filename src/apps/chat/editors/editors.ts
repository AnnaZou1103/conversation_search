import { DLLMId } from '~/modules/llms/store-llms';
import { SystemPurposeId, SystemPurposes } from '../../../data';
import { STANDPOINT_CONFIG, STRATEGY_CONFIG, FALLBACK_SYSTEM_PROMPT, SERVICE_ASSISTANT_PROMPT, STANDPOINT_CONCEALMENT_RULE } from '~/conversational-search.config';

import { createDMessage, DMessage, useChatStore } from '~/common/state/store-chats';


export function createAssistantTypingMessage(conversationId: string, assistantLlmLabel: DLLMId | 'prodia' | 'react-...' | string, assistantPurposeId: SystemPurposeId | undefined, text: string): string {
  const assistantMessage: DMessage = createDMessage('assistant', text);
  assistantMessage.typing = true;
  assistantMessage.purposeId = assistantPurposeId;
  assistantMessage.originLLM = assistantLlmLabel;
  useChatStore.getState().appendMessage(conversationId, assistantMessage);
  return assistantMessage.id;
}


export function updatePurposeInHistory(conversationId: string, history: DMessage[]): DMessage[] {
  // Create a copy of history to avoid mutating the original array
  const historyCopy = [...history];
  const systemMessageIndex = historyCopy.findIndex(m => m.role === 'system');
  const systemMessage: DMessage = systemMessageIndex >= 0 ? historyCopy.splice(systemMessageIndex, 1)[0] : createDMessage('system', '');
  
  // Get conversation configuration
  const conversation = useChatStore.getState().conversations.find(c => c.id === conversationId);
  const topic = conversation?.searchTopic;
  const standpoint = conversation?.standpoint;
  const strategy = conversation?.strategy;
  const phase = conversation?.phase || 'dialogue';
  
  console.log('[Chat] updatePurposeInHistory: conversation config', { 
    conversationId, 
    topic, 
    standpoint, 
    strategy,
    phase,
    hasConversation: !!conversation,
    historyLength: history.length,
    historyCopyLength: historyCopy.length,
    hasSystemMessage: systemMessageIndex >= 0,
    userMessages: history.filter(m => m.role === 'user').length
  });
  
  let systemPrompt: string;
  
  // Check phase: if memo phase, use service assistant prompt; otherwise use dialogue prompt
  if (phase === 'memo') {
    // Memo phase: use service assistant prompt
    systemPrompt = SERVICE_ASSISTANT_PROMPT;
    
    // Add topic if it exists
    if (topic) {
      systemPrompt = `Conversation Topic: ${topic}\n\n${systemPrompt}`;
    }
  } else {
    // Dialogue phase: build system prompt with: general task instruction → topic → standpoint → strategy → standpoint concealment rule
    let systemPromptParts: string[] = [];
    
    // Always add general task instruction first (FALLBACK_SYSTEM_PROMPT)
    systemPromptParts.push(FALLBACK_SYSTEM_PROMPT);
    
    // Add topic if it exists
    if (topic) {
      systemPromptParts.push(`Conversation Topic: ${topic}`);
    }
    
    // Add standpoint instructions if it exists
    if (standpoint && STANDPOINT_CONFIG[standpoint]) {
      systemPromptParts.push(STANDPOINT_CONFIG[standpoint].instructions);
    }
    
    // Add strategy instructions if it exists
    if (strategy && STRATEGY_CONFIG[strategy]) {
      systemPromptParts.push(STRATEGY_CONFIG[strategy].instructions);
    }
    
    // Add unified standpoint concealment rule if either standpoint or strategy is configured
    if ((standpoint && STANDPOINT_CONFIG[standpoint]) || (strategy && STRATEGY_CONFIG[strategy])) {
      systemPromptParts.push(STANDPOINT_CONCEALMENT_RULE);
    }
    
    // Build the complete system prompt
    systemPrompt = systemPromptParts.join('\n\n');
  }
  
  // Replace date placeholder if present
  systemPrompt = systemPrompt.replaceAll('{{Today}}', new Date().toISOString().split('T')[0]);
  
  // Always update system message with the complete prompt
  systemMessage.text = systemPrompt;
  const { defaultSystemPurposeId } = require('../../../data') as { defaultSystemPurposeId: SystemPurposeId };
  systemMessage.purposeId = defaultSystemPurposeId;

  // Save initial system message if this is the first time with standpoint/strategy config
  if ((standpoint || strategy) && !conversation?.initialSystemMessage) {
    const initialSystemMessage = createDMessage('system', systemPrompt);
    initialSystemMessage.purposeId = defaultSystemPurposeId;

    // Save to conversation store
    useChatStore.getState()._editConversation(conversationId, {
      initialSystemMessage: initialSystemMessage
    });

    console.log('[Chat] Saved initial system message with standpoint/strategy config', {
      conversationId,
      hasStandpoint: !!standpoint,
      standpoint,
      hasStrategy: !!strategy,
      strategy,
      initialMessageLength: initialSystemMessage.text.length
    });
  }

  console.log('[Chat] updatePurposeInHistory: system message set', {
    phase,
    textLength: systemMessage.text.length,
    hasStandpoint: !!standpoint,
    standpointValue: standpoint,
    hasStrategy: !!strategy,
    strategyValue: strategy,
    hasTopic: !!topic,
    systemPromptPreview: systemPrompt.substring(0, 300)
  });

  historyCopy.unshift(systemMessage);
  // Don't call setMessages here as it will abort the current request
  // The history will be updated when the assistant message is streamed
  console.log('[Chat] updatePurposeInHistory: returning enhanced history', {
    totalLength: historyCopy.length,
    systemMessageText: systemMessage.text.substring(0, 100),
    userMessages: historyCopy.filter(m => m.role === 'user').length,
    assistantMessages: historyCopy.filter(m => m.role === 'assistant').length
  });
  return historyCopy;
}