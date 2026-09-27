/**
 * Chapter 3 task cards. Only stable patterns with a current source made the
 * cut (see DESIGN.md §8 for the two that were dropped during research).
 */
export type Verdict = 'great' | 'struggles';

export interface FrontierCard {
  id: string;
  task: string;
  verdict: Verdict;
  /** one line shown after the reveal */
  reason: string;
  /** a nuance that keeps the verdict honest */
  caveat?: string;
  sources: string[];
}

export const FRONTIER: FrontierCard[] = [
  {
    id: 'summarize',
    task: 'Summarize a long report into its key points',
    verdict: 'great',
    reason: 'Human judges rated language-model news summaries on par with those written by freelance writers.',
    caveat: 'Check the numbers: even the best models add unsupported claims to a few percent of summaries.',
    sources: ['zhang-2024-summaries', 'timely:summary-hallucination'],
  },
  {
    id: 'count-letters',
    task: 'Count how many times a letter appears in a word',
    verdict: 'struggles',
    reason: 'Models read text in chunks of letters, not single letters. Errors grow when a letter repeats.',
    caveat: 'Newer models often get it right by spelling the word out first, which is itself a clue to the mechanism.',
    sources: ['fu-2024'],
  },
  {
    id: 'draft-email',
    task: 'Draft a routine work email or memo',
    verdict: 'great',
    reason: 'In an experiment with 453 professionals, ChatGPT cut writing time by 40% and raised quality by 18%.',
    sources: ['noy-zhang-2023'],
  },
  {
    id: 'say-unsure',
    task: 'Say "I don’t know" when it doesn’t know',
    verdict: 'struggles',
    reason: 'Training and most tests reward a confident guess over an admission of doubt. On one test that penalizes wrong answers, hallucination rates ranged from 22% to 94%.',
    sources: ['kalai-2025', 'timely:hallucination-rates'],
  },
  {
    id: 'translate',
    task: 'Translate a letter between major languages',
    verdict: 'great',
    reason: 'At the 2024 machine-translation evaluation, a general-purpose language model was the best system overall, winning 9 of 11 language pairs.',
    caveat: 'Professional human translations were still in the top group in 7 of 11 pairs.',
    sources: ['wmt24'],
  },
  {
    id: 'clock',
    task: 'Read the time on an analog clock in a photo',
    verdict: 'struggles',
    reason: 'In March 2026 the best model read clocks correctly 50.6% of the time; people managed 90.1%.',
    sources: ['timely:jagged-imo-clocks', 'saxena-2025'],
  },
  {
    id: 'code',
    task: 'Write code for a common, well-defined task',
    verdict: 'great',
    reason: 'Developers with an AI pair programmer built a small web server 55.8% faster.',
    caveat: 'On their own large, familiar codebases, experienced developers using early-2025 tools were 19% slower.',
    sources: ['peng-2023', 'metr-rct'],
  },
  {
    id: 'cite',
    task: 'Cite real court cases or papers from memory',
    verdict: 'struggles',
    reason: 'In 2023 a court fined two lawyers and their firm $5,000 over a brief citing six cases ChatGPT had invented. Courts have since dealt with more than two thousand such filings.',
    sources: ['mata-avianca', 'timely:court-hallucinations'],
  },
  {
    id: 'exam',
    task: 'Answer hard, exam-style science questions',
    verdict: 'great',
    reason: 'Frontier models now meet or beat expert human baselines on PhD-level science question sets.',
    caveat: 'Exam scores tend to overstate usefulness on messy real-world work.',
    sources: ['ai-index-2026'],
  },
  {
    id: 'symptoms',
    task: 'Help a person work out what’s wrong from their symptoms',
    verdict: 'struggles',
    reason: 'Alone, models named the right condition in 94.9% of written cases. People using the same models found it in under 34.5%, no better than people using search.',
    caveat: 'The failure is in the conversation: what people tell the model, and what they take from its answer.',
    sources: ['bean-2026'],
  },
  {
    id: 'brainstorm',
    task: 'Brainstorm ideas for a new product',
    verdict: 'great',
    reason: 'Consultants using GPT-4 on a creative product task produced work rated more than 40% higher in quality.',
    sources: ['dellacqua'],
  },
  {
    id: 'news',
    task: 'Tell you what happened in the news this morning, with no web search',
    verdict: 'struggles',
    reason: 'A model only knows its training data, which stops at a cutoff date. It can still answer in the same fluent voice.',
    caveat: 'With a search tool it can look things up, but then it is reading, and it can misread.',
    sources: ['gpt4-report'],
  },
];

export const FRONTIER_SOURCES = [...new Set(FRONTIER.flatMap((c) => c.sources))];
