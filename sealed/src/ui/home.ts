import { checkName, checkNewPoll, LIMITS, type Method, type NewPoll, type Show } from '../core/model';
import { api } from './api';
import { fill, h } from './dom';
import { save, savedPolls } from './saved';

/** A finished poll's choices and people, to start the next one from. */
export type Template = Omit<NewPoll, 'title'> & { title?: string };

interface Draft {
  title: string;
  method: Method;
  scale: number;
  show: Show;
  choices: Array<{ label: string; link: string }>;
  voters: string[];
}

const METHOD_OPTIONS: Array<{ value: Method; title: string; text: string }> = [
  { value: 'rate', title: 'Rate each one', text: 'Everyone scores every choice. Highest total wins.' },
  { value: 'pick', title: 'Pick one', text: 'Everyone picks a favorite. Most picks wins.' },
  { value: 'rank', title: 'Rank them', text: 'Everyone puts them in order. Best overall placing wins.' },
];

const SHOW_OPTIONS: Array<{ value: Show; title: string; text: string }> = [
  { value: 'scores', title: 'The ranking and the scores', text: 'Every choice in order, with its points.' },
  { value: 'order', title: 'The ranking, no scores', text: 'Every choice in order, no numbers.' },
  { value: 'winner', title: 'Just the winner', text: 'Only what won. The rest stays sealed.' },
];

export function renderHome(root: HTMLElement, go: (path: string) => void, template?: Template): void {
  document.title = 'Sealed: vote in secret, see the winner together';
  const draft: Draft = {
    title: template?.title ?? '',
    method: template?.method ?? 'rate',
    scale: template?.scale ?? 10,
    show: template?.show ?? 'scores',
    choices: template?.choices.map((c) => ({ label: c.label, link: c.link ?? '' })) ?? [],
    voters: template?.voters ?? [],
  };
  while (draft.choices.length < 3) draft.choices.push({ label: '', link: '' });

  const choicesEl = h('ol', { class: 'choice-rows' });
  const peopleEl = h('ul', { class: 'chips', 'aria-live': 'polite' });
  const scaleEl = h('div', { class: 'scale-row' });
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, 'Create the poll');

  // ---- Choices -----------------------------------------------------------

  function renderChoices(focusIndex?: number, focusField: 'label' | 'link' = 'label'): void {
    fill(
      choicesEl,
      draft.choices.map((choice, i) => {
        const label = h('input', {
          type: 'text',
          value: choice.label,
          maxlength: LIMITS.label,
          placeholder: i === 0 ? 'e.g. Paddington 2' : `Choice ${i + 1}`,
          'aria-label': `Choice ${i + 1}`,
          'data-index': i,
        });
        label.addEventListener('input', () => (choice.label = label.value));
        label.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (i === draft.choices.length - 1) addChoice();
            else focusChoice(i + 1);
          }
        });
        // Paste a list (one per line, say from notes) and it becomes that many choices.
        label.addEventListener('paste', (event) => {
          const text = event.clipboardData?.getData('text') ?? '';
          const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
          if (lines.length < 2) return;
          event.preventDefault();
          const rows = lines.map((line) => ({ label: line, link: '' }));
          const empties = draft.choices.slice(i + 1).every((c) => !c.label && !c.link);
          draft.choices.splice(i, empties ? draft.choices.length - i : 1, ...rows);
          renderChoices(i + rows.length - 1);
        });

        const link = h('input', {
          type: 'url',
          inputmode: 'url',
          value: choice.link,
          maxlength: LIMITS.link,
          placeholder: 'Link (optional): a trailer, a menu…',
          'aria-label': `Link for choice ${i + 1} (optional)`,
          class: 'link-input',
        });
        link.addEventListener('input', () => (choice.link = link.value));

        const remove = h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `Remove choice ${i + 1}`,
            title: 'Remove',
            disabled: draft.choices.length <= LIMITS.minChoices,
            onclick: () => {
              draft.choices.splice(i, 1);
              renderChoices(Math.min(i, draft.choices.length - 1));
            },
          },
          '×',
        );
        return h('li', { class: 'choice-row' }, h('div', { class: 'choice-fields' }, label, link), remove);
      }),
    );
    if (focusIndex !== undefined) focusChoice(focusIndex, focusField);
  }

  function focusChoice(index: number, field: 'label' | 'link' = 'label'): void {
    const row = choicesEl.children[index];
    row?.querySelector<HTMLInputElement>(field === 'label' ? 'input:not(.link-input)' : '.link-input')?.focus();
  }

  function addChoice(): void {
    if (draft.choices.length >= LIMITS.maxChoices) return;
    draft.choices.push({ label: '', link: '' });
    renderChoices(draft.choices.length - 1);
  }

  // ---- People ------------------------------------------------------------

  const nameInput = h('input', {
    type: 'text',
    maxlength: LIMITS.name,
    placeholder: draft.voters.length ? 'Add another name' : 'Start with your own name',
    'aria-label': 'Add a name',
    autocomplete: 'off',
    enterkeyhint: 'done',
  });
  const nameError = h('p', { class: 'field-error', role: 'alert' });

  function addPerson(): void {
    // "Sam, Alex, Robin" adds three people at once.
    const names = nameInput.value.split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) return;
    for (const name of names) {
      const problem = checkName(name, draft.voters);
      if (problem) {
        nameError.textContent = problem;
        return;
      }
      if (draft.voters.length >= LIMITS.maxVoters) {
        nameError.textContent = `A poll can have up to ${LIMITS.maxVoters} people.`;
        return;
      }
      draft.voters.push(name.replace(/\s+/g, ' '));
    }
    nameInput.value = '';
    nameError.textContent = '';
    nameInput.placeholder = 'Add another name';
    renderPeople();
  }
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addPerson();
    } else if (event.key === 'Backspace' && !nameInput.value && draft.voters.length) {
      draft.voters.pop();
      renderPeople();
    }
  });

  function renderPeople(): void {
    fill(
      peopleEl,
      draft.voters.map((name, i) =>
        h(
          'li',
          { class: 'chip' },
          h('span', null, name),
          i === 0 ? h('span', { class: 'chip-note' }, 'you?') : null,
          h(
            'button',
            {
              type: 'button',
              class: 'chip-x',
              'aria-label': `Remove ${name}`,
              onclick: () => {
                draft.voters.splice(i, 1);
                renderPeople();
                nameInput.focus();
              },
            },
            '×',
          ),
        ),
      ),
    );
  }

  // ---- Radio cards -------------------------------------------------------

  function radioCards<T extends string>(
    name: string,
    options: Array<{ value: T; title: string; text: string }>,
    current: T,
    onChange: (value: T) => void,
  ): HTMLElement {
    return h(
      'div',
      { class: 'radio-cards', role: 'radiogroup' },
      options.map((option) => {
        const input = h('input', {
          type: 'radio',
          name,
          value: option.value,
          checked: option.value === current,
          onchange: () => onChange(option.value),
        });
        return h(
          'label',
          { class: 'radio-card' },
          input,
          h('span', { class: 'radio-card-title' }, option.title),
          h('span', { class: 'radio-card-text' }, option.text),
        );
      }),
    );
  }

  function renderScale(): void {
    scaleEl.hidden = draft.method !== 'rate';
    fill(
      scaleEl,
      h('span', { class: 'scale-label' }, 'Scale'),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Rating scale' },
        LIMITS.scales.map((scale) =>
          h(
            'label',
            null,
            h('input', {
              type: 'radio',
              name: 'scale',
              value: scale,
              checked: draft.scale === scale,
              onchange: () => (draft.scale = scale),
            }),
            h('span', null, `1 to ${scale}`),
          ),
        ),
      ),
    );
  }

  // ---- The form ----------------------------------------------------------

  const titleInput = h('input', {
    id: 'title',
    type: 'text',
    value: draft.title,
    maxlength: LIMITS.title,
    placeholder: 'e.g. Friday movie night',
    required: true,
  });
  titleInput.addEventListener('input', () => (draft.title = titleInput.value));

  const form = h(
    'form',
    { class: 'card create', novalidate: true },
    h(
      'div',
      { class: 'step' },
      h('label', { class: 'step-title', for: 'title' }, h('span', { class: 'step-n' }, '1'), 'What are you deciding?'),
      titleInput,
    ),
    h(
      'div',
      { class: 'step' },
      h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '2'), 'The choices'),
      h('p', { class: 'hint' }, 'Press Enter for the next one, or paste a list with one per line.'),
      choicesEl,
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: addChoice }, '+ Add a choice'),
    ),
    h(
      'div',
      { class: 'step' },
      h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '3'), 'How does everyone vote?'),
      radioCards('method', METHOD_OPTIONS, draft.method, (value) => {
        draft.method = value;
        renderScale();
      }),
      scaleEl,
    ),
    h(
      'div',
      { class: 'step' },
      h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '4'), 'Who’s voting?'),
      h(
        'p',
        { class: 'hint' },
        'Include yourself. The results open on their own once everyone on this list has voted. Anyone with the link can add their name until then.',
      ),
      peopleEl,
      h(
        'div',
        { class: 'add-person' },
        nameInput,
        h('button', { type: 'button', class: 'btn', onclick: addPerson }, 'Add'),
      ),
      nameError,
    ),
    h(
      'div',
      { class: 'step' },
      h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '5'), 'What does everyone see at the end?'),
      radioCards('show', SHOW_OPTIONS, draft.show, (value) => (draft.show = value)),
      h(
        'p',
        { class: 'hint' },
        'With only two or three people, totals can give votes away: you know your own scores, so you can subtract them. Hide the scores if that matters.',
      ),
    ),
    errorEl,
    submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (nameInput.value.trim()) addPerson();
    if (nameError.textContent) return;
    const input: NewPoll = {
      title: draft.title,
      method: draft.method,
      ...(draft.method === 'rate' ? { scale: draft.scale } : {}),
      show: draft.show,
      choices: draft.choices.map((c) => ({ label: c.label, ...(c.link.trim() ? { link: c.link } : {}) })),
      voters: draft.voters,
    };
    const checked = checkNewPoll(input);
    if (!checked.ok) {
      errorEl.textContent = checked.error;
      return;
    }
    errorEl.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Creating…';
    try {
      const { id, adminKey } = await api.create(checked.poll);
      save(id, { title: checked.poll.title, adminKey });
      go(`/p/${id}`);
    } catch (error) {
      errorEl.textContent = (error as Error).message;
      submit.disabled = false;
      submit.textContent = 'Create the poll';
    }
  });

  renderChoices();
  renderPeople();
  renderScale();

  const mine = savedPolls().slice(0, 8);

  fill(
    root,
    h(
      'section',
      { class: 'hero' },
      h('h1', null, 'Vote in secret.', h('br'), 'See the winner together.'),
      h(
        'p',
        { class: 'lede' },
        'Make a list, send the link, and everyone votes on their own phone. No one sees anyone else’s vote, and the result opens by itself once the last vote is in. For movie night, where to eat, which weekend works, or anything a group has to pick.',
      ),
    ),
    mine.length
      ? h(
          'section',
          { class: 'card mine' },
          h('h2', null, 'Your polls'),
          h(
            'ul',
            { class: 'mine-list' },
            mine.map((p) =>
              h(
                'li',
                null,
                h('a', { href: `/p/${p.id}`, onclick: link(go, `/p/${p.id}`) }, p.title || 'Untitled poll'),
                h('span', { class: 'muted' }, p.adminKey ? 'Host' : p.name ? `Voting as ${p.name}` : ''),
              ),
            ),
          ),
        )
      : null,
    template ? h('p', { class: 'notice' }, 'Same choices and people as last time. Change anything you like.') : null,
    form,
    h(
      'section',
      { class: 'how' },
      h('h2', null, 'How it stays secret'),
      h(
        'ol',
        null,
        h('li', null, h('strong', null, 'Each vote is sealed. '), 'It goes straight to the server. No one can see it, not even the host.'),
        h('li', null, h('strong', null, 'Everyone sees who’s voted, never what. '), 'So you know who you’re waiting on.'),
        h(
          'li',
          null,
          h('strong', null, 'The last vote opens them all. '),
          'Only the combined result is shown. The host can open the votes early if someone can’t make it.',
        ),
      ),
    ),
  );
}

/** A click handler that navigates inside the app, leaving modified clicks (new tab) to the browser. */
export function link(go: (path: string) => void, path: string): (event: Event) => void {
  return (event: Event) => {
    const e = event as MouseEvent;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    event.preventDefault();
    go(path);
  };
}
