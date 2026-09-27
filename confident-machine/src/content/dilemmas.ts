/**
 * Chapter 5 dilemmas. Each choice shows what it gains and what it risks;
 * none is scored "correct", because the point is the trade-off.
 */
import type { DilemmaId } from '../lib/store';

export interface DilemmaChoice {
  id: string;
  label: string;
  /** a few words for the rules card */
  short: string;
  gains: string;
  risks: string;
}

export interface Dilemma {
  id: DilemmaId;
  principle: string;
  scenario: string;
  question: string;
  choices: DilemmaChoice[];
  lesson: string;
  sources: string[];
}

export const DILEMMAS: Dilemma[] = [
  {
    id: 'privacy',
    principle: 'Privacy',
    scenario:
      'A colleague is up against a deadline. They paste a client’s confidential contract into a free, public chatbot to get a quick summary.',
    question: 'What should your team’s rule be?',
    choices: [
      {
        id: 'allow',
        label: 'Allow it. It’s faster, and everyone does it.',
        short: 'Allowed pasting into public tools',
        gains: 'Speed, today.',
        risks:
          'The text leaves your control. Depending on the service’s terms it may be stored, reviewed by staff or used to train future models, and it cannot be recalled. In 2023 Samsung banned these tools on work devices after engineers pasted source code and meeting notes into one.',
      },
      {
        id: 'redact',
        label: 'Allow it, but strip out names and numbers first.',
        short: 'Redact first, then paste',
        gains: 'Less exposure.',
        risks: 'Context can identify a client even without names. Better than pasting the original, and still not safe for anything truly confidential.',
      },
      {
        id: 'approved',
        label: 'Only use a company-approved tool with a data agreement, or do it by hand.',
        short: 'Approved tools only',
        gains: 'The data stays under a contract that says where it goes.',
        risks: 'Slower today, and someone has to set the tool up.',
      },
    ],
    lesson: 'The rule is not “never use AI”. It is “know where the data goes before it leaves”.',
    sources: ['samsung-2023'],
  },
  {
    id: 'oversight',
    principle: 'Human oversight',
    scenario:
      'Your support team wants an AI system to answer customer emails and send the replies automatically, with nobody reviewing them.',
    question: 'How much should people stay in the loop?',
    choices: [
      {
        id: 'auto',
        label: 'Auto-send everything.',
        short: 'Auto-send everything',
        gains: 'Instant replies at almost no cost.',
        risks:
          'One wrong promise can go out to thousands of customers before anyone notices, and the company owns every word. When Air Canada’s chatbot gave a grieving customer wrong advice about a bereavement discount, a tribunal ordered the airline to pay the difference.',
      },
      {
        id: 'review-all',
        label: 'A person approves every reply.',
        short: 'Review every reply',
        gains: 'Few errors reach customers.',
        risks: 'Expensive, and people approving hundreds of good drafts start rubber-stamping, a pattern researchers call automation bias.',
      },
      {
        id: 'route',
        label: 'Auto-send routine answers; send refunds, policy and legal questions to people; spot-check a sample every week.',
        short: 'Route by risk, spot-check the rest',
        gains: 'Speed where mistakes are cheap, people where they are costly.',
        risks: 'Someone has to maintain the routing and actually read the samples.',
      },
    ],
    lesson: '“It makes no difference whether the information comes from a static page or a chatbot.” The tribunal’s words apply to any company that lets a machine speak for it.',
    sources: ['moffatt-cbc', 'moffatt-decision', 'parasuraman-2010'],
  },
  {
    id: 'accountability',
    principle: 'Accountability and transparency',
    scenario:
      'A lender’s new model is more accurate on average than its old scorecard. It denies a loan, and nobody at the lender can say why.',
    question: 'What should the lender do?',
    choices: [
      {
        id: 'ship',
        label: 'Use it. Accuracy is what matters.',
        short: 'Accuracy first',
        gains: 'Fewer bad loans on average.',
        risks:
          'The applicant cannot correct a mistake or appeal. US lenders must give the specific principal reasons for a denial, and a failed score is expressly not a reason.',
      },
      {
        id: 'signoff',
        label: 'Have a loan officer sign off on every denial.',
        short: 'Human sign-off',
        gains: 'A person is formally responsible.',
        risks: 'A signature without understanding is oversight in name only. The officer cannot explain the decision either.',
      },
      {
        id: 'reasons',
        label: 'Require reasons: use a model that can state them, tell applicants what would change the result, and offer an appeal.',
        short: 'Reasons and appeals',
        gains: 'Decisions people can understand, contest and fix.',
        risks: 'Possibly a little accuracy, and more engineering work.',
      },
    ],
    lesson:
      'In 2025 the EU’s top court said an explanation must let the person understand and challenge the decision, and that telling them what change would have altered the result may be appropriate.',
    sources: ['reg-b', 'cjeu-2025'],
  },
];

export const PRINCIPLES: Array<{ name: string; prevents: string }> = [
  { name: 'Fairness', prevents: 'repeating past discrimination at the speed of software' },
  { name: 'Privacy', prevents: 'exposing data you cannot take back' },
  { name: 'Transparency', prevents: 'people not knowing they are dealing with a machine, or why it decided' },
  { name: 'Accountability', prevents: 'harms that nobody owns, explains or fixes' },
  { name: 'Human oversight', prevents: 'errors that compound before anyone looks' },
  { name: 'Security', prevents: 'systems turned against their users, for example by instructions hidden in a document the AI reads' },
];

export const DILEMMA_SOURCES = [...new Set(DILEMMAS.flatMap((d) => d.sources))];
