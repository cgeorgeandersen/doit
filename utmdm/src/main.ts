import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { createAuth, loadConfig, type Auth } from './cloud/auth';
import { MAIN_TABLE, openCloudStore, rememberTable, requestedTable } from './cloud/cloud-store';
import { browserStore } from './core/store';
import { startApp } from './ui/app';
import { authModeFor, authView } from './ui/auth-view';
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
  const account = auth.account();
  if (!account || !(await auth.accessToken())) {
    signedOut(root, auth, config.apiUrl);
    return;
  }
  root.replaceChildren(Object.assign(document.createElement('p'), { className: 'loading', textContent: 'Opening your workspace…' }));
  try {
    let table = requestedTable(location.search);
    let store = await openCloudStore(config.apiUrl, auth, table);
    // A table that's gone (deleted, or a link from another account): open the first one instead.
    if (table !== MAIN_TABLE && !store.tables.list.some((t) => t.id === table)) {
      table = MAIN_TABLE;
      store = await openCloudStore(config.apiUrl, auth, table);
    }
    rememberTable(table);
    startApp(root, store, { account, googleClientId: config.googleClientId, tables: store.tables });
  } catch {
    signedOut(root, auth, config.apiUrl, "Couldn't open your workspace. Try again in a moment.");
  }
}

/** Before sign-in: the home page, or the sign-in pages at #/signin, #/signup and #/forgot. */
function signedOut(root: HTMLElement, auth: Auth, apiUrl: string, problem?: string): void {
  let shown: string | null = null;
  const render = () => {
    const mode = authModeFor(location.hash);
    const page = mode ?? 'home';
    if (page === shown) return;
    shown = page;
    if (mode) authView(root, auth, mode);
    else landingView(root, apiUrl, problem);
    window.scrollTo(0, 0);
    document.title = mode ? 'Sign in · TagFluent' : 'TagFluent: your marketing source of truth';
  };
  window.addEventListener('hashchange', render);
  render();
}

void boot(document.getElementById('app')!);
