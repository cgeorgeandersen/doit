/**
 * Sends the job ticket to /api/estimate and shows the result in place. The
 * phone number in the error messages comes from the page, so it stays in sync
 * with src/config/site.ts.
 */

type Contact = 'call' | 'text' | 'email';

const THANKS: Record<Contact, string> = {
  call: "We'll call you with a price.",
  text: "We'll text you with a price.",
  email: "We'll email you with a price.",
};

export function initEstimateForm(ticket: HTMLElement): void {
  const form = ticket.querySelector<HTMLFormElement>('[data-estimate-form]');
  const status = ticket.querySelector<HTMLElement>('[data-status]');
  const done = ticket.querySelector<HTMLElement>('[data-done]');
  if (!form || !status || !done) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const email = form.querySelector<HTMLInputElement>('input[name="email"]');
  const emailOptional = form.querySelector<HTMLElement>('[data-email-optional]');
  const phoneLink = ticket.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
  const phone = phoneLink?.textContent?.trim() ?? 'us';

  // /estimate?service=drywall-repair ticks that box.
  const wanted = new URLSearchParams(window.location.search).get('service');
  if (wanted) {
    for (const box of form.querySelectorAll<HTMLInputElement>('input[name="services"]')) {
      if (box.value === wanted) box.checked = true;
    }
  }

  // Email becomes required when it's the chosen way to reach someone.
  const syncEmail = () => {
    const byEmail = form.querySelector<HTMLInputElement>('input[name="contact"]:checked')?.value === 'email';
    if (email) email.required = byEmail;
    if (emailOptional) emailOptional.hidden = byEmail;
  };
  form.addEventListener('change', syncEmail);
  syncEmail();

  const showError = (message: string) => {
    status.textContent = message;
    status.classList.add('error');
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    status.classList.remove('error');

    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const services = data.getAll('services').map(String);
    const details = value('details');

    const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement>(':invalid');
    if (invalid) {
      if (invalid.name === 'email') {
        showError(invalid.value ? 'That email address doesn’t look right.' : 'Please add your email, since that’s how you’d like us to reach you.');
      } else if (invalid.name === 'town') {
        showError('Please choose your town.');
      } else {
        const label = invalid.closest('label')?.querySelector('span')?.textContent?.replace('*', '').trim().toLowerCase() ?? 'details';
        showError(`Please fill in your ${label}.`);
      }
      invalid.focus();
      return;
    }
    if (services.length === 0 && !details) {
      showError('Tick a type of work or describe the job, so we know what you need.');
      form.querySelector<HTMLInputElement>('input[name="services"]')?.focus();
      return;
    }

    const contact = (value('contact') || 'call') as Contact;
    const body = {
      name: value('name'),
      phone: value('phone'),
      email: value('email'),
      address: value('address'),
      town: value('town'),
      services,
      details,
      contact,
      company: value('company'),
    };

    if (button) {
      button.disabled = true;
      button.textContent = 'Sending…';
    }
    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: { message?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        const title = done.querySelector('[data-done-title]');
        const text = done.querySelector('[data-done-text]');
        if (title) title.textContent = `Thanks, ${body.name.split(' ')[0]}!`;
        if (text) text.textContent = THANKS[contact];
        form.hidden = true;
        done.hidden = false;
        done.focus();
        return;
      }
      if (res.status === 400 && json.message) showError(json.message);
      else if (res.status === 503) showError(`Online tickets aren’t switched on yet. Please call or text ${phone} instead.`);
      else showError(`Something went wrong sending your ticket. Please try again, or call or text ${phone}.`);
    } catch {
      showError(`We couldn’t reach the server. Check your connection and try again, or call or text ${phone}.`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Submit Ticket';
      }
    }
  });
}
