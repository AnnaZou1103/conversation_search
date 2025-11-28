import { fileSave } from 'browser-fs-access';

import { defaultSystemPurposeId, SystemPurposeId, SystemPurposes } from '../../../data';

import { DModelSource, useModelsStore } from '~/modules/llms/store-llms';

import { DConversation, DMessage, useChatStore } from '~/common/state/store-chats';
import { ConversationStats } from '~/modules/pinecone/pinecone.types';
import { prettyBaseModel } from '~/common/util/modelUtils';

import { ImportedOutcome } from './import/ImportOutcomeModal';


/**
 * Restores all conversations in a JSON
 *  - supports both ExportedConversationJsonV1, and ExportedAllJsonV1 files
 */
export function loadAllConversationsFromJson(fileName: string, obj: any, outcome: ImportedOutcome) {
  // heuristics
  const hasConversations = obj.hasOwnProperty('conversations');
  const hasMessages = obj.hasOwnProperty('messages');

  // parse ExportedAllJsonV1
  if (hasConversations && !hasMessages) {
    const payload = obj as ExportedAllJsonV1;
    for (let conversation of payload.conversations)
      pushOutcomeFromJsonV1(fileName, conversation, outcome);
  }
  // parse ExportedConversationJsonV1
  else if (hasMessages && !hasConversations) {
    pushOutcomeFromJsonV1(fileName, obj as ExportedConversationJsonV1, outcome);
  }
  // invalid
  else {
    outcome.conversations.push({ success: false, fileName, error: `Invalid file: ${fileName}` });
  }
}

function pushOutcomeFromJsonV1(fileName: string, part: ExportedConversationJsonV1, outcome: ImportedOutcome) {
  const restored = createConversationFromJsonV1(part);
  if (!restored)
    outcome.conversations.push({ success: false, fileName, error: `Invalid conversation: ${part.id}` });
  else
    outcome.conversations.push({ success: true, fileName, conversation: restored });
}

 
// NOTE: the tokenCount was removed while still in the JsonV1 format, so here we add it back, for backwards compat
export function createConversationFromJsonV1(part: ExportedConversationJsonV1 & { tokenCount?: number }) {
  if (!part || !part.id || !part.messages)
    return null;
  const restored: DConversation = {
    id: part.id,
    messages: part.messages,
    ...(part.userTitle && { userTitle: part.userTitle }),
    ...(part.autoTitle && { autoTitle: part.autoTitle }),
    ...(part.studyId && { studyId: part.studyId }),
    ...(part.searchTopic && { searchTopic: part.searchTopic }),
    ...(part.standpoint && { standpoint: part.standpoint as any }),
    ...(part.strategy && { strategy: part.strategy as any }),
    ...(part.stats && { stats: part.stats }),
    ...(part.phase && { phase: part.phase }),
    tokenCount: part.tokenCount || 0,
    created: part.created || Date.now(),
    updated: part.updated || Date.now(),
    // add these back - these fields are not exported
    abortController: null,
    ephemerals: [],
  };
  return restored;
}


/**
 * Download all conversations as a JSON file, for backup and future restore
 * @throws {Error} if the user closes the dialog, or file could not be saved
 */
export async function downloadAllConversationsJson() {
  // conversations and
  const filtered_conversation = useChatStore.getState().conversations.filter((conversation: DConversation): boolean => conversation.conversationId == undefined);
  const payload: ExportedAllJsonV1 = {
    conversations: filtered_conversation.map(conversationToJsonV1),
    models: { sources: useModelsStore.getState().sources },
  };
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });

  // link to begin the download
  const isoDate = new Date().toISOString().replace(/:/g, '-');
  await fileSave(blob, { fileName: `conversations-${isoDate}.json`, extensions: ['.json'] });
}


/**
 * Download a conversation as a JSON file, for backup and future restore
 * @throws {Error} if the user closes the dialog, or file could not be saved
 */
export async function downloadConversationJson(conversation: DConversation) {
  // remove fields from the export
  const exportableConversation: ExportedConversationJsonV1 = conversationToJsonV1(conversation);
  const json = JSON.stringify(exportableConversation, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // link to begin the download
  await fileSave(blob, { fileName: `conversation-${conversation.id}.json`, extensions: ['.json'] });
}

export function conversationToJsonV1(_conversation: DConversation): ExportedConversationJsonV1 {
  // remove fields from the export
  const { abortController, ephemerals, tokenCount, ...conversation } = _conversation;
  return conversation;
}


/**
 * Primitive rendering of a Conversation to Markdown
 */
export function conversationToMarkdown(conversation: DConversation, hideSystemMessage: boolean): string {

  // const title =
  //   `# ${conversation.manual/auto/name || 'Conversation'}\n` +
  //   (new Date(conversation.created)).toLocaleString() + '\n\n';

  return conversation.messages.filter(message => !hideSystemMessage || message.role !== 'system').map(message => {
    let sender: string = message.sender;
    let text = message.text;
    switch (message.role) {
      case 'system':
        sender = '✨ System message';
        text = '<img src="https://i.giphy.com/media/jJxaUysjzO9ri/giphy.webp" width="48" height="48" alt="typing fast meme"/>\n\n' + '*' + text + '*';
        break;
      case 'assistant':
        const purpose = message.purposeId || null;
        sender = `${purpose || 'Assistant'} · *${prettyBaseModel(message.originLLM || '')}*`.trim();
        if (purpose && purpose in SystemPurposes)
          sender = `${SystemPurposes[purpose]?.symbol || ''} ${sender}`.trim();
        break;
      case 'user':
        sender = '👤 You';
        break;
    }
    return `### ${sender}\n\n${text}\n\n`;
  }).join('---\n\n');

}


/// do not change these - consider people's backups

type ExportedConversationJsonV1 = {
  id: string;
  messages: DMessage[];  // Includes system message (role='system')
  userTitle?: string;
  autoTitle?: string;
  studyId?: string;      // Study ID - associated with conversations for research tracking
  searchTopic?: string;
  standpoint?: string;
  strategy?: string;
  stats?: ConversationStats;
  phase?: 'dialogue' | 'memo';  // Conversation phase
  created: number;
  updated: number | null;
}

type ExportedAllJsonV1 = {
  conversations: ExportedConversationJsonV1[];
  models: { sources: DModelSource[] };
}