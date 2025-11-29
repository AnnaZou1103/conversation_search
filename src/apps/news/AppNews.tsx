import * as React from 'react';

import { Box, Button, Card, CardContent, Container, IconButton, Typography } from '@mui/joy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { Brand } from '~/common/brand';
import { Link } from '~/common/components/Link';
import { capitalizeFirstLetter } from '~/common/util/textUtils';

import { NewsItems } from './news.data';


export function AppNews() {
  // state
  const [lastNewsIdx, setLastNewsIdx] = React.useState<number>(0);

  // news selection
  const news = NewsItems.filter((_, idx) => idx <= lastNewsIdx);
  const firstNews = news[0] ?? null;

  return (

    <Box sx={{
      backgroundColor: 'background.level1',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flexGrow: 1,
      overflowY: 'auto',
      minHeight: 96,
      p: { xs: 3, md: 6 },
      gap: 4,
    }}>
  
      <Typography level='h1' sx={{fontSize: '2.3rem'}}>
          Task Instructions
      </Typography>
      <Container disableGutters maxWidth='sm'>
          <Card>
          <CardContent sx={{ position: 'relative', pr:0 }}>
          <Typography level='h2' fontSize="xl"sx={{ mb: 0.5 }}  component='div'>Conversational Search Task</Typography>
          <p style={{ marginTop: 8, marginBottom: 8 }}>
              In this task, you will have conversations with a chatbot to explore information about <strong>two topics</strong>. 
              The chatbot will provide helpful information to answer your questions. Have a natural conversation with the chatbot.
          </p>
          
          <Typography level='h3' fontSize="lg" sx={{ mt: 2, mb: 0.5 }} component='div'>Study Flow</Typography>
          <p style={{ marginTop: 4, marginBottom: 8 }}>
              You will complete the following steps for <strong>each</strong> of the two topics:
          </p>
          <ol style={{ marginTop: 8, marginBottom: 8, paddingInlineStart: 24 }}>
              <li>Chat with the chatbot about the selected topic</li>
              <li>Write a memo about the topic with the chatbot by clicking the button below the chat button</li>
              <li>Submit your conversation by clicking the button below the memo button</li>
              <li>Fill out the post survey (will open in a new tab)</li>
          </ol>
          <p style={{ marginTop: 8, marginBottom: 8 }}>
              After completing these steps for the first topic, repeat the same process for the second topic.
          </p>
          
          <Typography level='h3' fontSize="lg" sx={{ mt: 2, mb: 0.5 }} component='div'>Helpful Tips</Typography>
          <ul style={{ marginTop: 8, marginBottom: 8, paddingInlineStart: 24 }}>
              <li>To start a new conversation for a different topic, click the button on the upper left corner.</li>
              <li>To view these instructions again at any time, click the button on the upper right corner.</li>
          </ul>
          </CardContent>
          </Card>
        </Container>


      <Button variant='solid' color='neutral' size='lg' component={Link} href='/' noLinkStyle>
        Got it!
      </Button>

      {/*<Typography sx={{ textAlign: 'center' }}>*/}
      {/*  Enjoy!*/}
      {/*  <br /><br />*/}
      {/*  -- The {Brand.Title.Base} Team*/}
      {/*</Typography>*/}

    </Box>
  );
}