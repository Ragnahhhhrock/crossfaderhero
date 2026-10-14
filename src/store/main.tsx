import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/share-tech-mono/400.css';
import '../design/tokens.css';
import '../styles.css';
import StoreView from './StoreView';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreView />
  </StrictMode>,
);
