import { describeMethod, LIMITS, type Ballot, type Poll, type PollView, type Results, type VoterStatus } from '../core/model';
import { api, ApiError } from './api';
import { fill, h } from './dom';
import { link, type Template } from './home';
import { forgetVoter, loadSaved, save, type SavedPoll } from './saved';

/** How often an open poll checks who's voted, and whether the votes have opened. */
const REFRESH_MS = 4000;

/**
 * The poll page. One link for everyone: pick your name, vote, wait, see the result.
 * The host sees the same page plus a few controls. Returns a function that stops
 * the refreshing, for when you leave the page.
 */
export function renderPoll(
  root: HTMLElement,
  id: string,
  go: (path: string, template?: Template) => void,
): () => void {
  // The host link carries the key after #, which never reaches the server. Keep it, then hide it.
  const hostKey = new URLSearchParams(location.hash.slice(1)).get('host');
  if (hostKey) {
    save(id, { adminKey: hostKey });
    history.replaceState(null, '', `/p/${id}`);
  }

  let view: PollView | null = null;
  let saved: SavedPoll | undefined = loadSaved(id);
  /** True while the ballot form is showing for someone who has already voted. */
  let changing = false;
  let draft: Ballot | null = null;
  let stopped = false;
  /**
   * Bumped by everything that changes the poll from this page, so a refresh that
   * set off before (and lands after) can't paint the old state back.
   */
  let generation = 0;

  const headerEl = h('header', { class: 'poll-head' });
  const mainEl = h('section', { class: 'card main-card', 'aria-live': 'polite' });
  const peopleEl = h('section', { class: 'card people' });
  const shareEl = h('section', { class: 'card share' });
  const hostEl = h('section', { class: 'card host' });
  const toastEl = h('p', { class: 'toast', role: 'status' });
  fill(root, headerEl, mainEl, shareEl, peopleEl, hostEl, toastEl);
  fill(mainEl, h('p', { class: 'muted' }, 'Opening the poll…'));

  /** Re-renders a section only when what it shows has changed, so focus and typing survive a refresh. */
  const shown = new Map<HTMLElement, string>();
  function update(el: HTMLElement, key: string, render: () => void): void {
    if (shown.get(el) === key) return;
    shown.set(el, key);
    render();
  }

  let toastTimer = 0;
  function toast(message: string): void {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 4000);
  }

  function me(): VoterStatus | undefined {
    return saved?.voterId ? view?.voters.find((v) => v.id === saved!.voterId) : undefined;
  }

  async function refresh(): Promise<void> {
    const started = generation;
    try {
      const next = await api.view(id);
      if (started === generation && !stopped) accept(next);
    } catch (error) {
      if (view || stopped) return; // Keep showing what we have; the next refresh may work.
      document.title = 'Poll not found · Sealed';
      fill(
        mainEl,
        h('h1', null, (error as ApiError).status === 404 ? 'Poll not found' : 'Couldn’t open the poll'),
        h('p', null, (error as Error).message),
        h('p', null, h('a', { href: '/', onclick: link(go, '/') }, 'Make a new poll')),
      );
      shareEl.hidden = peopleEl.hidden = hostEl.hidden = true;
    }
  }

  function accept(next: PollView): void {
    view = next;
    // If the host freed or removed your name, this device isn't you any more.
    const mine = me();
    if (saved?.voterId && (!mine || !mine.taken)) {
      toast(
        mine
          ? `The host freed up ${mine.name} on this device. Pick your name again to vote.`
          : 'The host took you off the list.',
      );
      forgetVoter(id);
      saved = loadSaved(id);
      changing = false;
      draft = null;
    }
    saved = save(id, { title: next.poll.title });
    render();
  }

  function render(): void {
    if (!view) return;
    const { poll, voters, closed } = view;
    const mine = me();
    document.title = `${poll.title} · Sealed`;
    const voted = voters.filter((v) => v.voted).length;

    update(headerEl, `${closed}|${voted}|${voters.length}`, () =>
      fill(
        headerEl,
        h('p', { class: 'eyebrow' }, closed ? 'Votes opened' : `${describeMethod(poll.method, poll.scale)}`),
        h('h1', null, poll.title),
        h(
          'p',
          { class: 'progress-line' },
          closed
            ? `${view!.results?.ballots ?? voted} of ${voters.length} voted`
            : `${voted} of ${voters.length} have voted`,
        ),
        h(
          'div',
          { class: 'meter', role: 'presentation' },
          h('span', { style: `width: ${voters.length ? (voted / voters.length) * 100 : 0}%` }),
        ),
      ),
    );

    let phase: string;
    if (closed) phase = 'results';
    else if (!mine) phase = `who|${voters.map((v) => `${v.id}:${v.taken}:${v.voted}`).join(',')}`;
    else if (!mine.voted || changing) phase = `ballot|${mine.id}`;
    else phase = `sealed|${mine.id}`;
    update(mainEl, phase, () => {
      if (phase === 'results') renderResults(view!.results!);
      else if (phase.startsWith('who')) renderWho();
      else if (phase.startsWith('ballot')) renderBallot(mine!);
      else renderSealed(mine!);
    });

    shareEl.hidden = closed;
    update(shareEl, 'share', renderShare);

    const host = Boolean(saved?.adminKey);
    peopleEl.hidden = false;
    update(peopleEl, JSON.stringify([closed, host, mine?.id, voters]), () => renderPeople(host, mine));

    hostEl.hidden = !host || closed;
    update(hostEl, `${host}|${closed}|${voted}|${voters.length}`, renderHost);
  }

  // ---- Who are you? ------------------------------------------------------

  function renderWho(): void {
    const { voters } = view!;
    const error = h('p', { class: 'form-error', role: 'alert' });
    const nameInput = h('input', {
      type: 'text',
      maxlength: LIMITS.name,
      placeholder: 'Your name',
      'aria-label': 'Your name',
      autocomplete: 'given-name',
    });

    async function pick(voter: VoterStatus): Promise<void> {
      generation++;
      try {
        const { token } = await api.claim(id, voter.id);
        saved = save(id, { voterId: voter.id, token, name: voter.name });
        render();
        void refresh();
      } catch (e) {
        error.textContent = (e as Error).message;
        void refresh();
      }
    }

    const joinForm = h(
      'form',
      { class: 'join' },
      h('label', { class: 'join-label' }, 'Not on the list? Add yourself.'),
      h('div', { class: 'add-person' }, nameInput, h('button', { class: 'btn', type: 'submit' }, 'Add me')),
    );
    joinForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      generation++;
      try {
        const { voterId, token } = await api.join(id, nameInput.value);
        saved = save(id, { voterId, token, name: nameInput.value.trim() });
        await refresh();
      } catch (e) {
        error.textContent = (e as Error).message;
      }
    });

    fill(
      mainEl,
      h('h2', null, 'Who are you?'),
      h('p', { class: 'hint' }, 'Tap your name. This device will vote as you, and no one else can pick it.'),
      h(
        'div',
        { class: 'names' },
        voters.map((voter) =>
          h(
            'button',
            {
              type: 'button',
              class: 'name-btn',
              disabled: voter.taken,
              onclick: () => void pick(voter),
            },
            h('span', null, voter.name),
            voter.taken ? h('span', { class: 'name-note' }, voter.voted ? 'voted' : 'taken') : null,
          ),
        ),
      ),
      error,
      joinForm,
    );
  }

  // ---- The ballot --------------------------------------------------------

  function emptyBallot(poll: Poll): Ballot {
    if (poll.method === 'rate') return { method: 'rate', ratings: {} };
    if (poll.method === 'pick') return { method: 'pick', choice: '' };
    // A random starting order, so the order the host typed doesn't nudge anyone.
    const order = poll.choices.map((c) => c.id);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    return { method: 'rank', order };
  }

  function renderBallot(voter: VoterStatus): void {
    const poll = view!.poll;
    const ballot = (draft ??= emptyBallot(poll));
    const error = h('p', { class: 'form-error', role: 'alert' });
    const status = h('p', { class: 'ballot-status' });
    const submit = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, 'Seal my vote');

    const choiceLabel = (id: string) => poll.choices.find((c) => c.id === id)!;
    const linkEl = (href?: string) =>
      href ? h('a', { class: 'choice-link', href, target: '_blank', rel: 'noopener noreferrer' }, 'Open link ↗') : null;

    function updateStatus(): void {
      if (ballot.method === 'rate') {
        const done = poll.choices.filter((c) => ballot.ratings[c.id]).length;
        status.textContent = done === poll.choices.length ? 'All rated.' : `${done} of ${poll.choices.length} rated`;
      } else if (ballot.method === 'pick') {
        status.textContent = ballot.choice ? `You picked ${choiceLabel(ballot.choice).label}.` : 'Pick one.';
      } else {
        status.textContent = 'Best at the top. They start in a random order, so move each one with the arrows.';
      }
    }

    let body: HTMLElement;
    if (ballot.method === 'rate') {
      body = h(
        'div',
        { class: 'rate-list' },
        poll.choices.map((choice) =>
          h(
            'fieldset',
            { class: 'rate-item' },
            h('legend', null, h('span', { class: 'choice-name' }, choice.label)),
            linkEl(choice.link),
            h(
              'div',
              { class: `rate-scale scale-${poll.scale}` },
              Array.from({ length: poll.scale }, (_, i) => i + 1).map((n) =>
                h(
                  'label',
                  null,
                  h('input', {
                    type: 'radio',
                    name: `rate-${choice.id}`,
                    value: n,
                    checked: ballot.ratings[choice.id] === n,
                    'aria-label': `${n} out of ${poll.scale}`,
                    onchange: () => {
                      ballot.ratings[choice.id] = n;
                      updateStatus();
                    },
                  }),
                  h('span', { 'aria-hidden': 'true' }, n),
                ),
              ),
            ),
            h(
              'div',
              { class: 'rate-ends', 'aria-hidden': 'true' },
              h('span', null, 'Not for me'),
              h('span', null, 'Love it'),
            ),
          ),
        ),
      );
    } else if (ballot.method === 'pick') {
      body = h(
        'div',
        { class: 'radio-cards pick-list', role: 'radiogroup', 'aria-label': 'Your pick' },
        poll.choices.map((choice) =>
          h(
            'label',
            { class: 'radio-card' },
            h('input', {
              type: 'radio',
              name: 'pick',
              value: choice.id,
              checked: ballot.choice === choice.id,
              onchange: () => {
                ballot.choice = choice.id;
                updateStatus();
              },
            }),
            h('span', { class: 'radio-card-title' }, choice.label),
            linkEl(choice.link),
          ),
        ),
      );
    } else {
      const list = h('ol', { class: 'rank-list' });
      const renderRank = (focus?: { id: string; dir: 'up' | 'down' }) => {
        fill(
          list,
          ballot.order.map((cid, i) => {
            const choice = choiceLabel(cid);
            const move = (dir: 'up' | 'down') => {
              const j = dir === 'up' ? i - 1 : i + 1;
              [ballot.order[i], ballot.order[j]] = [ballot.order[j]!, ballot.order[i]!];
              // Keep focus on the arrow you pressed, unless the choice hit the end of the list.
              const atEnd = dir === 'up' ? j === 0 : j === ballot.order.length - 1;
              renderRank({ id: cid, dir: atEnd ? (dir === 'up' ? 'down' : 'up') : dir });
            };
            return h(
              'li',
              { class: 'rank-item', 'data-id': cid },
              h('span', { class: 'rank-n', 'aria-hidden': 'true' }, i + 1),
              h('span', { class: 'rank-label' }, h('span', { class: 'choice-name' }, choice.label), linkEl(choice.link)),
              h(
                'span',
                { class: 'rank-moves' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    'data-dir': 'up',
                    'aria-label': `Move ${choice.label} up`,
                    disabled: i === 0,
                    onclick: () => move('up'),
                  },
                  '↑',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    'data-dir': 'down',
                    'aria-label': `Move ${choice.label} down`,
                    disabled: i === ballot.order.length - 1,
                    onclick: () => move('down'),
                  },
                  '↓',
                ),
              ),
            );
          }),
        );
        if (focus) list.querySelector<HTMLButtonElement>(`[data-id="${focus.id}"] [data-dir="${focus.dir}"]`)?.focus();
      };
      renderRank();
      body = list;
    }

    const form = h(
      'form',
      { class: 'ballot', novalidate: true },
      h('h2', null, `Your vote, ${voter.name}`),
      h(
        'p',
        { class: 'hint' },
        `${describeMethod(poll.method, poll.scale)}. No one will see your vote. You can change it until the votes open.`,
      ),
      body,
      status,
      error,
      h(
        'div',
        { class: 'actions' },
        submit,
        changing
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                onclick: () => {
                  changing = false;
                  draft = null;
                  render();
                },
              },
              'Keep my sealed vote',
            )
          : null,
      ),
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (ballot.method === 'rate') {
        const missing = poll.choices.filter((c) => !ballot.ratings[c.id]);
        if (missing.length) {
          error.textContent = `Rate ${missing.map((c) => c.label).join(', ')} too.`;
          return;
        }
      } else if (ballot.method === 'pick' && !ballot.choice) {
        error.textContent = 'Pick one first.';
        return;
      }
      error.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Sealing…';
      generation++;
      try {
        const next = await api.vote(id, saved!.voterId!, saved!.token!, ballot);
        changing = false;
        draft = null;
        accept(next);
        if (!next.closed) toast('Your vote is sealed.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {
        error.textContent = (e as Error).message;
        submit.disabled = false;
        submit.textContent = 'Seal my vote';
        void refresh();
      }
    });

    fill(mainEl, form);
    updateStatus();
  }

  function renderSealed(voter: VoterStatus): void {
    const waiting = view!.voters.filter((v) => !v.voted).map((v) => v.name);
    const change = h('button', { type: 'button', class: 'btn' }, 'Change my vote');
    change.addEventListener('click', async () => {
      change.disabled = true;
      try {
        const { ballot } = await api.myBallot(id, saved!.voterId!, saved!.token!);
        draft = ballot;
        changing = true;
        render();
      } catch (e) {
        toast((e as Error).message);
        change.disabled = false;
      }
    });
    fill(
      mainEl,
      h('div', { class: 'seal', 'aria-hidden': 'true' }),
      h('h2', { class: 'center' }, `Your vote is sealed, ${voter.name}.`),
      h(
        'p',
        { class: 'center hint' },
        waiting.length === 1
          ? `Waiting on ${waiting[0]}. The votes open when they’re in. This page updates by itself.`
          : `Waiting on ${waiting.length} people. The votes open when everyone’s in. This page updates by itself.`,
      ),
      h('div', { class: 'actions center' }, change),
    );
  }

  // ---- Results -----------------------------------------------------------

  function renderResults(results: Results): void {
    const { poll, voters } = view!;
    const label = (cid: string) => poll.choices.find((c) => c.id === cid);
    const winners = results.winners.map((cid) => label(cid)!);
    const unit = poll.method === 'pick' ? ['vote', 'votes'] : ['point', 'points'];
    const plural = (n: number) => `${n} ${n === 1 ? unit[0] : unit[1]}`;

    const standings =
      poll.show === 'winner'
        ? null
        : h(
            'ol',
            { class: 'standings' },
            results.standings.map((s) =>
              h(
                'li',
                { class: s.place === 1 ? 'standing first' : 'standing' },
                h('span', { class: 'standing-place' }, s.place),
                h(
                  'div',
                  { class: 'standing-body' },
                  h(
                    'div',
                    { class: 'standing-top' },
                    h('span', { class: 'choice-name' }, s.label),
                    s.score !== undefined
                      ? h(
                          'span',
                          { class: 'standing-score' },
                          plural(s.score),
                          s.average !== undefined ? h('span', { class: 'muted' }, ` · avg ${s.average}`) : null,
                        )
                      : null,
                  ),
                  s.score !== undefined && results.maxScore
                    ? h(
                        'div',
                        { class: 'bar', role: 'presentation' },
                        h('span', { style: `width: ${(s.score / results.maxScore) * 100}%` }),
                      )
                    : null,
                ),
              ),
            ),
          );

    const template: Template = {
      method: poll.method,
      ...(poll.method === 'rate' ? { scale: poll.scale } : {}),
      show: poll.show,
      choices: poll.choices.map((c) => ({ label: c.label, ...(c.link ? { link: c.link } : {}) })),
      voters: voters.map((v) => v.name),
    };

    fill(
      mainEl,
      h('p', { class: 'eyebrow center' }, winners.length > 1 ? 'It’s a tie' : 'The winner'),
      h(
        'div',
        { class: 'winner' },
        winners.length
          ? winners.map((w) =>
              h(
                'p',
                { class: 'winner-name' },
                w.label,
                w.link
                  ? h('a', { class: 'choice-link', href: w.link, target: '_blank', rel: 'noopener noreferrer' }, ' ↗')
                  : null,
              ),
            )
          : h('p', { class: 'winner-name' }, 'No votes'),
      ),
      winners.length > 1 ? h('p', { class: 'center hint' }, 'Flip a coin, or run a quick pick-one poll between them.') : null,
      standings,
      h(
        'p',
        { class: 'footnote' },
        `${results.ballots} ${results.ballots === 1 ? 'vote' : 'votes'} counted. `,
        poll.method === 'rate'
          ? `Each choice’s points are its ratings added up${results.maxScore ? `, out of ${results.maxScore}` : ''}. `
          : poll.method === 'rank'
            ? `First place on a ballot is worth ${poll.choices.length} points, last place 1. `
            : '',
        'No one’s individual vote is shown, not even to the host.',
      ),
      h(
        'div',
        { class: 'actions center' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('/', template) }, 'Run it again'),
        h('a', { class: 'btn', href: '/', onclick: link(go, '/') }, 'New poll'),
      ),
    );
  }

  // ---- Share, people, host ----------------------------------------------

  function renderShare(): void {
    const url = `${location.origin}/p/${id}`;
    fill(
      shareEl,
      h('h2', null, 'Send everyone this link'),
      copyRow(url, 'Poll link', toast),
      'share' in navigator
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet',
              onclick: () =>
                void navigator.share({ title: view?.poll.title, text: `Vote: ${view?.poll.title}`, url }).catch(() => {}),
            },
            'Share…',
          )
        : null,
    );
  }

  function renderPeople(host: boolean, mine: VoterStatus | undefined): void {
    const { voters, closed } = view!;
    const canRemove = voters.length > LIMITS.minVoters;

    async function hostAction(action: 'remove' | 'release', voter: VoterStatus): Promise<void> {
      const question =
        action === 'remove'
          ? `Take ${voter.name} off the list?${voter.voted ? ' Their vote will be thrown away.' : ''}`
          : `Free up ${voter.name}’s name so it can be picked on another device?${voter.voted ? ' Their vote will be cleared and they’ll vote again.' : ''}`;
      if (!confirm(question)) return;
      generation++;
      try {
        accept(await (action === 'remove' ? api.remove : api.release)(id, saved!.adminKey!, voter.id));
      } catch (e) {
        toast((e as Error).message);
      }
    }

    fill(
      peopleEl,
      h('h2', null, closed ? 'Who voted' : 'Who’s voted'),
      h(
        'ul',
        { class: 'people-list' },
        voters.map((voter) =>
          h(
            'li',
            null,
            h('span', { class: 'person' }, voter.name, voter.id === mine?.id ? h('span', { class: 'muted' }, ' (you)') : null),
            h(
              'span',
              { class: voter.voted ? 'pill pill-done' : 'pill' },
              voter.voted ? '✓ Voted' : closed ? 'Didn’t vote' : voter.taken ? 'Voting…' : 'Not here yet',
            ),
            host && !closed
              ? h(
                  'span',
                  { class: 'person-actions' },
                  voter.taken
                    ? h('button', { type: 'button', class: 'link-btn', onclick: () => void hostAction('release', voter) }, 'Free up')
                    : null,
                  canRemove
                    ? h('button', { type: 'button', class: 'link-btn', onclick: () => void hostAction('remove', voter) }, 'Remove')
                    : null,
                )
              : null,
          ),
        ),
      ),
    );
  }

  function renderHost(): void {
    if (!saved?.adminKey || !view || view.closed) return;
    const voted = view.voters.filter((v) => v.voted).length;
    const missing = view.voters.length - voted;
    const open = h(
      'button',
      {
        type: 'button',
        class: 'btn',
        disabled: voted === 0,
        onclick: async () => {
          const who = missing === 1 ? '1 person hasn’t' : `${missing} people haven’t`;
          if (!confirm(`Open the votes now? ${who} voted, and won’t be able to after.`)) return;
          generation++;
          try {
            accept(await api.reveal(id, saved!.adminKey!));
          } catch (e) {
            toast((e as Error).message);
          }
        },
      },
      'Open the votes now',
    );
    fill(
      hostEl,
      h('h2', null, 'You’re the host'),
      h(
        'p',
        { class: 'hint' },
        'The votes open by themselves when everyone’s in. If someone can’t make it, open them now or take them off the list. If someone picked the wrong name, free it up.',
      ),
      h('div', { class: 'actions' }, open),
      h('h3', null, 'Your host link'),
      h('p', { class: 'hint' }, 'Open it on another device to host from there. Keep it to yourself: it can open the votes early.'),
      copyRow(`${location.origin}/p/${id}#host=${saved.adminKey}`, 'Host link', toast),
    );
  }

  void refresh();
  const timer = window.setInterval(() => {
    if (stopped || document.hidden || view?.closed) return;
    void refresh();
  }, REFRESH_MS);
  const onVisible = () => {
    if (!document.hidden && !view?.closed) void refresh();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function copyRow(url: string, label: string, toast: (message: string) => void): HTMLElement {
  const input = h('input', { type: 'text', readonly: true, value: url, 'aria-label': label, class: 'copy-input' });
  input.addEventListener('focus', () => input.select());
  return h(
    'div',
    { class: 'copy-row' },
    input,
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast('Copied.');
          } catch {
            input.select();
            toast('Press Ctrl+C (or ⌘C) to copy.');
          }
        },
      },
      'Copy',
    ),
  );
}
