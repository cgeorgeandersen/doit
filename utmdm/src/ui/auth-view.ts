import { AuthError, PASSWORD_RULE, type Auth } from '../cloud/auth';
import { button, themeToggle, wordmark } from './components';
import { fill, h, type Child } from './dom';
import { icon } from './icons';

/*
 * TagFluent's own sign-in pages, in the brand: a story panel on one side and
 * the form on the other. Cognito checks the credentials (see cloud/auth.ts).
 */

interface Values {
  email: string;
  password: string;
  code: string;
}

export type AuthMode = 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset' | 'pending';

/** Which sign-in page a hash asks for, if any. */
export function authModeFor(hash: string): AuthMode | null {
  const page = hash.replace(/^#\/?/, '').split('?')[0];
  return page === 'signin' || page === 'signup' || page === 'forgot' ? page : null;
}

// Kept while someone moves between steps (sign up → confirm → waiting, forgot → reset).
let email = '';
let note = '';

export function authView(root: HTMLElement, auth: Auth, start: AuthMode): void {
  let mode: AuthMode = start;

  const done = () => {
    history.replaceState(null, '', '/');
    location.reload();
  };

  function render(): void {
    fill(root,
      h('main', { class: 'auth', id: 'main' },
        h('aside', { class: 'auth-story' },
          h('a', { class: 'auth-brand', href: '/', 'aria-label': 'TagFluent home' }, wordmark()),
          h('div', { class: 'auth-story-body' },
            h('h2', null, 'Your marketing source of truth.'),
            h('ul', { class: 'auth-points' },
              h('li', null, icon('check', 16), 'UTMs from Google Analytics, deduplicated'),
              h('li', null, icon('check', 16), 'Classified by rules anyone can read'),
              h('li', null, icon('check', 16), 'Shared by marketing and analytics teams')),
            h('div', { class: 'auth-sample', 'aria-hidden': 'true' },
              h('span', { class: 'utm' }, 'summer_cup_finals'),
              h('span', { class: 'auth-chip' }, icon('bolt', 12), 'Paid Social'),
              h('span', { class: 'auth-chip' }, icon('bolt', 12), 'Marketing'))),
          h('p', { class: 'auth-story-foot' }, icon('lock', 13), 'Secured by Amazon Cognito')),
        h('section', { class: 'auth-panel' },
          h('div', { class: 'auth-top' }, h('a', { class: 'auth-back', href: '/' }, icon('left', 14), 'Back to home'), themeToggle()),
          h('div', { class: 'auth-card' }, ...card()))));
    root.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  function go(next: AuthMode, message = ''): void {
    mode = next;
    note = message;
    if (next === 'signin' || next === 'signup' || next === 'forgot') history.replaceState(null, '', `#/${next}`);
    render();
  }

  /** Signs in, or shows the waiting page when the account hasn't been approved yet. */
  async function signInOrWait(address: string, password: string): Promise<void> {
    try {
      await auth.signIn(address, password);
      done();
    } catch (error) {
      if (error instanceof AuthError && error.code === 'UserDisabled') {
        go('pending');
        return;
      }
      throw error;
    }
  }

  function card(): Child[] {
    switch (mode) {
      case 'pending':
        return [
          h('span', { class: 'auth-pending-icon' }, icon('check', 22)),
          h('h1', null, 'You\'re on the list'),
          h('p', { class: 'auth-intro' }, 'Your email is confirmed. Every TagFluent account is reviewed before it opens, and we\'ll email ',
            email ? h('strong', null, email) : 'you', ' as soon as yours is ready.'),
          h('div', { class: 'auth-foot' },
            h('p', null, 'Want a walkthrough in the meantime? ', h('a', { href: '/' }, 'Book a demo')),
            h('p', null, 'Already approved? ', link('Sign in', () => go('signin')))),
        ];

      case 'signup':
        return form('Create your account', 'Every new account is reviewed before it opens. We\'ll email you as soon as yours is approved.', [
          emailField(),
          passwordField('new-password', 'Choose a password', PASSWORD_RULE),
        ], 'Create account', async (data) => {
          email = data.email;
          await auth.signUp(data.email, data.password);
          go('confirm', `We sent a 6-digit code to ${data.email}.`);
        }, [h('p', null, 'Already have an account? ', link('Sign in', () => go('signin')))]);

      case 'confirm':
        return form('Check your email', 'Enter the code we sent to confirm your address.', [
          codeField(),
        ], 'Confirm and continue', async (data) => {
          await auth.confirmSignUp(email, data.code);
          // New accounts wait for approval, so there is nothing to sign in to yet.
          go('pending');
        }, [h('p', null, 'No email? ', link('Send a new code', async () => {
          try {
            await auth.resendCode(email);
            go('confirm', `We sent a new code to ${email}.`);
          } catch (error) {
            go('confirm', messageOf(error));
          }
        }))]);

      case 'forgot':
        return form('Reset your password', 'Enter your email and we\'ll send you a code.', [
          emailField(),
        ], 'Send code', async (data) => {
          email = data.email;
          await auth.forgotPassword(data.email);
          go('reset', `If there's an account for ${data.email}, a code is on its way.`);
        }, [h('p', null, link('Back to sign in', () => go('signin')))]);

      case 'reset':
        return form('Choose a new password', 'Enter the code from your email and a new password.', [
          codeField(),
          passwordField('new-password', 'New password', PASSWORD_RULE),
        ], 'Save and sign in', async (data) => {
          await auth.resetPassword(email, data.code, data.password);
          await signInOrWait(email, data.password);
        }, [h('p', null, link('Back to sign in', () => go('signin')))]);

      default:
        return form('Welcome back', 'Sign in to your workspace.', [
          emailField(),
          passwordField('current-password', 'Password'),
        ], 'Sign in', async (data) => {
          email = data.email;
          try {
            await signInOrWait(data.email, data.password);
          } catch (error) {
            if (error instanceof AuthError && error.code === 'UserNotConfirmedException') {
              await auth.resendCode(data.email).catch(() => undefined);
              go('confirm', `Confirm your email first. We sent a code to ${data.email}.`);
              return;
            }
            throw error;
          }
        }, [
          h('p', null, link('Forgot your password?', () => go('forgot'))),
          h('p', null, 'New to TagFluent? ', link('Create an account', () => go('signup'))),
        ]);
    }
  }

  function form(title: string, intro: string, fields: HTMLElement[], action: string,
    submit: (data: Values) => Promise<void>, foot: Child[]): Child[] {
    const status = h('p', { class: `auth-note${note ? '' : ' is-empty'}`, role: 'status', 'aria-live': 'polite' }, note);
    const go = button(action, { kind: 'primary', type: 'submit' });
    go.classList.add('auth-submit');
    const el: HTMLFormElement = h('form', {
      class: 'auth-form',
      onsubmit: (event: Event) => {
        event.preventDefault();
        void (async () => {
          const values = new FormData(el);
          const data: Values = { email: String(values.get('email') ?? email), password: String(values.get('password') ?? ''), code: String(values.get('code') ?? '') };
          go.disabled = true;
          go.lastChild!.textContent = 'One moment…';
          status.className = 'auth-note';
          status.textContent = '';
          try {
            await submit(data);
          } catch (error) {
            status.className = 'auth-note is-error';
            status.textContent = messageOf(error);
            go.disabled = false;
            go.lastChild!.textContent = action;
          }
        })();
      },
    }, ...fields, status, go);
    note = '';
    return [h('h1', null, title), h('p', { class: 'auth-intro' }, intro), el, h('div', { class: 'auth-foot' }, ...foot)];
  }

  function emailField(): HTMLElement {
    return field('auth-email', 'Work email', h('input', {
      id: 'auth-email', name: 'email', type: 'email', required: true, autocomplete: 'username email', value: email, 'data-autofocus': !email,
    }));
  }

  function passwordField(autocomplete: string, label: string, hint?: string): HTMLElement {
    const input = h('input', {
      id: 'auth-password', name: 'password', type: 'password', required: true, autocomplete,
      minlength: autocomplete === 'new-password' ? 10 : null, 'data-autofocus': !!email && mode === 'signin',
      'aria-describedby': hint ? 'auth-password-hint' : null,
    });
    const toggle = h('button', {
      type: 'button', class: 'auth-show', 'aria-pressed': 'false',
      onclick: () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show';
        toggle.setAttribute('aria-pressed', String(show));
      },
    }, 'Show');
    return field('auth-password', label, h('span', { class: 'auth-password' }, input, toggle),
      hint ? h('span', { class: 'field-hint', id: 'auth-password-hint' }, hint) : null);
  }

  function codeField(): HTMLElement {
    return field('auth-code', 'Code', h('input', {
      id: 'auth-code', name: 'code', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9 ]{4,10}', maxlength: 10, 'data-autofocus': true,
    }));
  }

  render();
}

function field(id: string, label: string, control: HTMLElement, hint?: Child): HTMLElement {
  return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, label), control, hint ?? null);
}

function link(text: string, run: () => void): HTMLElement {
  return h('button', { type: 'button', class: 'auth-link', onclick: run }, text);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
