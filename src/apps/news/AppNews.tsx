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
          In this task, you will have a conversation with a chatbot to explore information about a topic.
          <ul style={{ marginTop: 8, marginBottom: 8, paddingInlineStart: 24 }}>
              <li>
                  Ask the chatbot about a specific topic.
              </li>
              <li>The chatbot will provide helpful information to answer your questions.</li>
              <li>You can ask follow-up questions to explore topics in more depth.</li>
              <li>Feel free to express your thoughts and ask for clarification on anything.</li>
              <li>Have a natural conversation - the chatbot is here to help you.</li>
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