import { DLLMId } from '~/modules/llms/store-llms';
import { SystemPurposeId, SystemPurposes } from '../../../data';

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
  const systemMessageIndex = history.findIndex(m => m.role === 'system');
  const systemMessage: DMessage = systemMessageIndex >= 0 ? history.splice(systemMessageIndex, 1)[0] : createDMessage('system', '');
  
  // Use system purpose message if no system message exists yet
  if (!systemMessage.updated && !systemMessage.text) {
    const { defaultSystemPurposeId } = require('../../../data') as { defaultSystemPurposeId: SystemPurposeId };
    const purpose = SystemPurposes[defaultSystemPurposeId as SystemPurposeId];
    console.log('[Chat] updatePurposeInHistory: setting system message', { defaultSystemPurposeId, hasPurpose: !!purpose });
    if (purpose) {
      systemMessage.text = purpose.systemMessage.replaceAll('{{Today}}', new Date().toISOString().split('T')[0]);
      systemMessage.purposeId = defaultSystemPurposeId;
      console.log('[Chat] updatePurposeInHistory: system message set', { textLength: systemMessage.text.length, purposeId: systemMessage.purposeId });
    } else {
      // Fallback to FALLBACK_SYSTEM_PROMPT if purpose not found
      const { FALLBACK_SYSTEM_PROMPT } = require('~/conversational-search.config');
      systemMessage.text = FALLBACK_SYSTEM_PROMPT.replaceAll('{{Today}}', new Date().toISOString().split('T')[0]);
      console.log('[Chat] updatePurposeInHistory: using fallback system prompt');
    }
  } else {
    console.log('[Chat] updatePurposeInHistory: system message already exists', { hasText: !!systemMessage.text, hasUpdated: !!systemMessage.updated });
  }
  
  history.unshift(systemMessage);
  // Don't call setMessages here as it will abort the current request
  // The history will be updated when the assistant message is streamed
  return history;
}