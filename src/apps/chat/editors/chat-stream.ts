import { SystemPurposeId } from '../../../data';
import { DLLMId } from '~/modules/llms/store-llms';
import { autoSuggestions } from '~/modules/aifn/autosuggestions/autoSuggestions';
import { autoTitle } from '~/modules/aifn/autotitle/autoTitle';
import { speakText } from '~/modules/elevenlabs/elevenlabs.client';
import { streamChat } from '~/modules/llms/transports/streamChat';
import { useElevenlabsStore } from '~/modules/elevenlabs/store-elevenlabs';

import { DMessage, useChatStore } from '~/common/state/store-chats';

import { createAssistantTypingMessage, updatePurposeInHistory } from './editors';
import { processUserMessageWithSearch, prepareHistoryWithSearchContext, updateSearchHistory } from '~/modules/pinecone/chat-integration';
import { useConversationalSearchStore } from '~/modules/pinecone/store-conversational-search';


/**
 * The main "chat" function. TODO: this is here so we can soon move it to the data model.
 */
export async function runAssistantUpdatingState(conversationId: string, history: DMessage[], assistantLlmId: DLLMId, systemPurpose: SystemPurposeId, _autoTitle: boolean, enableFollowUps: boolean) {

  // Get the last user message for search
  const lastUserMessage = history.length > 0 && history[history.length - 1].role === 'user' 
    ? history[history.length - 1].text 
    : '';

  // Create a blank and 'typing' message for the assistant IMMEDIATELY
  // This gives instant feedback to the user while search happens in background
  const assistantMessageId = createAssistantTypingMessage(conversationId, assistantLlmId, systemPurpose, 'Searching...');

  // When an abort controller is set, the UI switches to the "stop" mode
  const controller = new AbortController();
  const { startTyping, editMessage } = useChatStore.getState();
  startTyping(conversationId, controller);

  // Now try to enhance with conversational search (in background while showing typing)
  let enhancedHistory = history;
  let assistantResponseText = '';
  let retrievedContext: any[] | undefined;
  
  if (lastUserMessage) {
    try {
      const searchResult = await processUserMessageWithSearch(lastUserMessage, history);
      
      if (searchResult.shouldEnhance && searchResult.enhancedSystemMessage) {
        // Use enhanced system message with retrieved context
        enhancedHistory = prepareHistoryWithSearchContext(
          history,
          searchResult.enhancedSystemMessage,
          systemPurpose
        );
        
        // Store retrieved context for later attachment to assistant message
        if (searchResult.context && searchResult.context.length > 0) {
          retrievedContext = searchResult.context.map(snippet => ({
            content: snippet.content,
            score: snippet.score,
            source: snippet.reference?.file?.name,
            pages: snippet.reference?.pages,
          }));
        }
      } else {
        // Fall back to normal system message update
        enhancedHistory = updatePurposeInHistory(conversationId, history, systemPurpose);
      }
    } catch (error) {
      console.error('Error in conversational search, falling back to normal mode:', error);
      enhancedHistory = updatePurposeInHistory(conversationId, history, systemPurpose);
    }
  } else {
    // No user message, use normal system message update
    enhancedHistory = updatePurposeInHistory(conversationId, history, systemPurpose);
  }

  // Update the assistant message purpose after search is complete
  if (enhancedHistory[0]?.purposeId) {
    editMessage(conversationId, assistantMessageId, { purposeId: enhancedHistory[0].purposeId }, false);
  }

  // stream the assistant's messages
  await streamAssistantMessage(assistantLlmId, enhancedHistory, controller.signal, (updatedMessage) => {
    editMessage(conversationId, assistantMessageId, updatedMessage, false);
    // Track assistant response for search history
    if (updatedMessage.text) {
      assistantResponseText = updatedMessage.text;
    }
  });

  // Attach retrieved context to the assistant message (if any)
  if (retrievedContext && retrievedContext.length > 0) {
    editMessage(conversationId, assistantMessageId, { retrievedContext }, false);
  }

  // Update conversational search history
  if (lastUserMessage && assistantResponseText) {
    updateSearchHistory(lastUserMessage, assistantResponseText);
  }

  // clear to send, again
  startTyping(conversationId, null);

  // auto-suggestions
  if (enableFollowUps)
    await autoSuggestions(conversationId, assistantMessageId);

  // update text, if needed
  if (_autoTitle)
    await autoTitle(conversationId);
}


async function streamAssistantMessage(
  llmId: DLLMId, history: DMessage[],
  abortSignal: AbortSignal,
  editMessage: (updatedMessage: Partial<DMessage>) => void,
) {

  // TTS: speak the first line, if configured
  const speakFirstLine = useElevenlabsStore.getState().elevenLabsAutoSpeak === 'firstLine';
  let firstLineSpoken = false;

  try {
    const messages = history.map(({ role, text }) => ({ role, content: text }));
    await streamChat(llmId, messages, abortSignal, (updatedMessage: Partial<DMessage>) => {
      // update the message in the store (and thus schedule a re-render)
      editMessage(updatedMessage);

      // 📢 TTS
      if (updatedMessage?.text && speakFirstLine && !firstLineSpoken) {
        let cutPoint = updatedMessage.text.lastIndexOf('\n');
        if (cutPoint < 0)
          cutPoint = updatedMessage.text.lastIndexOf('. ');
        if (cutPoint > 100 && cutPoint < 400) {
          firstLineSpoken = true;
          const firstParagraph = updatedMessage.text.substring(0, cutPoint);
          speakText(firstParagraph).then(() => false /* fire and forget, we don't want to stall this loop */);
        }
      }
    });
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error('Fetch request error:', error);
      // TODO: show an error to the UI?
    }
  }

  // finally, stop the typing animation
  editMessage({ typing: false });
}