import type { Auth } from '../cloud/auth';
import { button } from './components';
import { fill, h } from './dom';
import { icon } from './icons';

/** The page before sign-in. A placeholder to be redesigned: what UTMDM is, and the way in. */
export function landingView(root: HTMLElement, auth: Auth, problem?: string): void {
  fill(
    root,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
      h('span', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('database', 18)), h('span', { class: 'brand-name' }, 'UTMDM')),
      h('div', { class: 'topbar-actions' }, button('Sign in', { onClick: () => void auth.signIn('login') })))),
    h('main', { class: 'page landing', id: 'main' },
      h('section', { class: 'landing-hero' },
        h('p', { class: 'eyebrow' }, 'UTM master data for marketing teams'),
        h('h1', null, 'One shared table for every UTM your team uses'),
        h('p', { class: 'landing-lead' },
          'Classify UTMs by typing a value or writing a rule like "if campaign contains cup, then Type is Marketing". ',
          'Add the columns your team needs, and keep every change as a version you can undo.'),
        problem ? h('p', { class: 'landing-problem', role: 'alert' }, icon('outstanding', 16), problem) : null,
        h('div', { class: 'landing-actions' },
          button('Sign in', { kind: 'primary', icon: 'lock', onClick: () => void auth.signIn('login') }),
          button('Create an account', { onClick: () => void auth.signIn('signup') })),
        h('p', { class: 'muted' }, 'New accounts start with a sample workspace for Zestify, a made-up brand, so there is something to try.')),
      h('ul', { class: 'landing-points' },
        h('li', null, h('strong', null, 'Classify. '), 'Rules fill whole columns, now and as new UTMs arrive.'),
        h('li', null, h('strong', null, 'Keep. '), 'Your table is saved to your account, with the full history.'),
        h('li', null, h('strong', null, 'Export. '), 'Download the classified table as CSV, with warehouses next.'))),
    h('footer', { class: 'footer' }, h('p', null, h('strong', null, 'UTMDM'), '. Sign-in is handled by Amazon Cognito.')),
  );
}
