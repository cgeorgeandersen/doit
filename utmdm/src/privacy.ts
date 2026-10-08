import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { themeToggle } from './ui/components';

/* The privacy page is plain HTML, so it reads without JavaScript; this adds the styles and the theme toggle. */
document.getElementById('privacy-actions')?.append(themeToggle());
