/**
 * Chapter 4 tasks for the trust map. `x` is how easy the output is to check
 * (0 = impossible for you, 1 = trivial); `y` is how bad a mistake would be
 * (0 = shrug, 1 = serious harm). Our placements are judgments, not facts, and
 * the page says so.
 */
export interface TrustTask {
  id: string;
  label: string;
  /** a few words for the chip on the map */
  short: string;
  x: number;
  y: number;
  reason: string;
}

export type Quadrant = 'delegate' | 'verify' | 'ideas' | 'human';

export const QUADRANTS: Record<Quadrant, { title: string; line: string }> = {
  delegate: { title: 'Delegate freely', line: 'Easy to check, cheap to get wrong. Let it do the work and glance over the result.' },
  verify: { title: 'Use, then verify', line: 'Easy to check, costly to get wrong. Take the speed, then check every claim that matters.' },
  ideas: { title: 'Use for ideas only', line: 'Hard to check, cheap to get wrong. Treat it as a sparring partner, not an authority.' },
  human: { title: 'Keep it human, or add expert review', line: 'Hard to check and costly to get wrong. The judgment is the job.' },
};

export function quadrantOf(x: number, y: number): Quadrant {
  if (x >= 0.5) return y >= 0.5 ? 'verify' : 'delegate';
  return y >= 0.5 ? 'human' : 'ideas';
}

export const TASKS: TrustTask[] = [
  { id: 'email', short: 'Routine email', label: 'Draft a routine email to a colleague', x: 0.86, y: 0.14, reason: 'You will read it before it goes out, and a clumsy line costs little.' },
  { id: 'notes', short: 'Meeting summary', label: 'Summarize a meeting you attended', x: 0.8, y: 0.3, reason: 'You were there, so errors jump out at you.' },
  { id: 'names', short: 'Event names', label: 'Brainstorm names for a team event', x: 0.68, y: 0.07, reason: 'There is no wrong answer. You are the filter.' },
  { id: 'formula', short: 'Budget formula', label: 'Write a spreadsheet formula for a budget', x: 0.76, y: 0.6, reason: 'Test it on a few rows you can work out by hand.' },
  { id: 'board', short: 'Board figures', label: 'Pull figures into a report for the board', x: 0.7, y: 0.84, reason: 'Every number can be traced to its source. Trace them.' },
  { id: 'cases', short: 'Legal citations', label: 'Find court cases to cite in a legal filing', x: 0.64, y: 0.93, reason: 'Each citation can be looked up. Lawyers who skipped that step were sanctioned.' },
  { id: 'menu', short: 'Menu translation', label: 'Translate a menu while travelling', x: 0.18, y: 0.16, reason: 'You cannot check it, but a surprise dish is a story. With a severe allergy, this task jumps to the top left.' },
  { id: 'learn', short: 'Stats explainer', label: 'Explain a statistics idea you are learning', x: 0.3, y: 0.32, reason: 'As a beginner you cannot spot its mistakes. Use it to find good sources, and check the key claims.' },
  { id: 'contract', short: 'Contract summary', label: 'Summarize a contract before you sign it', x: 0.24, y: 0.86, reason: 'Checking the summary means reading the contract, which is the work you hoped to skip.' },
  { id: 'symptoms', short: 'Your symptoms', label: 'Interpret symptoms you are worried about', x: 0.13, y: 0.92, reason: 'You cannot verify the answer, the stakes are your health, and in a large study people using chatbots did no better than people using their usual sources.' },
  { id: 'review', short: 'Performance review', label: 'Write a performance review', x: 0.34, y: 0.8, reason: 'The judgment is the job, and someone’s career rides on it. Decide what to say first; AI can tidy the wording.' },
  { id: 'screen', short: 'Screen applicants', label: 'Screen job applicants', x: 0.2, y: 0.88, reason: 'Bias is invisible one case at a time. Chapter 5 shows how it hides.' },
];

export const TIPS: Array<{ title: string; why: string; sources: string[] }> = [
  {
    title: 'Give it the context.',
    why: 'It predicts from what is in front of it. Relevant material in the prompt reduces made-up answers, and even raises the model’s own estimate that it knows the answer.',
    sources: ['shuster-2021', 'kadavath-2022'],
  },
  {
    title: 'Ask for sources, then open them.',
    why: 'A citation turns “trust me” into “check me”, which makes checking cheaper than redoing. Tools built on real documents still invent some citations, so click through.',
    sources: ['magesh-2024'],
  },
  {
    title: 'Ask for the case against.',
    why: 'Assistants trained on human approval tend to tell people what they want to hear. Asking for the strongest objection to your own view makes agreement less of a default.',
    sources: ['sharma-2023'],
  },
  {
    title: 'Check claims one at a time.',
    why: 'Errors don’t announce themselves. Checking specific claims one at a time, apart from the draft, catches more than reviewing it all in one pass. Start with names, numbers, dates, quotes and anything you will repeat.',
    sources: ['dhuliawala-2023'],
  },
];
