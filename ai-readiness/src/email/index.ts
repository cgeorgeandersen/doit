/**
 * Which email adapter the page uses. This is the one line to change to turn
 * the email form on; see the README, "Turn on email".
 *
 * The stub sends nothing: the form appears only in `npm run dev`, to try it.
 * To send for real, point postJsonAdapter at an endpoint that sends the email:
 *
 *   import { postJsonAdapter } from './adapter.ts';
 *   export const emailAdapter = postJsonAdapter('/api/email-result');
 */
import { stubAdapter, type EmailAdapter } from './adapter.ts';

export const emailAdapter: EmailAdapter = stubAdapter();
