import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

import { DLLMId, useModelsStore } from '~/modules/llms/store-llms';
import { Standpoint, ConversationStrategy, ConversationStats } from '~/modules/pinecone/pinecone.types';

import { countModelTokens } from '../util/token-counter';
import { defaultSystemPurposeId, SystemPurposeId, SurveyQuestions, ChatBotType } from '../../data';
import { IDB_MIGRATION_INITIAL, idbStateStorage } from '../util/idbUtils';


/**
 * Conversation, a list of messages between humans and bots
 * Future:
 * - draftUserMessage?: { text: string; attachments: any[] };
 * - isMuted: boolean; isArchived: boolean; isStarred: boolean; participants: string[];
 */
export interface DConversation {
  id: string;
  messages: DMessage[];
  evaluationId?:string;
  conversationId?: string;
  userTitle?: string;
  autoTitle?: string;
  
  // Conversational search configuration
  searchTopic?: string;              // Topic for conversational search
  standpoint?: Standpoint;           // Chatbot's standpoint: 'supporting' or 'opposing'
  strategy?: ConversationStrategy;   // Conversation strategy: 'suggestion' or 'clarification'
  stats?: ConversationStats;         // Conversation statistics for research tracking
  
  tokenCount: number;                 // f(messages, llmId)
  created: number;                    // created timestamp
  updated: number | null;             // updated timestamp
  // Not persisted, used while in-memory, or temporarily by the UI
  abortController: AbortController | null;
  ephemerals: DEphemeral[];
}

export const initialmessage: DMessage = 
{id: uuidv4(),
  text:"Hello! I'm here to help you explore and learn about various topics through conversation. What would you like to discuss or learn more about today?",
  sender: 'Bot',
  avatar: null,
  typing: false,
  role: 'assistant',
  purposeId: defaultSystemPurposeId,
  tokenCount: 0,
  created: Date.now(),
  updated: null,
}


export function createDConversation(
  searchConfig?: {
    topic?: string;
    standpoint?: Standpoint;
    strategy?: ConversationStrategy;
  }
): DConversation {
  return {
    id: uuidv4(),
    messages: [],
    ...(searchConfig?.topic && { searchTopic: searchConfig.topic }),
    ...(searchConfig?.standpoint && { standpoint: searchConfig.standpoint }),
    ...(searchConfig?.strategy && { strategy: searchConfig.strategy }),
    tokenCount: 0,
    created: Date.now(),
    updated: Date.now(),
    abortController: null,
    ephemerals: [],
  };
}

export function createDEvaluation(
  conversationId: string,
  searchConfig?: {
    topic?: string;
    standpoint?: Standpoint;
    strategy?: ConversationStrategy;
  }
): DConversation {
  return {
    id: uuidv4(),
    messages: [SurveyQuestions[0], SurveyQuestions[1]],
    conversationId: conversationId,
    ...(searchConfig?.topic && { searchTopic: searchConfig.topic }),
    ...(searchConfig?.standpoint && { standpoint: searchConfig.standpoint }),
    ...(searchConfig?.strategy && { strategy: searchConfig.strategy }),
    tokenCount: 0,
    created: Date.now(),
    updated: Date.now(),
    abortController: null,
    ephemerals: [],
  };
}

const defaultConversations: DConversation[] = [createDConversation()];

/**
 * Message, sent or received, by humans or bots
 *
 * Other ideas:
 * - attachments?: {type: string; url: string; thumbnailUrl?: string; size?: number}[];
 * - isPinned?: boolean;
 * - reactions?: {type: string; count: number; users: string[]}[];
 * - status: 'sent' | 'delivered' | 'read' | 'failed';
 */
export interface DMessage {
  id: string;
  text: string;
  sender: 'You' | 'Bot' | string;   // pretty name
  avatar: string | null;            // null, or image url
  typing: boolean;
  role: 'assistant' | 'system' | 'user';

  purposeId?: SystemPurposeId;      // only assistant/system
  originLLM?: string;               // only assistant - model that generated this message, goes beyond known models
  choices?: string[];
  selected?: string;

  // Retrieved context snippets from Pinecone (only for assistant messages with search enabled)
  // Can be:
  // - Array of context objects: search successful with results
  // - Array with special marker: search successful but no results found
  // - undefined: search not performed or error occurred
  retrievedContext?: Array<{
    content: string;              // snippet content
    score: number;                // relevance score
    source?: string;              // file name
    pages?: number[];             // page numbers if applicable
    isNoResultMarker?: boolean;   // true if this is a "no results found" marker
  }>;

  tokenCount: number;               // cache for token count, using the current Conversation model (0 = not yet calculated)

  created: number;                  // created timestamp
  updated: number | null;           // updated timestamp
}

export function createDMessage(role: DMessage['role'], text: string): DMessage {
  return {
    id: uuidv4(),
    text,
    sender: role === 'user' ? 'You' : 'Bot',
    avatar: null,
    typing: false,
    role: role,
    tokenCount: 0,
    created: Date.now(),
    updated: null,
  };
}

/**
 * InterimStep, a place side-channel information is displayed
 */
export interface DEphemeral {
  id: string;
  title: string;
  text: string;
  state: object;
}

export function createDEphemeral(title: string, initialText: string): DEphemeral {
  return {
    id: uuidv4(),
    title: title,
    text: initialText,
    state: {},
  };
}


/// Conversations Store

interface ChatState {
  conversations: DConversation[];
  activeConversationId: string | null;
  activeEvaluationId: string | null;
  isEvaluationCompleted: boolean;
}

interface ChatActions {
  // store setters
  createConversation: () => void;
  createEvaluation: () => void;
  duplicateConversation: (conversationId: string) => void;
  importConversation: (conversation: DConversation, preventClash: boolean) => void;
  deleteConversation: (conversationId: string) => void;
  deleteAllConversations: () => void;
  setActiveConversationId: (conversationId: string) => void;
  setActiveEvaluationId: (conversationId: string|null) => void;
  setEvaluationStatus: (evaluationStatus: boolean) => void;


  // within a conversation
  startTyping: (conversationId: string, abortController: AbortController | null) => void;
  stopTyping: (conversationId: string) => void;
  setMessages: (conversationId: string, messages: DMessage[]) => void;
  appendMessage: (conversationId: string, message: DMessage) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  editMessage: (conversationId: string, messageId: string, updatedMessage: Partial<DMessage>, touch: boolean) => void;
  setAutoTitle: (conversationId: string, autoTitle: string) => void;
  setUserTitle: (conversationId: string, userTitle: string) => void;
  setSearchConfig: (conversationId: string, config: { topic?: string; standpoint?: Standpoint; strategy?: ConversationStrategy }) => void;
  getPairedQuestionId: (conversationId: string, messageId: string) => string;
  isConversation: (conversation: DConversation)=>boolean;
  setPairedEvaluationId:(conversationId: string, evaluationId: string)=>void;
  getPairedEvaluationId:(conversationId: string) => string;
  getConversationById:(conversationId: string) => DConversation|undefined;

  appendEphemeral: (conversationId: string, devTool: DEphemeral) => void;
  deleteEphemeral: (conversationId: string, ephemeralId: string) => void;
  updateEphemeralText: (conversationId: string, ephemeralId: string, text: string) => void;
  updateEphemeralState: (conversationId: string, ephemeralId: string, state: object) => void;

  // utility function
  _editConversation: (conversationId: string, update: Partial<DConversation> | ((conversation: DConversation) => Partial<DConversation>)) => void;
}

export const useChatStore = create<ChatState & ChatActions>()(devtools(
  persist(
    (set, get) => ({

      // default state
      conversations: defaultConversations,
      activeConversationId: defaultConversations[0].id,
      activeEvaluationId: null,
      isEvaluationCompleted: false,


      createConversation: () =>
        set(state => {
          // inherit some values from the active conversation (matches users' expectations)
          // const activeConversation = state.conversations.find((conversation: DConversation): boolean => conversation.id === state.activeConversationId);
          const conversation = createDConversation();

          return {
            conversations: [
              conversation,
              ...state.conversations,
            ],
            activeConversationId: conversation.id,
            activeEvaluationId: null,
            isEvaluationCompleted: false,
          };
        }),

      createEvaluation: () =>
        set(state => {
          // inherit some values from the active conversation (matches users' expectations)
          const activeConversation = state.conversations.find((conversation: DConversation): boolean => conversation.id === state.activeConversationId);
          if (activeConversation){
            const evaluation = createDEvaluation(activeConversation.id);
            state.setPairedEvaluationId(activeConversation.id, evaluation.id);
            return {
              conversations: [
                evaluation,
                ...state.conversations,
              ],
              activeConversationId: state.activeConversationId,
              activeEvaluationId: evaluation.id,
              isEvaluationCompleted: false
            };
          }else{
            return {}
          }
        }),

      duplicateConversation: (conversationId: string) =>
        set(state => {
          const conversation = state.conversations.find((conversation: DConversation): boolean => conversation.id === conversationId);
          if (!conversation)
            return {};

          // create a deep copy of the conversation
          const deepCopy: DConversation = JSON.parse(JSON.stringify(conversation));
          const duplicate: DConversation = {
            ...deepCopy,
            id: uuidv4(),
            messages: deepCopy.messages.map((message: DMessage): DMessage => ({
              ...message,
              id: uuidv4(),
              typing: false,
            })),
            evaluationId: undefined,
            updated: Date.now(),
            abortController: null,
            ephemerals: [],
          };

          return {
            conversations: [
              duplicate,
              ...state.conversations,
            ],
            activeConversationId: duplicate.id,
            activeEvaluationId: null,
            isEvaluationCompleted: false,
          };
        }),

      importConversation: (conversation: DConversation, preventClash) => {
        // if we're importing a conversation with the same id as an existing one, we need to change the id
        if (preventClash) {
          const exists = get().conversations.some(c => c.id === conversation.id);
          if (exists) {
            conversation.id = uuidv4();
            console.warn('Conversation ID clash, changing ID to', conversation.id);
          }
        }
        get().deleteConversation(conversation.id);
        set(state => {
          conversation.tokenCount = updateTokenCounts(conversation.messages, true, 'importConversation');
          return {
            // NOTE: the .filter below is superfluous (we delete the conversation above), but it's a reminder that we don't want to corrupt the state
            conversations: [
              conversation,
              ...state.conversations.filter((other: DConversation) => other.id !== conversation.id),
            ],
            activeConversationId: conversation.id,
            isEvaluationCompleted: false,
          };
        });
      },

      deleteConversation: (conversationId: string) =>
        set(state => {

          // abort any pending requests on this conversation
          const filtered_conversations = state.conversations.filter((conversation: DConversation): boolean => conversation.conversationId == undefined);
          const cIndex = filtered_conversations.findIndex((conversation: DConversation): boolean => conversation.id === conversationId);
          if (cIndex >= 0)
            filtered_conversations[cIndex].abortController?.abort();

          // remove from the list
          const conversations = state.conversations.filter((conversation: DConversation): boolean => conversation.id !== conversationId && conversation.conversationId !== conversationId);

          // update the active conversation to the next in list
          let activeConversationId = undefined;
          if (state.activeConversationId === conversationId && cIndex >= 0){
            if (cIndex<filtered_conversations.length-1){
              activeConversationId = filtered_conversations[cIndex+1].id;
            }else{
              activeConversationId = filtered_conversations[cIndex-1].id;
            }
          }else{
            activeConversationId = null;
          }

          return {
            conversations,
            ...(activeConversationId !== undefined ? { activeConversationId } : {}),
            activeEvaluationId: null,
            isEvaluationCompleted: false
          };
        }),

      deleteAllConversations: () => {
        set(state => {
          // inherit some values from the active conversation (matches users' expectations)
          // const activeConversation = state.conversations.find((conversation: DConversation): boolean => conversation.id === state.activeConversationId);
          const conversation = createDConversation();
          // const evaluation = createEvaluation(conversation.id,conversation.systemPurposeId);

          // abort any pending requests on all conversations
          state.conversations.forEach((conversation: DConversation) => conversation.abortController?.abort());

          // delete all, but be left with one
          return {
            conversations: [conversation],
            activeConversationId: conversation.id,
            activeEvaluationId: null,
            isEvaluationCompleted: false
          };
        });
      },

      isConversation:(conversation: DConversation)=>{
        return conversation.conversationId == undefined;
      },

      setActiveConversationId: (conversationId: string) =>        
      set({ activeConversationId: conversationId }),

      setActiveEvaluationId: (conversationId: string|null) =>        
      set({ activeEvaluationId: conversationId }),

      setEvaluationStatus: (evaluationStatus: boolean) => 
        set({isEvaluationCompleted: evaluationStatus}),

      setPairedEvaluationId: (conversationId: string, evaluationId: string) =>
        get()._editConversation(conversationId, convesation=>{
          convesation.evaluationId=evaluationId;
          return {
            evaluationId: evaluationId, updated: Date.now()
          }
        }
          ),

      getPairedQuestionId: (conversationId: string, messageId: string)=>{
        const conversation = get().conversations.find((conversation: DConversation): boolean => conversation.id === conversationId);
        if (conversation){
          for (let i=0; i<conversation.messages.length; i++){
            let message = conversation.messages[i];
            if (message.id == messageId){
              let question = conversation.messages[i-1];
              return question.id;
            }
          }
          return ''
        }else{
          return ''
        }
      },

      getPairedEvaluationId: (conversationId: string)=>{
        const conversation = get().conversations.find((conversation: DConversation): boolean => conversation.id === conversationId);
        if (conversation && conversation.evaluationId){
          return conversation.evaluationId
        }else{
          return ''
        }
      },

      getConversationById: (conversationId: string)=>{
        return get().conversations.find((conversation: DConversation): boolean => conversation.id === conversationId);
      },


      // within a conversation
      startTyping: (conversationId: string, abortController: AbortController | null) =>
        get()._editConversation(conversationId, () =>
          ({
            abortController: abortController,
          })),

      stopTyping: (conversationId: string) =>
        get()._editConversation(conversationId, conversation => {
          conversation.abortController?.abort();
          return {
            abortController: null,
          };
        }),

      setMessages: (conversationId: string, newMessages: DMessage[]) =>
        get()._editConversation(conversationId, conversation => {
          conversation.abortController?.abort();
          return {
            messages: newMessages,
            tokenCount: updateTokenCounts(newMessages, false, 'setMessages'),
            updated: Date.now(),
            abortController: null,
            ephemerals: [],
          };
        }),

      appendMessage: (conversationId: string, message: DMessage) =>
        get()._editConversation(conversationId, conversation => {

          if (!message.typing)
            updateTokenCounts([message], true, 'appendMessage');

          const messages = [...conversation.messages, message];

          return {
            messages,
            tokenCount: messages.reduce((sum, message) => sum + 4 + message.tokenCount || 0, 3),
            updated: Date.now(),
          };
        }),

      deleteMessage: (conversationId: string, messageId: string) =>
        get()._editConversation(conversationId, conversation => {

          const messages = conversation.messages.filter(message => message.id !== messageId);

          return {
            messages,
            tokenCount: messages.reduce((sum, message) => sum + 4 + message.tokenCount || 0, 3),
            updated: Date.now(),
          };
        }),

      editMessage: (conversationId: string, messageId: string, updatedMessage: Partial<DMessage>, setUpdated: boolean) =>
        get()._editConversation(conversationId, conversation => {

          const chatLLMId = useModelsStore.getState().chatLLMId;
          const messages = conversation.messages.map((message: DMessage): DMessage =>
            message.id === messageId
              ? {
                ...message,
                ...updatedMessage,
                ...(setUpdated && { updated: Date.now() }),
                ...(((updatedMessage.typing === false || !message.typing) && chatLLMId && {
                  tokenCount: countModelTokens(updatedMessage.text || message.text, chatLLMId, 'editMessage(typing=false)'),
                })),
              }
              : message);

          return {
            messages,
            tokenCount: messages.reduce((sum, message) => sum + 4 + message.tokenCount || 0, 3),
            ...(setUpdated && { updated: Date.now() }),
          };
        }),

      setAutoTitle: (conversationId: string, autoTitle: string) =>
        get()._editConversation(conversationId,
          {
            autoTitle,
          }),

      setUserTitle: (conversationId: string, userTitle: string) =>
        get()._editConversation(conversationId,
          {
            userTitle,
          }),

      setSearchConfig: (conversationId: string, config: { topic?: string; standpoint?: Standpoint; strategy?: ConversationStrategy }) =>
        get()._editConversation(conversationId,
          {
            ...(config.topic !== undefined && { searchTopic: config.topic }),
            ...(config.standpoint !== undefined && { standpoint: config.standpoint }),
            ...(config.strategy !== undefined && { strategy: config.strategy }),
          }),

      appendEphemeral: (conversationId: string, ephemeral: DEphemeral) =>
        get()._editConversation(conversationId, conversation => {
          const ephemerals = [...conversation.ephemerals, ephemeral];
          return {
            ephemerals,
          };
        }),

      deleteEphemeral: (conversationId: string, ephemeralId: string) =>
        get()._editConversation(conversationId, conversation => {
          const ephemerals = conversation.ephemerals?.filter((e: DEphemeral): boolean => e.id !== ephemeralId) || [];
          return {
            ephemerals,
          };
        }),

      updateEphemeralText: (conversationId: string, ephemeralId: string, text: string) =>
        get()._editConversation(conversationId, conversation => {
          const ephemerals = conversation.ephemerals?.map((e: DEphemeral): DEphemeral =>
            e.id === ephemeralId
              ? { ...e, text }
              : e) || [];
          return {
            ephemerals,
          };
        }),

      updateEphemeralState: (conversationId: string, ephemeralId: string, state: object) =>
        get()._editConversation(conversationId, conversation => {
          const ephemerals = conversation.ephemerals?.map((e: DEphemeral): DEphemeral =>
            e.id === ephemeralId
              ? { ...e, state: state }
              : e) || [];
          return {
            ephemerals,
          };
        }),

      _editConversation: (conversationId: string, update: Partial<DConversation> | ((conversation: DConversation) => Partial<DConversation>)) =>
        set(state => ({
          conversations: state.conversations.map((conversation: DConversation): DConversation =>
            conversation.id === conversationId
              ? {
                ...conversation,
                ...(typeof update === 'function' ? update(conversation) : update),
              }
              : conversation),
        })),

    }),
    {
      name: 'app-chats',
      /* Version history:
       *  - 1: [2023-03-18] App launch, single chat
       *  - 2: [2023-04-10] Multi-chat version - invalidating data to be sure
       *  - 3: [2023-09-19] Switch to IndexedDB - no data shape change,
       *                    but we swapped the backend (localStorage -> IndexedDB)
       */
      version: 3,
      storage: createJSONStorage(() => idbStateStorage),

      // Migrations
      migrate: (persistedState: unknown, fromVersion: number): ChatState & ChatActions => {
        // -1 -> 3: migration loading from localStorage to IndexedDB
        if (fromVersion === IDB_MIGRATION_INITIAL)
          return _migrateLocalStorageData() as any;

        // other: just proceed
        return persistedState as any;
      },

      // Pre-Saving: remove transient properties
      partialize: (state) => ({
        ...state,
        conversations: state.conversations.map((conversation: DConversation) => {
          const {
            abortController, ephemerals,
            ...rest
          } = conversation;
          return rest;
        }),
      }),

      // Post-Loading: re-add transient properties and cleanup state
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // fixup state
        for (const conversation of (state.conversations || [])) {
          // reset the typing flag
          for (const message of conversation.messages)
            message.typing = false;

          // rehydrate the transient properties
          conversation.abortController = null;
          conversation.ephemerals = [];
        }

        // select the first conversation if none is selected
        if (!state.activeConversationId && state.conversations.length)
          state.activeConversationId = state.conversations[0].id;
      },

    }),
  {
    name: 'AppChats',
    enabled: false,
  }),
);


export const conversationTitle = (conversation: DConversation, fallback?: string): string =>
  conversation.userTitle || conversation.autoTitle || fallback || ''; // 👋💬🗨️


/**
 * Returns the chats stored in the localStorage, and rename the key for
 * backup/data loss prevention purposes
 */
function _migrateLocalStorageData(): ChatState | {} {
  const key = 'app-chats';
  const value = localStorage.getItem(key);
  if (!value) return {};
  try {
    // parse the localStorage state
    const localStorageState = JSON.parse(value)?.state;

    // backup and delete the localStorage key
    const backupKey = `${key}-v2`;
    localStorage.setItem(backupKey, value);
    localStorage.removeItem(key);

    // match the state from localstorage
    return {
      conversations: localStorageState?.conversations ?? [],
      activeConversationId: localStorageState?.activeConversationId ?? null,
    };
  } catch (error) {
    console.error('LocalStorage migration error', error);
    return {};
  }
}

/**
 * Convenience function to count the tokens in a DMessage object
 */
function updateDMessageTokenCount(message: DMessage, llmId: DLLMId | null, forceUpdate: boolean, debugFrom: string): number {
  if (forceUpdate || !message.tokenCount)
    message.tokenCount = llmId ? countModelTokens(message.text, llmId, debugFrom) : 0;
  return message.tokenCount;
}

/**
 * Convenience function to update a set of messages, using the current chatLLM
 */
function updateTokenCounts(messages: DMessage[], forceUpdate: boolean, debugFrom: string): number {
  const { chatLLMId } = useModelsStore.getState();
  return 3 + messages.reduce((sum, message) => 4 + updateDMessageTokenCount(message, chatLLMId, forceUpdate, debugFrom) + sum, 0);
}