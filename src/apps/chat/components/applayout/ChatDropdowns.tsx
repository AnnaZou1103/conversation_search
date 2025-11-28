import * as React from 'react';

import { Box, Typography } from '@mui/joy';

import { useChatLLMDropdown } from './useLLMDropdown';
import { usePersonaIdDropdown } from './usePersonaDropdown';
import { useStudyIdStore } from '~/common/state/store-study-id';


export function ChatDropdowns(props: {
  conversationId: string | null
}) {

  // state
  const { chatLLMDropdown } = useChatLLMDropdown();
  const { personaDropdown } = usePersonaIdDropdown(props.conversationId);
  
  // Get study ID from store
  const studyId = useStudyIdStore(state => state.studyId);

  return <>

    {/* Model selector - Hidden: GPT-4o is default and locked */}
    {/* {chatLLMDropdown} */}

    {/* Persona selector */}
    {/* {personaDropdown} */}

    {/* Study ID display */}
    {studyId && (
      <Typography 
        level="body-sm" 
        sx={{ 
          color: 'white',
          opacity: 0.9,
          whiteSpace: 'nowrap',
          fontWeight: 'bold',
        }}
      >
        Study ID: {studyId}
      </Typography>
    )}

  </>;
}
