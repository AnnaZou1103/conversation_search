import * as React from 'react';
import { shallow } from 'zustand/shallow';
import { v4 as uuidv4 } from 'uuid';

import { Box, Button } from '@mui/joy';

import { CmdRunProdia } from '~/modules/prodia/prodia.client';
import { CmdRunReact } from '~/modules/aifn/react/react';
import { FlattenerModal } from '~/modules/aifn/flatten/FlattenerModal';
import { imaginePromptFromText } from '~/modules/aifn/imagine/imaginePromptFromText';
import { useModelsStore } from '~/modules/llms/store-llms';

import { ConfirmationModal } from '~/common/components/ConfirmationModal';
import { createDMessage, DMessage, initialmessage, useChatStore } from '~/common/state/store-chats';
import { useLayoutPluggable } from '~/common/layout/store-applayout';

import { ChatDrawerItems } from './components/applayout/ChatDrawerItems';
import { ChatDropdowns } from './components/applayout/ChatDropdowns';
import { ChatMenuItems } from './components/applayout/ChatMenuItems';
import { ChatMessageList } from './components/ChatMessageList';
import { ChatModeId, useChatModeStore } from './store-chatmode';
import { CmdAddRoleMessage, extractCommands } from './commands';
import { Composer } from './components/composer/Composer';
import { Ephemerals } from './components/Ephemerals';
import { TradeConfig, TradeModal } from './trade/TradeModal';
import { runAssistantUpdatingState } from './editors/chat-stream';
import { runImageGenerationUpdatingState } from './editors/image-generate';
import { runReActUpdatingState } from './editors/react-tangent';
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { ChatMessage } from './components/message/ChatMessage';
import { TopicSelectionModal } from './components/TopicSelectionModal';
import { StudyIdInputModal } from './components/StudyIdInputModal';
import { ConversationTopic } from './topics';
import { useStudyIdStore } from '~/common/state/store-study-id';

const SPECIAL_ID_ALL_CHATS = 'all-chats';


export function AppChat() {

  // state
  const [isMessageSelectionMode, setIsMessageSelectionMode] = React.useState(false);
  const [tradeConfig, setTradeConfig] = React.useState<TradeConfig | null>(null);
  const [clearConfirmationId, setClearConfirmationId] = React.useState<string | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = React.useState<string | null>(null);
  const [flattenConversationId, setFlattenConversationId] = React.useState<string | null>(null);

  // external state
  const { activeConversationId, activeEvaluationId, activeMemoId, isConversationEmpty, hasAnyContent, duplicateConversation, deleteAllConversations, setMessages, setAutoTitle, setActiveEvaluationId, setActiveMemoId, setSearchConfig, setConversationPhase, _editConversation, getPairedMemoId } = useChatStore(state => {
    const conversation = state.conversations.find(conversation => conversation.id === state.activeConversationId);
    const isConversationEmpty = conversation ? !conversation.messages.length : true;
    const hasAnyContent = state.conversations.length > 1 || !isConversationEmpty;
    return {
      activeConversationId: state.activeConversationId,
      activeEvaluationId: state.activeEvaluationId,
      activeMemoId: state.activeMemoId,
      isConversationEmpty,
      hasAnyContent,
      duplicateConversation: state.duplicateConversation,
      deleteAllConversations: state.deleteAllConversations,
      setMessages: state.setMessages,
      setAutoTitle: state.setAutoTitle,
      setActiveEvaluationId: state.setActiveEvaluationId,
      setActiveMemoId: state.setActiveMemoId,
      setSearchConfig: state.setSearchConfig,
      setConversationPhase: state.setConversationPhase,
      _editConversation: state._editConversation,
      getPairedMemoId: state.getPairedMemoId,
    };
  }, shallow);

  // Get study ID from store
  const studyId = useStudyIdStore(state => state.studyId);
  
  // Check if we should show study ID input modal
  // Show if: no study ID is set
  const shouldShowStudyIdInput = React.useMemo(() => {
    return !studyId;
  }, [studyId]);

  // Get current conversation details
  const currentConversation = useChatStore(state => 
    state.conversations.find(c => c.id === activeConversationId)
  );
  
  // Get conversation phase (default to 'dialogue')
  const conversationPhase = currentConversation?.phase || 'dialogue';

  // Check if conversation has user messages (conversation has started)
  const hasUserMessages = currentConversation 
    ? currentConversation.messages.some(msg => msg.role === 'user')
    : false;

  // Check if we should show topic selection modal
  // Show if: study ID exists AND conversation is empty AND no topic selected AND conversation hasn't started
  const shouldShowTopicSelection = React.useMemo(() => {
    if (!studyId) return false; // Don't show if no study ID
    if (!activeConversationId || !currentConversation) return false;
    if (hasUserMessages) return false; // Don't show if conversation has started
    if (currentConversation.searchTopic) return false; // Don't show if topic already selected
    return true; // Show if conversation is empty and no topic
  }, [studyId, activeConversationId, currentConversation, hasUserMessages]);

  // Handle study ID set
  const handleStudyIdSet = React.useCallback(() => {
    // Update current conversation with study ID if it doesn't have one
    if (activeConversationId) {
      const currentStudyId = useStudyIdStore.getState().studyId;
      if (currentStudyId) {
        const conversation = useChatStore.getState().conversations.find(c => c.id === activeConversationId);
        if (conversation && !conversation.studyId) {
          _editConversation(activeConversationId, { studyId: currentStudyId });
        }
      }
    }
    
    // Ensure topic config is generated (in case it wasn't generated during setStudyId)
    const { topicConfig, generateTopicConfig } = useStudyIdStore.getState();
    if (!topicConfig) {
      generateTopicConfig();
    }
    
    // Study ID is now set, topic selection will show automatically if needed
    // The modal will close automatically when studyId state updates
  }, [activeConversationId, _editConversation]);

  // Handle topic selection
  const handleTopicSelect = (topic: ConversationTopic) => {
    if (activeConversationId) {
      // Get topic configuration (standpoint and strategy) from store
      const topicConfig = useStudyIdStore.getState().getTopicConfig(topic);
      
      if (topicConfig) {
        // Set topic, standpoint, and strategy together
        setSearchConfig(activeConversationId, {
          topic,
          standpoint: topicConfig.standpoint,
          strategy: topicConfig.strategy,
        });
        console.log('[AppChat] Topic selected with config:', {
          topic,
          standpoint: topicConfig.standpoint,
          strategy: topicConfig.strategy,
        });
      } else {
        // Fallback: just set topic if config not found
        console.warn('[AppChat] Topic config not found for topic:', topic);
        setSearchConfig(activeConversationId, { topic });
      }
    }
  };

  // Generate initial message based on topic
  const getInitialMessage = React.useMemo(() => {
    if (currentConversation?.searchTopic) {
      return {
        ...initialmessage,
        text: `Hello! I'm here to help you explore and learn about the following topic through conversation:\n\n**${currentConversation.searchTopic}**\n\nWhat would you like to discuss or learn more about regarding this topic?`,
      };
    }
    return initialmessage;
  }, [currentConversation?.searchTopic]);

  // Generate memo initial greeting message
  const getMemoInitialMessage = React.useMemo(() => {
    const topic = currentConversation?.searchTopic;
    // Use a fixed ID prefix to ensure consistency, but make it unique per topic
    const messageId = `memo-initial-${topic || 'default'}`;
    return {
      ...initialmessage,
      id: messageId,
      text: topic
        ? `Hello! I'm here to help you prepare your opinion memo on "${topic}".\nShare your thoughts, and I'll help you shape them into a clear and effective memo.`
        : `Hello! I'm here to help you prepare your opinion memo.\nShare your thoughts, and I'll help you shape them into a clear and effective memo.`,
    };
  }, [currentConversation?.searchTopic]);


  const handleExecuteConversation = async (chatModeId: ChatModeId, conversationId: string, history: DMessage[]) => {
    const { chatLLMId } = useModelsStore.getState();
    if (!conversationId || !chatLLMId) return;

    // /command: overrides the chat mode
    const lastMessage = history.length > 0 ? history[history.length - 1] : null;
    if (lastMessage?.role === 'user') {
      const pieces = extractCommands(lastMessage.text);
      if (pieces.length == 2 && pieces[0].type === 'cmd' && pieces[1].type === 'text') {
        const command = pieces[0].value;
        const prompt = pieces[1].value;
        if (CmdRunProdia.includes(command)) {
          setMessages(conversationId, history);
          return await runImageGenerationUpdatingState(conversationId, prompt);
        }
        if (CmdRunReact.includes(command) && chatLLMId) {
          setMessages(conversationId, history);
          return await runReActUpdatingState(conversationId, prompt, chatLLMId);
        }
        if (CmdAddRoleMessage.includes(command)) {
          lastMessage.role = command.startsWith('/s') ? 'system' : command.startsWith('/a') ? 'assistant' : 'user';
          lastMessage.sender = 'Bot';
          lastMessage.text = prompt;
          return setMessages(conversationId, history);
        }
      }
    }
    
    // synchronous long-duration tasks, which update the state as they go
    if (chatModeId && chatLLMId) {
      switch (chatModeId) {
        case 'immediate':
        case 'immediate-follow-up':
          return await runAssistantUpdatingState(conversationId, history, chatLLMId, true, chatModeId === 'immediate-follow-up');
        case 'write-user':
          return setMessages(conversationId, history);
        case 'react':
          if (!lastMessage?.text)
            break;
          setMessages(conversationId, history);
          return await runReActUpdatingState(conversationId, lastMessage.text, chatLLMId);
        case 'draw-imagine':
          if (!lastMessage?.text)
            break;
          const imagePrompt = lastMessage.text;
          setMessages(conversationId, history.map(message => message.id !== lastMessage.id ? message : {
            ...message,
            text: `${CmdRunProdia[0]} ${imagePrompt}`,
          }));
          return await runImageGenerationUpdatingState(conversationId, imagePrompt);
      }
    }

    // ISSUE: if we're here, it means we couldn't do the job, at least sync the history
    console.log('handleExecuteConversation: issue running', conversationId, lastMessage);
    setMessages(conversationId, history);
  };

  const _findConversation = (conversationId: string) =>
    conversationId ? useChatStore.getState().conversations.find(c => c.id === conversationId) ?? null : null;

  const handleSendUserMessage = async (conversationId: string, userText: string) => {
    const conversation = _findConversation(conversationId);
    if (conversation) {
      const chatModeId = useChatModeStore.getState().chatModeId;
      if (chatModeId === 'draw-imagine-plus')
        return await handleImagineFromText(conversationId, userText);
      
      // Create new history with user message
      const userMessage = createDMessage('user', userText);
      const newHistory = [...conversation.messages, userMessage];
      
      console.log('[AppChat] handleSendUserMessage', {
        conversationId,
        userText: userText.substring(0, 50),
        conversationMessagesLength: conversation.messages.length,
        newHistoryLength: newHistory.length,
        lastMessageRole: newHistory[newHistory.length - 1]?.role,
        phase: conversation.phase
      });
      
      // Save user message immediately so it displays right away
      setMessages(conversationId, newHistory);
      
      // Then execute the conversation to get assistant response
      return await handleExecuteConversation(chatModeId, conversationId, newHistory);
    }
  };

  const handleExecuteChatHistory = async (conversationId: string, history: DMessage[]) =>
    await handleExecuteConversation('immediate', conversationId, history);

  const handleImagineFromText = async (conversationId: string, messageText: string) => {
    const conversation = _findConversation(conversationId);
    if (conversation) {
      const prompt = await imaginePromptFromText(messageText);
      if (prompt)
        return await handleExecuteConversation('immediate', conversationId, [...conversation.messages, createDMessage('user', `${CmdRunProdia[0]} ${prompt}`)]);
    }
  };


  const handleClearConversation = (conversationId: string) => {
    setClearConfirmationId(conversationId);
    setActiveEvaluationId(null);
  }

  const handleConfirmedClearConversation = () => {
    if (clearConfirmationId) {
      setMessages(clearConfirmationId, []);
      setAutoTitle(clearConfirmationId, '');
      setClearConfirmationId(null);
    }
  };

  const handleDeleteAllConversations = () => setDeleteConfirmationId(SPECIAL_ID_ALL_CHATS);

  const handleConfirmedDeleteConversation = () => {
    if (deleteConfirmationId) {
      if (deleteConfirmationId === SPECIAL_ID_ALL_CHATS) {
        deleteAllConversations();
      }// else
      //  deleteConversation(deleteConfirmationId);
      setDeleteConfirmationId(null);
    }
  };


  const handleImportConversation = () => setTradeConfig({ dir: 'import' });

  const handleExportConversation = (conversationId: string | null) => setTradeConfig({ dir: 'export', conversationId });

  const handleFlattenConversation = (conversationId: string) => setFlattenConversationId(conversationId);


  // Pluggable ApplicationBar components

  const centerItems = React.useMemo(() =>
      <ChatDropdowns conversationId={activeConversationId} />,
    [activeConversationId],
  );

  const drawerItems = React.useMemo(() =>
      <ChatDrawerItems
        conversationId={activeConversationId}
        onImportConversation={handleImportConversation}
        onDeleteAllConversations={handleDeleteAllConversations}
      />,
    [activeConversationId],
  );

  useLayoutPluggable(centerItems, drawerItems);
  
  function handleMessageDelete(id: string): void {
    throw new Error('Function not implemented.');
  }

  // Check if we should show memo split screen
  // When activeMemoId exists, show split screen with dialogue on left and memo on right
  const shouldShowMemoSplit = !!activeMemoId;

  // Auto-set activeMemoId when switching conversations if memo exists
  React.useEffect(() => {
    if (activeConversationId && !activeMemoId) {
      const memoId = getPairedMemoId(activeConversationId);
      if (memoId) {
        setActiveMemoId(memoId);
      }
    }
  }, [activeConversationId, activeMemoId, getPairedMemoId, setActiveMemoId]);

  return <>
    {/* Study ID Input Modal - shown before topic selection */}
    <StudyIdInputModal
      open={shouldShowStudyIdInput}
      onStudyIdSet={handleStudyIdSet}
    />

    {/* Topic Selection Modal - only shown after study ID is set */}
    <TopicSelectionModal
      open={shouldShowTopicSelection}
      onSelectTopic={handleTopicSelect}
    />

    {shouldShowMemoSplit ? (
      // Split screen: Left = Dialogue (read-only), Right = Memo (editable)
      <Allotment 
        css={{backgroundColor: '#EAEEF6'}}
        defaultSizes={[1, 2]}  // 左侧1/3，右侧2/3
      >
        {/* Left Panel: Original Dialogue (Read-only) */}
        <div style={{overflow: 'auto', height:'100%', width: '100%'}}>
          <ChatMessage
            key={'msg-' + getInitialMessage.id} message={getInitialMessage} diffText={undefined}
            isBottom={true}
            onMessageDelete={undefined}
            onMessageEdit={newText => handleMessageDelete(getInitialMessage.id)}
            onMessageRunFrom={undefined}
            onImagine={undefined}
          />
          <ChatMessageList
            conversationId={activeConversationId}
            isMessageSelectionMode={false} setIsMessageSelectionMode={() => {}}
            onExecuteChatHistory={() => {}}
            onImagineFromText={() => {}}
            sx={{
              flexGrow: 1,
              backgroundColor: 'background.level1',
              overflowY: 'auto', 
              minHeight: 96,
            }} />
        </div>

        {/* Right Panel: Memo Conversation (Editable) */}
        <div style={{display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'}}>
          <div style={{flex: 1, overflow: 'auto'}}>
            {/* Memo Initial Greeting Message */}
            <ChatMessage
              key={'memo-msg-' + getMemoInitialMessage.id} 
              message={getMemoInitialMessage} 
              diffText={undefined}
              isBottom={true}
              onMessageDelete={undefined}
              onMessageEdit={newText => handleMessageDelete(getMemoInitialMessage.id)}
              onMessageRunFrom={undefined}
              onImagine={undefined}
            />
            <ChatMessageList
              conversationId={activeMemoId}
              isMessageSelectionMode={isMessageSelectionMode} setIsMessageSelectionMode={setIsMessageSelectionMode}
              onExecuteChatHistory={handleExecuteChatHistory}
              onImagineFromText={handleImagineFromText}
              sx={{
                flexGrow: 1,
                backgroundColor: 'background.level1',
                overflowY: 'auto', 
                minHeight: 96,
              }} />
          </div>
          <Composer
            conversationId={activeMemoId} messageId={null}
            isDeveloperMode={false}
            onSendMessage={handleSendUserMessage}
            sx={{
              zIndex: 21,
              backgroundColor: 'background.surface',
              borderTop: `1px solid`,
              borderTopColor: 'divider',
              p: { xs: 1, md: 2 },
            }} />
        </div>
      </Allotment>
    ) : (
      // Normal single screen view
      <>
        <Allotment css={{backgroundColor: '#EAEEF6'}}>
          <div style={{overflow: 'auto', height:'100%', width: '100%'}}>
            <ChatMessage
              key={'msg-' + getInitialMessage.id} message={getInitialMessage} diffText={undefined}
              isBottom={true}
              onMessageDelete={undefined}
              onMessageEdit={newText => handleMessageDelete(getInitialMessage.id)}
              onMessageRunFrom={undefined}
              onImagine={undefined}
            />
            <ChatMessageList
              conversationId={activeConversationId}
              isMessageSelectionMode={isMessageSelectionMode} setIsMessageSelectionMode={setIsMessageSelectionMode}
              onExecuteChatHistory={handleExecuteChatHistory}
              onImagineFromText={handleImagineFromText}
              sx={{
                flexGrow: 1,
                backgroundColor: 'background.level1',
                overflowY: 'auto', 
                minHeight: 96,
              }} />
          </div>

          {activeEvaluationId &&(
            <div style={{overflow: 'auto', height:'100%', width: '100%'}}>
              <ChatMessageList
              conversationId={activeEvaluationId}
              isMessageSelectionMode={isMessageSelectionMode} setIsMessageSelectionMode={setIsMessageSelectionMode}
              onExecuteChatHistory={handleExecuteChatHistory}
              onImagineFromText={handleImagineFromText}
              sx={{
                flexGrow: 1,
                backgroundColor: 'background.level1',
                overflowY: 'auto', 
                minHeight: 96,
              }} />
            </div>
          )}
        </Allotment>

        <Composer
          conversationId={activeConversationId} messageId={null}
          isDeveloperMode={false}
          onSendMessage={handleSendUserMessage}
          sx={{
            zIndex: 21,
            backgroundColor: 'background.surface',
            borderTop: `1px solid`,
            borderTopColor: 'divider',
            p: { xs: 1, md: 2 },
          }} />
      </>
    )}


    {/* Import / Export  */}
    {!!tradeConfig && <TradeModal config={tradeConfig} onClose={() => setTradeConfig(null)} />}

    {/* Flatten */}
    {!!flattenConversationId && <FlattenerModal conversationId={flattenConversationId} onClose={() => setFlattenConversationId(null)} />}

    {/* [confirmation] Reset Conversation */}
    {!!clearConfirmationId && <ConfirmationModal
      open onClose={() => setClearConfirmationId(null)} onPositive={handleConfirmedClearConversation}
      confirmationText={'Are you sure you want to discard all the messages?'} positiveActionText={'Clear conversation'}
    />}

    {/* [confirmation] Delete All */}
    {!!deleteConfirmationId && <ConfirmationModal
      open onClose={() => setDeleteConfirmationId(null)} onPositive={handleConfirmedDeleteConversation}
      confirmationText={deleteConfirmationId === SPECIAL_ID_ALL_CHATS
        ? 'Are you absolutely sure you want to delete ALL conversations? This action cannot be undone.'
        : 'Are you sure you want to delete this conversation?'}
      positiveActionText={deleteConfirmationId === SPECIAL_ID_ALL_CHATS
        ? 'Yes, delete all'
        : 'Delete conversation'}
    />}

  </>;
}
