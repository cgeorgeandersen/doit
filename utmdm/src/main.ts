import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { inject } from '@vercel/analytics';
import { browserStore } from './core/store';
import { startApp } from './ui/app';

startApp(document.getElementById('app')!, browserStore());
// Page views only (no cookies). Workspace data never leaves the browser.
inject({ mode: 'production' });
