import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/share-tech-mono/400.css';
import '../design/tokens.css';
import './club.css';
import { Club } from './Club';
import { buildPanel } from './panel';
import { loadSettings } from './settings';

const settings = loadSettings();
const stage = document.getElementById('club')!;
// fonts first, so the LED wall's logo visual draws in the brand face
document.fonts.ready.finally(() => {
  const club = new Club(stage, settings);
  buildPanel(document.body, club, settings);
  (window as unknown as { club: Club }).club = club;
});
