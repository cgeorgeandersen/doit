/**
 * Who did what on a lab note, in the three parts of the Keep It Human
 * framework: the ideas, the writing, and the final call. Shared by the
 * content schema and the label.
 */

/** Who had the ideas, or made the final call. */
export const OWNERS = ['me', 'shared', 'ai'] as const;
export type Owner = (typeof OWNERS)[number];

export const OWNER_LABEL: Record<Owner, string> = {
  me: 'Me',
  shared: 'Me and AI',
  ai: 'AI',
};

/** Who wrote the words, from most me to most AI. */
export const WRITERS = ['me', 'edited-with-ai', 'rewritten-from-ai', 'ai-drafted'] as const;
export type Writer = (typeof WRITERS)[number];

export const WRITER_LABEL: Record<Writer, string> = {
  me: 'Me',
  'edited-with-ai': 'Me, edited with AI',
  'rewritten-from-ai': 'Drafted with AI, rewritten by me',
  'ai-drafted': 'AI-drafted, edited by me',
};

export interface Authorship {
  ideas: Owner;
  writing: Writer;
  finalCall: Owner;
}

/** The label's three parts, in order. */
export function authorshipParts(a: Authorship): { term: string; value: string }[] {
  return [
    { term: 'Ideas', value: OWNER_LABEL[a.ideas] },
    { term: 'Writing', value: WRITER_LABEL[a.writing] },
    { term: 'Final call', value: OWNER_LABEL[a.finalCall] },
  ];
}
