/** Who wrote a lab note, from most me to most AI. Shared by the content schema and the label. */
export const AUTHORSHIPS = ['me', 'mostly-me', 'mostly-ai', 'ai'] as const;

export type Authorship = (typeof AUTHORSHIPS)[number];

export const AUTHORSHIP_LABEL: Record<Authorship, string> = {
  me: 'Written by me',
  'mostly-me': 'Written by me, edited with AI',
  'mostly-ai': 'Drafted with AI, rewritten by me',
  ai: 'Written by AI, checked by me',
};

/** How many of the four dots are filled: my share of the writing. Never zero, because I always check. */
export const AUTHORSHIP_DOTS: Record<Authorship, number> = {
  me: 4,
  'mostly-me': 3,
  'mostly-ai': 2,
  ai: 1,
};
