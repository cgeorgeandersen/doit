import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/public-sans/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { inject } from '@vercel/analytics';
import { startApp } from './ui/app';

startApp(document.getElementById('app')!);
// Page views only (no cookies). Every poll counts as one page, /p/[id], so no
// poll's link (or a host key after #) ever reaches the analytics.
inject({
  mode: 'production',
  beforeSend: (event) => ({ ...event, url: event.url.replace(/\/p\/[^/?#]+/, '/p/[id]').replace(/#.*$/, '') }),
});
