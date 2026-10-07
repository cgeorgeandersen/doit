import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { createAuth, loadConfig } from './cloud/auth';
import { openCloudStore } from './cloud/cloud-store';
import { browserStore } from './core/store';
import { startApp } from './ui/app';
import { landingView } from './ui/landing';

/*
 * On AWS a config.json sits next to index.html: sign in, then load the user's
 * workspace from their account. Without one (npm run dev, the old demo), the
 * app runs on its own and keeps the workspace in this browser.
 */
async function boot(root: HTMLElement): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    startApp(root, browserStore());
    return;
  }
  const auth = createAuth(config);
  try {
    await auth.handleRedirect();
  } catch (error) {
    landingView(root, auth, error instanceof Error ? error.message : 'Sign-in failed.');
    return;
  }
  const account = auth.account();
  if (!account || !(await auth.accessToken())) {
    landingView(root, auth);
    return;
  }
  root.replaceChildren(Object.assign(document.createElement('p'), { className: 'loading', textContent: 'Opening your workspace…' }));
  try {
    startApp(root, await openCloudStore(config.apiUrl, auth), { account });
  } catch {
    landingView(root, auth, "Couldn't open your workspace. Try again in a moment.");
  }
}

void boot(document.getElementById('app')!);
