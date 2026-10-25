import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/public-sans/wght.css';
import './styles/tokens.css';
import './styles/app.css';

import { startGame } from './ui/game';

startGame(document.getElementById('app')!);
