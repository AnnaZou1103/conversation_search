import * as React from 'react';
import { shallow } from 'zustand/shallow';

import { Box, Button, ButtonGroup, Card, Grid, IconButton, Stack, Textarea, Tooltip, Typography, useTheme, Alert } from '@mui/joy';
import { ColorPaletteProp, SxProps, VariantProp } from '@mui/joy/styles/types';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CallIcon from '@mui/icons-material/Call';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FormatPaintIcon from '@mui/icons-material/FormatPaint';
import MicIcon from '@mui/icons-material/Mic';
import PanToolIcon from '@mui/icons-material/PanTool';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SendIcon from '@mui/icons-material/Send';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';

import { APP_CALL_ENABLED } from '../../../call/AppCall';

import { ContentReducer } from '~/modules/aifn/summarize/ContentReducer';
import { LLMOptionsOpenAI } from '~/modules/llms/vendors/openai/openai.vendor';
import { useChatLLM } from '~/modules/llms/store-llms';

import { SpeechResult, useSpeechRecognition } from '~/common/components/useSpeechRecognition';
import { countModelTokens } from '~/common/util/token-counter';
import { extractFilePathsWithCommonRadix } from '~/common/util/dropTextUtils';
import { hideOnDesktop, hideOnMobile } from '~/common/theme';
import { htmlTableToMarkdown } from '~/common/util/htmlTableToMarkdown';
import { launchAppCall } from '~/common/routes';
import { pdfToText } from '~/common/util/pdfToText';
import { useChatStore,createDMessage, createDEvaluation, conversationTitle} from '~/common/state/store-chats';
import { useGlobalShortcut } from '~/common/components/useGlobalShortcut';
import { useUIPreferencesStore, useUIStateStore } from '~/common/state/store-ui';
import { useStudyIdStore } from '~/common/state/store-study-id';

import { CameraCaptureButton } from './CameraCaptureButton';
import { ChatModeId, useChatModeStore } from '../../store-chatmode';
import { ChatModeMenu } from './ChatModeMenu';
import { TokenBadge } from './TokenBadge';
import { TokenProgressbar } from './TokenProgressbar';
import { useComposerStore } from './store-composer';
import { v4 as uuidv4 } from 'uuid';
import { DConversation} from '~/common/state/store-chats';
import { conversationToJsonV1 } from '../../trade/trade.client';
import { apiAsyncNode } from '~/common/util/trpc.client';
import { StoragePutSchema } from '../../trade/server/trade.router';
import { addChatLinkItem } from '../../trade/store-sharing';

/// Text template helpers

const PromptTemplates = {
  Concatenate: '{{input}}\n\n{{text}}',
  PasteFile: '{{input}}\n\n```{{fileName}}\n{{fileText}}\n```\n',
  PasteMarkdown: '{{input}}\n\n```\n{{clipboard}}\n```\n',
};

const expandPromptTemplate = (template: string, dict: object) => (inputValue: string): string => {
  let expanded = template.replaceAll('{{input}}', (inputValue || '').trim()).trim();
  for (const [key, value] of Object.entries(dict))
    expanded = expanded.replaceAll(`{{${key}}}`, value.trim());
  return expanded;
};


const attachFileLegend =
  <Stack sx={{ p: 1, gap: 1 }}>
    <Box sx={{ mb: 1 }}>
      <b>Attach a file</b>
    </Box>
    <table>
      <tbody>
      <tr>
        <td><b>Text</b></td>
        <td align='center' style={{ opacity: 0.5 }}>→</td>
        <td>📝 As-is</td>
      </tr>
      <tr>
        <td><b>Code</b></td>
        <td align='center' style={{ opacity: 0.5 }}>→</td>
        <td>📚 Markdown</td>
      </tr>
      <tr>
        <td><b>PDF</b></td>
        <td width={36} align='center' style={{ opacity: 0.5 }}>→</td>
        <td>📝 Text (summarized)</td>
      </tr>
      </tbody>
    </table>
    <Box sx={{ mt: 1, fontSize: '14px' }}>
      Drag & drop in chat for faster loads ⚡
    </Box>
  </Stack>;

const pasteClipboardLegend =
  <Box sx={{ p: 1, lineHeight: 2 }}>
    <b>Paste as 📚 Markdown attachment</b><br />
    Also converts Code and Tables<br />
    Ctrl + Shift + V
  </Box>;

const MicButton = (props: { variant: VariantProp, color: ColorPaletteProp, onClick: () => void, sx?: SxProps }) =>
  <Tooltip title='Ctrl + M' placement='top'>
    <IconButton variant={props.variant} color={props.color} onClick={props.onClick} sx={props.sx}>
      <MicIcon />
    </IconButton>
  </Tooltip>;

const CallButtonMobile = (props: { disabled?: boolean, onClick: () => void, sx?: SxProps }) =>
  <IconButton variant='soft' color='primary' disabled={props.disabled} onClick={props.onClick} sx={props.sx}>
    <CallIcon />
  </IconButton>;

const CallButtonDesktop = (props: { disabled?: boolean, onClick: () => void, sx?: SxProps }) =>
  <Button variant='soft' color='primary' disabled={props.disabled} onClick={props.onClick} endDecorator={<CallIcon />} sx={props.sx}>
    Call
  </Button>;

const DrawOptionsButtonMobile = (props: { onClick: () => void, sx?: SxProps }) =>
  <IconButton variant='soft' color='warning' onClick={props.onClick} sx={props.sx}>
    <FormatPaintIcon />
  </IconButton>;

const DrawOptionsButtonDesktop = (props: { onClick: () => void, sx?: SxProps }) =>
  <Button variant='soft' color='warning' onClick={props.onClick} endDecorator={<FormatPaintIcon />} sx={props.sx}>
    Options
  </Button>;


/**
 * A React component for composing and sending messages in a chat-like interface.
 *
 * Note: Useful bash trick to generate code from a list of files:
 *       $ for F in *.ts; do echo; echo "\`\`\`$F"; cat $F; echo; echo "\`\`\`"; done | clip
 *
 * @param {boolean} props.disableSend - Flag to disable the send button.
 * @param {(text: string, conversationId: string | null) => void} props.sendMessage - Function to send the message. conversationId is null for the Active conversation
 * @param {() => void} props.stopGeneration - Function to stop response generation
 */


export function Composer(props: {
  conversationId: string | null; messageId: string | null;
  isDeveloperMode: boolean;
  onSendMessage: (conversationId: string, text: string) => void;
  sx?: SxProps;
}) {
  // state
  const [composeText, setComposeText] = React.useState('');
  const [speechInterimResult, setSpeechInterimResult] = React.useState<SpeechResult | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [reducerText, setReducerText] = React.useState('');
  const [reducerTextTokens, setReducerTextTokens] = React.useState(0);
  const [chatModeMenuAnchor, setChatModeMenuAnchor] = React.useState<HTMLAnchorElement | null>(null);
  const attachmentFileInputRef = React.useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [chatLinkUploading, setChatLinkUploading] = React.useState(false);
  const [chatLinkResponse, setChatLinkResponse] = React.useState<StoragePutSchema | null>(null);

  // external state
  const theme = useTheme();
  const [chatModeId, setChatModeId] = useChatModeStore(state => [state.chatModeId, state.setChatModeId], shallow);
  const { enterToSend, experimentalLabs } = useUIPreferencesStore(state => ({
    enterToSend: state.enterToSend,
    experimentalLabs: state.experimentalLabs,
  }), shallow);
  const { startupText, setStartupText } = useComposerStore();
  const { assistantTyping, tokenCount: conversationTokenCount, stopTyping } = useChatStore(state => {
    const conversation = state.conversations.find(conversation => conversation.id === props.conversationId);
    return {
      assistantTyping: conversation ? !!conversation.abortController : false,
      tokenCount: conversation ? conversation.tokenCount : 0,
      stopTyping: state.stopTyping,
    };
  }, shallow);
  const { chatLLMId, chatLLM } = useChatLLM();

  const isEvaluation = useChatStore(state => {
    return state.activeEvaluationId!=null;
  })

  const isEvaluationCompleted = useChatStore(state => {
    return state.isEvaluationCompleted;
  })

  const activeMemoId = useChatStore(state => state.activeMemoId);

  // Check if conversation has been used (has more than just the initial greeting)
  // Get conversation phase for Save button logic and phase switch button
  const conversation = useChatStore(state => 
    state.conversations.find(c => c.id === props.conversationId)
  );
  const conversationPhase = conversation?.phase || 'dialogue';
  const hasTopic = !!conversation?.searchTopic;
  // Check if user has sent at least one message
  const hasUserMessages = conversation?.messages.some(msg => msg.role === 'user') || false;
  
  // Hide Composer if activeMemoId exists and this is not the memo conversation
  // (because the memo conversation will have its own Composer in the right panel)
  const shouldHideComposer = activeMemoId && props.conversationId !== activeMemoId;
  // Check if memo conversation has user messages
  // For memo conversations (phase === 'memo'), check if there are any user messages
  const hasMemoMessages = React.useMemo(() => {
    if (conversationPhase !== 'memo' || !conversation) return false;
    
    // For memo conversations, just check if there are any user messages
    return conversation.messages.some(msg => msg.role === 'user');
  }, [conversationPhase, conversation]);

  const hasConversationActivity = useChatStore(state => {
    const conversation = state.conversations.find(c => c.id === props.conversationId);
    if (!conversation) {
      console.log('[Submit Button] No conversation found for id:', props.conversationId);
      return false;
    }
    // A conversation has activity ONLY if the user has sent at least one message
    // Initial bot greeting message should NOT count as activity
    const userMessages = conversation.messages.filter(msg => msg.role === 'user');
    const hasActivity = userMessages.length > 0;
    
    console.log('[Submit Button] Total:', conversation.messages.length, 'User:', userMessages.length, 'Has activity:', hasActivity);
    return hasActivity;
  })

  // Effect: load initial text if queued up (e.g. by /launch)
  React.useEffect(() => {
    if (startupText) {
      setStartupText(null);
      setComposeText(startupText);
    }
  }, [startupText, setStartupText]);

  // Effect: reset chatLinkResponse when conversation changes (to ensure Save button shows "Save" for new conversations)
  React.useEffect(() => {
    console.log('[Save Button Reset] Conversation changed to:', props.conversationId);
    setChatLinkResponse(null);
    setChatLinkUploading(false);
  }, [props.conversationId]);

  // derived state
  const tokenLimit = chatLLM?.contextTokens || 0;
  const directTokens = React.useMemo(() => {
    return (!composeText || !chatLLMId) ? 4 : 4 + countModelTokens(composeText, chatLLMId, 'composer text');
  }, [chatLLMId, composeText]);
  const historyTokens = conversationTokenCount;
  const responseTokens = (chatLLM?.options as LLMOptionsOpenAI /* FIXME: BIG ASSUMPTION */)?.llmResponseTokens || 0;
  const remainingTokens = tokenLimit - directTokens - historyTokens - responseTokens;


  const handleSendClicked = () => {
    let textarea:HTMLElement = document.getElementById('textarea') as HTMLElement;
    const text = (composeText || '' || textarea.innerHTML).trim();

    if ((text.length) && props.conversationId) {
      setComposeText('');
      setChatLinkResponse(null);
      props.onSendMessage(props.conversationId, text);
    }
  };


  const handleCallClicked = () => props.conversationId && launchAppCall(props.conversationId, 'conv_search');

  const handleDrawOptionsClicked = () => useUIStateStore.getState().openSettings(2);


  const handleToggleChatMode = (event: React.MouseEvent<HTMLAnchorElement>) =>
    setChatModeMenuAnchor(anchor => anchor ? null : event.currentTarget);

  const handleHideChatMode = () => setChatModeMenuAnchor(null);

  const handleSetChatModeId = (_chatModeId: ChatModeId) => {
    handleHideChatMode();
    setChatModeId(_chatModeId);
  };

  const handleStopClicked = () => props.conversationId && stopTyping(props.conversationId);

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const shiftOrAlt = e.shiftKey || e.altKey;
      if (enterToSend ? !shiftOrAlt : shiftOrAlt) {
        if (!assistantTyping)
          handleSendClicked();
        e.preventDefault();
      }
    }
  };


  const onSpeechResultCallback = React.useCallback((result: SpeechResult) => {
    setSpeechInterimResult(result.done ? null : { ...result });
    if (result.done) {
      setComposeText(prevText => {
        prevText = prevText.trim();
        const transcript = result.transcript.trim();
        return prevText ? prevText + ' ' + transcript : transcript;
      });
    }
  }, []);

  const { isSpeechEnabled, isSpeechError, isRecordingAudio, isRecordingSpeech, toggleRecording } = useSpeechRecognition(onSpeechResultCallback, 2000, 'm');

  const handleMicClicked = () => toggleRecording();

  const micColor: ColorPaletteProp = isSpeechError ? 'danger' : isRecordingSpeech ? 'primary' : isRecordingAudio ? 'neutral' : 'neutral';
  const micVariant: VariantProp = isRecordingSpeech ? 'solid' : isRecordingAudio ? 'outlined' : 'plain';

  async function loadAndAttachFiles(files: FileList, overrideFileNames: string[]) {

    // NOTE: we tried to get the common 'root prefix' of the files here, so that we could attach files with a name that's relative
    //       to the common root, but the files[].webkitRelativePath property is not providing that information

    // perform loading and expansion
    let newText = '';
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = overrideFileNames.length === files.length ? overrideFileNames[i] : file.name;
      let fileText = '';
      try {
        if (file.type === 'application/pdf')
          fileText = await pdfToText(file);
        else
          fileText = await file.text();
        newText = expandPromptTemplate(PromptTemplates.PasteFile, { fileName: fileName, fileText })(newText);
      } catch (error) {
        // show errors in the prompt box itself - FUTURE: show in a toast
        console.error(error);
        newText = `${newText}\n\nError loading file ${fileName}: ${error}\n`;
      }
    }

    // see how we fare on budget
    if (chatLLMId) {
      const newTextTokens = countModelTokens(newText, chatLLMId, 'reducer trigger');

      // simple trigger for the reduction dialog
      if (newTextTokens > remainingTokens) {
        setReducerTextTokens(newTextTokens);
        setReducerText(newText);
        return;
      }
    }

    // within the budget, so just append
    setComposeText(text => expandPromptTemplate(PromptTemplates.Concatenate, { text: newText })(text));
  }

  const handleContentReducerClose = () => {
    setReducerText('');
  };

  const handleContentReducerText = (newText: string) => {
    handleContentReducerClose();
    setComposeText(text => text + newText);
  };

  const handleShowFilePicker = () => attachmentFileInputRef.current?.click();

  const handleLoadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target?.files;
    if (files && files.length >= 1)
      await loadAndAttachFiles(files, []);

    // this is needed to allow the same file to be selected again
    e.target.value = '';
  };

  const handleCameraOCR = (text: string) => text && setComposeText(expandPromptTemplate(PromptTemplates.PasteMarkdown, { clipboard: text }));

  const handlePasteButtonClicked = React.useCallback(async () => {
    for (const clipboardItem of await navigator.clipboard.read()) {

      // when pasting html, only process tables as markdown (e.g. from Excel), or fallback to text
      try {
        const htmlItem = await clipboardItem.getType('text/html');
        const htmlString = await htmlItem.text();
        // paste tables as markdown
        if (htmlString.indexOf('<table') == 0) {
          const markdownString = htmlTableToMarkdown(htmlString);
          setComposeText(expandPromptTemplate(PromptTemplates.PasteMarkdown, { clipboard: markdownString }));
          continue;
        }
        // TODO: paste html to markdown (tried Turndown, but the gfm plugin is not good - need to find another lib with minimal footprint)
      } catch (error) {
        // ignore missing html: fallback to text/plain
      }

      // find the text/plain item if any
      try {
        const textItem = await clipboardItem.getType('text/plain');
        const textString = await textItem.text();
        setComposeText(expandPromptTemplate(PromptTemplates.PasteMarkdown, { clipboard: textString }));
        continue;
      } catch (error) {
        // ignore missing text
      }

      // no text/html or text/plain item found
      console.log('Clipboard item has no text/html or text/plain item.', clipboardItem.types, clipboardItem);
    }
  }, []);

  useGlobalShortcut('v', true, false, handlePasteButtonClicked);

  const handleTextareaCtrlV = async (e: React.ClipboardEvent) => {

    // paste local files
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      await loadAndAttachFiles(e.clipboardData.files, []);
      return;
    }

    // paste not intercepted, continue with default behavior
  };


  const eatDragEvent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleTextareaDragEnter = (e: React.DragEvent) => {
    eatDragEvent(e);
    setIsDragging(true);
  };

  const handleOverlayDragLeave = (e: React.DragEvent) => {
    eatDragEvent(e);
    setIsDragging(false);
  };

  const handleOverlayDragOver = (e: React.DragEvent) => {
    eatDragEvent(e);
    // e.dataTransfer.dropEffect = 'copy';
  };

  const handleOverlayDrop = async (e: React.DragEvent) => {
    eatDragEvent(e);
    setIsDragging(false);

    // dropped files
    if (e.dataTransfer.files?.length >= 1) {
      // Workaround: as we don't have the full path in the File object, we need to get it from the text/plain data
      let overrideFileNames: string[] = [];
      if (e.dataTransfer.types?.includes('text/plain')) {
        const plainText = e.dataTransfer.getData('text/plain');
        overrideFileNames = extractFilePathsWithCommonRadix(plainText);
      }
      return loadAndAttachFiles(e.dataTransfer.files, overrideFileNames);
    }

    // special case: detect failure of dropping from VSCode
    // VSCode: Drag & Drop does not transfer the File object: https://github.com/microsoft/vscode/issues/98629#issuecomment-634475572
    if (e.dataTransfer.types?.includes('codeeditors'))
      return setComposeText(test => test + 'Pasting from VSCode is not supported! Fixme. Anyone?');

    // dropped text
    const droppedText = e.dataTransfer.getData('text');
    if (droppedText?.length >= 1)
      return setComposeText(text => expandPromptTemplate(PromptTemplates.PasteMarkdown, { clipboard: droppedText })(text));

    // future info for dropping
    console.log('Unhandled Drop event. Contents: ', e.dataTransfer.types.map(t => `${t}: ${e.dataTransfer.getData(t)}`));
  };

  function findConversation(conversationId: string) {
    return conversationId ? useChatStore.getState().conversations.find(c => c.id === conversationId) ?? null : null;
  }

  async function saveConversation(conversationId: string){
    const conversation = findConversation(conversationId);
    if (!conversation) return;

    // Re-fetch conversation after updating
    const updatedConversation = findConversation(conversationId);
    if (!updatedConversation) return;
    console.log('[Save] Updated conversation:', {
      id: updatedConversation.id,
      searchTopic: updatedConversation.searchTopic,
      standpoint: updatedConversation.standpoint,
      strategy: updatedConversation.strategy,
      stats: updatedConversation.stats,
    });

    setChatLinkUploading(true);
    try {
      // Get the latest conversation state (with updated search config)
      const latestConversation = findConversation(conversationId);
      if (!latestConversation) return;
      
      const chatV1 = conversationToJsonV1(latestConversation);
      
      // Check how many messages have retrieved context
      const messagesWithContext = chatV1.messages.filter(msg => msg.retrievedContext && msg.retrievedContext.length > 0);
      const messagesWithResults = messagesWithContext.filter(msg => !msg.retrievedContext?.[0]?.isNoResultMarker);
      const messagesWithNoResults = messagesWithContext.filter(msg => msg.retrievedContext?.[0]?.isNoResultMarker);
      
      console.log('[Save] Saving to MongoDB:', {
        conversationId,
        searchTopic: chatV1.searchTopic,
        standpoint: chatV1.standpoint,
        strategy: chatV1.strategy,
        stats: chatV1.stats,
        messageCount: chatV1.messages.length,
        messagesSearched: messagesWithContext.length,
        messagesWithResults: messagesWithResults.length,
        messagesWithNoResults: messagesWithNoResults.length,
        contextDetails: messagesWithResults.map(msg => ({
          messageId: msg.id,
          contextCount: msg.retrievedContext?.length || 0,
          sources: msg.retrievedContext?.map(c => c.source).filter(Boolean) || [],
        })),
      });
      // Ensure studyId and searchTopic are in the dataObject
      const studyId = latestConversation.studyId || useStudyIdStore.getState().studyId || undefined;
      const searchTopic = latestConversation.searchTopic || undefined;
      const chatV1WithFields = {
        ...chatV1,
        ...(studyId && { studyId }),
        ...(searchTopic && { searchTopic }),
      };
      const response: StoragePutSchema = await apiAsyncNode.trade.storagePut.mutate({
        ownerId: conversationId,
        dataType: 'CHAT_V1',
        dataObject: chatV1WithFields,
        studyId: undefined, // No longer pass studyId as top-level parameter (will be extracted from dataObject)
        searchTopic: undefined, // No longer pass searchTopic as top-level parameter (will be extracted from dataObject)
        expiresSeconds: 0
      });
      setChatLinkResponse(response);
      if (response.type === 'success') {
        const chatTitle = conversationTitle(latestConversation) || undefined;
        addChatLinkItem(chatTitle, response.objectId, response.createdAt, response.expiresAt, response.deletionKey);
        // Open Google Apps Script URL in a new tab after successful submit
        // Add a small delay to ensure state updates are complete
        setTimeout(() => {
          try {
            window.open('https://script.google.com/macros/s/AKfycby4e9Zn9Gmy1mEuSge1zTtNuFl7dniY7uQph47RGeE4EJa8oqKCXsGppAE_5d6l6Fhe/exec?page=post', '_blank');
          } catch (error) {
            console.error('[Submit] Failed to open new tab:', error);
          }
        }, 100);
      }
    } catch (error: any) {
      setChatLinkResponse({
        type: 'error',
        error: error?.message ?? error?.toString() ?? 'unknown error',
      });
    }
    setChatLinkUploading(false);
  };

  const handleSaveClicked = async () => {
      let currentConversationId = useChatStore.getState().activeConversationId;
      if (currentConversationId) {
        await saveConversation(currentConversationId);
      }
      let currentEvaluationId = useChatStore.getState().activeEvaluationId;
      if (currentEvaluationId) {
        await saveConversation(currentEvaluationId);
      }
      let currentMemoId = useChatStore.getState().activeMemoId;
      if (currentMemoId) {
        await saveConversation(currentMemoId);
      }
  };


  const isImmediate = chatModeId === 'immediate';
  const isWriteUser = chatModeId === 'write-user';
  const isChat = isImmediate || isWriteUser;
  const isFollowUp = chatModeId === 'immediate-follow-up';
  const isReAct = chatModeId === 'react';
  const isDraw = chatModeId === 'draw-imagine';
  const isDrawPlus = chatModeId === 'draw-imagine-plus';

  const textPlaceholder: string =
    isDraw
      ? 'Describe an idea or a drawing...'
      : isReAct
        ? 'Multi-step reasoning question...'
        : props.isDeveloperMode
          ? 'Chat with me!'
          : /*isProdiaConfigured ?*/ 'Chat with me!' /*: 'Chat · /react · drop text files...'*/;

  // Hide Composer if activeMemoId exists and this is not the memo conversation
  if (shouldHideComposer) {
    return null;
  }

  return (
    <Box sx={props.sx}>
        {errorMessage && <>
        <Alert variant='soft' color='danger' sx={{ my: 1}}>
          <Typography>{errorMessage}</Typography>
          <Button
          variant='solid' color='danger'
          onClick={()=>setErrorMessage(null)}
          sx={{ mt: 0 }}
        >
          OK
        </Button>
        </Alert>
      </>}

      
      <Grid container spacing={{ xs: 1, md: 2 }}>

        {/* Button column and composer Text (mobile: top, desktop: left and center) */}
        <Grid xs={12} md={9}><Stack direction='row' spacing={{ xs: 1, md: 2 }}>

          {/* Vertical buttons */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0, md: 2 } }}>

            {/* [mobile] Mic button */}
            {isSpeechEnabled && <Box sx={hideOnDesktop}>
              <MicButton variant={micVariant} color={micColor} onClick={handleMicClicked} />
            </Box>}

            {/* Responsive Camera OCR button */}
            <CameraCaptureButton onOCR={handleCameraOCR} />

            {/* Responsive Attach button */}
            {/* <IconButton onClick={handleShowFilePicker} sx={{ ...hideOnDesktop }}>
              <AttachFileOutlinedIcon />
            </IconButton>
            <Tooltip
              variant='solid' placement='top-start'
              title={attachFileLegend}>
              <Button fullWidth variant='plain' color='neutral' onClick={handleShowFilePicker} startDecorator={<AttachFileOutlinedIcon />}
                      sx={{ ...hideOnMobile, justifyContent: 'flex-start' }}>
                Attach
              </Button>
            </Tooltip> */}

            {/* Responsive Paste button */}
            <IconButton onClick={handlePasteButtonClicked} sx={{ ...hideOnDesktop }}>
              <ContentPasteGoIcon />
            </IconButton>
            <Tooltip
              variant='solid' placement='top-start'
              title={pasteClipboardLegend}>
              <Button fullWidth variant='plain' color='neutral' startDecorator={<ContentPasteGoIcon />} onClick={handlePasteButtonClicked}
                      sx={{ ...hideOnMobile, justifyContent: 'flex-start' }}>
                {props.isDeveloperMode ? 'Paste code' : 'Paste'}
              </Button>
            </Tooltip>

            {/* Responsive Settings button */}
            <IconButton onClick={() => useUIStateStore.getState().openSettings(4)} sx={{ ...hideOnDesktop }}>
              <SettingsOutlinedIcon />
            </IconButton>
            <Button fullWidth variant='plain' color='neutral' startDecorator={<SettingsOutlinedIcon />} 
                    onClick={() => useUIStateStore.getState().openSettings(4)}
                    sx={{ ...hideOnMobile, justifyContent: 'flex-start' }}>
              Settings
            </Button>

            <input type='file' multiple hidden ref={attachmentFileInputRef} onChange={handleLoadAttachment} />

          </Box>

          {/* Edit box, with Drop overlay */}
          <Box sx={{ flexGrow: 1, position: 'relative' }}>

            <Box sx={{ position: 'relative' }}>

              <Textarea
                variant='outlined' color={(isDraw || isDrawPlus) ? 'warning' : isReAct ? 'success' : 'neutral'}
                autoFocus
                minRows={5} maxRows={10}
                placeholder={textPlaceholder}
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                onDragEnter={handleTextareaDragEnter}
                onKeyDown={handleTextareaKeyDown}
                onPasteCapture={handleTextareaCtrlV}
                slotProps={{
                  textarea: {
                    id: 'textarea',
                    enterKeyHint: enterToSend ? 'send' : 'enter',
                    sx: {
                      ...(isSpeechEnabled ? { pr: { md: 5 } } : {}),
                      mb: 0.5,
                    },
                  },
                }}
                sx={{
                  backgroundColor: 'background.level1',
                  '&:focus-within': {
                    backgroundColor: 'background.popup',
                  },
                  // fontSize: '16px',
                  lineHeight: 1.75,
                }} />

              {tokenLimit > 0 && (directTokens > 0 || (historyTokens + responseTokens) > 0) && <TokenProgressbar history={historyTokens} response={responseTokens} direct={directTokens} limit={tokenLimit} />}

            </Box>

            {/* {isSpeechEnabled && (
              <MicButton variant={micVariant} color={micColor} onClick={handleMicClicked} sx={{
                ...hideOnMobile,
                position: 'absolute', top: 0, right: 0,
                zIndex: 21,
                m: 1,
              }} />
            )} */}

            {/* {!!tokenLimit && (
              <TokenBadge
                directTokens={directTokens} indirectTokens={historyTokens + responseTokens} tokenLimit={tokenLimit}
                showExcess absoluteBottomRight
              />
            )} */}

            {/* {!!speechInterimResult && (
              <Card
                color='primary' invertedColors variant='soft'
                sx={{
                  display: 'flex',
                  position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
                  // alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${theme.palette.primary.solidBg}`,
                  borderRadius: theme.radius.xs,
                  zIndex: 20,
                  px: 1.5, py: 1,
                }}>
                <Typography>
                  {speechInterimResult.transcript}{' '}
                  <span style={{ opacity: 0.5 }}>{speechInterimResult.interimTranscript}</span>
                </Typography>
              </Card>
            )} */}

            {/* <Card
              color='primary' invertedColors variant='soft'
              sx={{
                display: isDragging ? 'flex' : 'none',
                position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
                alignItems: 'center', justifyContent: 'space-evenly',
                border: '2px dashed',
                borderRadius: theme.radius.xs,
                zIndex: 10,
              }}
              onDragLeave={handleOverlayDragLeave}
              onDragOver={handleOverlayDragOver}
              onDrop={handleOverlayDrop}>
              <PanToolIcon sx={{ width: 40, height: 40, pointerEvents: 'none' }} />
              <Typography level='body-sm' sx={{ pointerEvents: 'none' }}>
                I will hold on to this for you
              </Typography>
            </Card> */}

          </Box>

        </Stack></Grid>

        {/* Send pane (mobile: bottom, desktop: right) */}
        <Grid xs={12} md={3}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>

            {/* first row of buttons */}
            <Box sx={{ display: 'flex' }}>


              {/* [mobile] [corner] Call button */}
              {/* {APP_CALL_ENABLED && isChat && <CallButtonMobile
                disabled={!props.conversationId || !chatLLM}
                onClick={handleCallClicked}
                sx={{ ...hideOnDesktop, mr: { xs: 1, md: 2 } }}
              />} */}

              {/* [mobile] [corner] Draw button */}
              {/* {(isDraw || isDrawPlus) && <DrawOptionsButtonMobile
                onClick={handleDrawOptionsClicked}
                sx={{ ...hideOnDesktop, mr: { xs: 1, md: 2 } }}
              />} */}

              {/* Responsive Send/Stop buttons */}
              {assistantTyping
                ? (
                  <Button
                    fullWidth variant='soft' color={isReAct ? 'success' : 'primary'} disabled={!props.conversationId}
                    onClick={handleStopClicked}
                    endDecorator={<StopOutlinedIcon />}
                  >
                    Stop
                  </Button>
                ) : (
                  <ButtonGroup variant={isWriteUser ? 'solid' : 'solid'} color={isReAct ? 'success' : (isFollowUp || isDraw || isDrawPlus) ? 'warning' : 'primary'} sx={{ flexGrow: 1 }}>
                    <Button
                      id="auto_trigger"
                      fullWidth variant={isWriteUser ? 'soft' : 'solid'} color={isReAct ? 'success' : (isFollowUp || isDraw || isDrawPlus) ? 'warning' : 'primary'} disabled={!props.conversationId || !chatLLM || !composeText.trim()}
                      onClick={handleSendClicked}
                      endDecorator={<SendIcon sx={{ fontSize: 18 }} />}
                    >
                      {isWriteUser ? 'Write' : isFollowUp ? 'Chat+' : isReAct ? 'ReAct' : isDraw ? 'Draw' : isDrawPlus ? 'Draw+' : 'Chat'}
                    </Button>
                    {/* <IconButton disabled={!props.conversationId || !chatLLM || !!chatModeMenuAnchor} onClick={handleToggleChatMode}>
                      <ExpandLessIcon />
                    </IconButton> */}
                  </ButtonGroup>
                )}
            </Box>

            {/* Memo Creation Button - shown below Chat button in a separate row */}
            {hasTopic && (
              <Box sx={{ display: 'flex', mt: 1 }}>
                <Button
                  fullWidth
                  variant="soft"
                  color="neutral"
                  disabled={!hasUserMessages || !!activeMemoId}
                  onClick={() => {
                    if (props.conversationId) {
                      // Create memo conversation
                      useChatStore.getState().createMemo();
                      console.log('[Composer] Created memo conversation');
                    }
                  }}
                >
                  {activeMemoId ? 'Memo active' : "I'm ready to write my memo"}
                </Button>
              </Box>
            )}


            {/* [desktop] other buttons (aligned to bottom for now, and mutually exclusive) */}
            <Box sx={{ flexGrow: 1, flexDirection: 'column', gap: 1, justifyContent: 'flex-end'}}>

              {/* {APP_CALL_ENABLED && isChat && <CallButtonDesktop disabled={!props.conversationId || !chatLLM} onClick={handleCallClicked} />}

              {(isDraw || isDrawPlus) && <DrawOptionsButtonDesktop onClick={handleDrawOptionsClicked} />} */}

            </Box>

            <Box sx={{ display: 'flex' }}>
              <Button
                  fullWidth variant='soft' 
                  color={chatLinkResponse?.type === 'success'? 'success' : chatLinkResponse?.type === 'error'? 'danger' : 'primary'}
                  disabled={!props.conversationId || !chatLLM || !hasConversationActivity || conversationPhase !== 'memo'}
                  loading={chatLinkUploading}
                  onClick={handleSaveClicked}
                >
                {chatLinkResponse?.type === 'success' ? 'Submitted ✓' : chatLinkResponse?.type === 'error'? 'Please try again': 'Submit'}
              </Button>

            </Box>


          </Box>
        </Grid>


        {/* Mode selector */}
        {/* {!!chatModeMenuAnchor && (
          <ChatModeMenu
            anchorEl={chatModeMenuAnchor} onClose={handleHideChatMode}
            experimental={experimentalLabs}
            chatModeId={chatModeId} onSetChatModeId={handleSetChatModeId}
          />
        )} */}

        {/* Content reducer modal */}
        {reducerText?.length >= 1 &&
          <ContentReducer
            initialText={reducerText} initialTokens={reducerTextTokens} tokenLimit={remainingTokens}
            onReducedText={handleContentReducerText} onClose={handleContentReducerClose}
          />
        }

      </Grid>
    </Box>
  );
}