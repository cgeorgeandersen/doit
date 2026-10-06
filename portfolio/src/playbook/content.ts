/**
 * EVERY WORD IN THE PLAYBOOK ("What boring AI looks like", /playbook) LIVES
 * IN THIS FILE, apart from the stage names and the framework names, which come
 * from the assessment and the frameworks themselves.
 *
 * Edit the text between the quotes and save; `npm run dev` shows the change.
 * A few rules keep the page working:
 *
 * - Straight quotes and apostrophes are fine. The page turns them into curly
 *   ones, like the rest of the site.
 * - Words in {braces} are filled in by the page. Keep the braces and the word
 *   inside them.
 * - The six plays follow the assessment's six dimensions, in the same order.
 *   Each play's "working" list has one sign per question in that dimension,
 *   marked with the question's id: say the question's top answer as something
 *   you'd see. `npm test` checks they stay in step, and that the whole thing
 *   still reads in under five minutes.
 * - Lines marked TODO REVIEW are drafts written for you. Rewrite what doesn't
 *   sound like you, then delete the marker. `npm run drafts` lists the ones left.
 * - After changing anything here, run `npm run playbook:pdf` to remake the PDF.
 *   Until you do, the page offers "Print or save as PDF" instead of a download,
 *   so nobody gets a PDF that disagrees with the page.
 */
import type { Guardrail, Play } from './model.ts';

export const PLAYBOOK = {
  /** The playbook's name: the browser tab, link previews, the PDF's file name. */
  // TODO REVIEW: working title.
  name: "The Boring AI Playbook",

  /** Shown at the foot of the page and on the PDF. Change it when the words change. */
  updated: "2026-10-06",

  /** Search results and link previews (LinkedIn, Slack, iMessage). */
  meta: {
    // TODO REVIEW
    description:
      "What a company looks like when AI is in production, measured, and trusted exactly as far as it's reliable: six plays, the signs you're there, and how to close the gap. Free PDF.",
    /** The share image's description, under the title. Keep it to two lines (about 110 characters). */
    // TODO REVIEW
    imageDek: "Six plays for getting AI into production: what good looks like, and how to close the gap.",
    /** The line at the bottom of the share image. */
    imageNote: "Six plays · Free PDF",
  },

  // ---------------------------------------------------------------------------
  // The top of the page
  // ---------------------------------------------------------------------------
  intro: {
    /** The first item in the line above the headline, as in the site's navigation. */
    label: "Playbook",
    /** The rest of that line. "5-minute read" is checked by npm test: keep it under five minutes. */
    kicker: ["Six plays", "5-minute read"],
    /** The headline. `emphasis` is the word that sits on the four-color stripe. */
    title: "What boring AI looks like",
    emphasis: "boring",
    // TODO REVIEW
    dek: "Six plays for a company where AI is in production, measured, and trusted exactly as far as it's reliable.",
    // TODO REVIEW: the weakest-link rule, as in the assessment.
    start: "Start with your weakest play. You're only as boring as your weakest link.",
    assessmentLink: "Find yours in five minutes",
    download: "Download the PDF",
    /** Beside the download button: what you get. */
    downloadNote: "Two pages, free to share",
    print: "Print",
    /** The button when the PDF is out of date (see the top of this file). */
    printOnly: "Print or save as PDF",
    frameworksHeading: "Puts into practice",
  },

  /** The four stages from the assessment, each in a few words. Keyed by the stage's id there. */
  stagesHeading: "The four stages",
  goalLabel: "The goal",
  // TODO REVIEW
  stages: {
    magic: "Demos and personal experiments.",
    alchemy: "Impressive once, hard to repeat.",
    chemistry: "A method, not yet everywhere.",
    boring: "In production, measured, and trusted as far as it's reliable.",
  },

  /** The headings inside every play. */
  labels: {
    play: "Play {n}",
    working: "You'll know it's working when",
    notYet: "Not there yet when",
    bridge: "Bridge the gap",
  },

  // ---------------------------------------------------------------------------
  // The six plays, in the assessment's order
  // ---------------------------------------------------------------------------
  plays: [
    // TODO REVIEW: play 1, all of it.
    {
      title: "Sequence by risk",
      dimension: "priorities",
      model: "Build the muscle where mistakes are cheap.",
      why: "Catching AI's mistakes is a skill. Practice it inside first.",
      working: [
        { question: "choose", text: "Ideas are sorted by risk first, then by return within each tier." },
        { question: "risk", text: "Risk means the data a tool touches and what it can do on its own." },
        { question: "track-record", text: "Internal tools are in daily use, and their lessons shape what comes next." },
      ],
      notYet: [
        "Ideas move when someone senior gets excited.",
        "The first big bet faces customers.",
      ],
      bridge: [
        "Sort ideas into the three tiers, then rank by return within each.",
        "Put one tool into daily use where mistakes are cheap and easy to spot.",
      ],
      figure: {
        kind: "steps",
        label: "Three tiers, light review to heavy",
        steps: [
          { term: "Internal productivity", then: "a person sees every output" },
          { term: "Operations", then: "mistakes reach colleagues" },
          { term: "Customer-facing", then: "mistakes reach customers" },
        ],
      },
    },
    // TODO REVIEW: play 2, all of it.
    {
      title: "Fix the work first",
      dimension: "workflow",
      model: "Don't automate the jam.",
      why: "AI on a broken process just makes the mess faster.",
      working: [
        { question: "mapped", text: "Processes are mapped step by step, with chasing, waiting and redoing marked." },
        { question: "fix", text: "Causes get fixed first, then simple rules. AI gets the reading and writing left." },
        { question: "data", text: "Data sits in systems approved tools can reach, with an owner keeping it accurate." },
      ],
      notYet: [
        "A tool is proposed before anyone knows the cause.",
        "The real process lives in a few people's heads.",
      ],
      bridge: [
        "Map one process this week. Circle the chasing, waiting and redoing.",
        "Put each stuck step through the four questions. The first yes decides.",
      ],
      figure: {
        kind: "steps",
        label: "The four questions, in order",
        steps: [
          { term: "Chasing, waiting or redoing?", then: "Fix the process" },
          { term: "Same steps every time?", then: "Automate it with a rule" },
          { term: "Mostly reading or writing?", then: "AI drafts, a person checks" },
          { term: "Anything else?", then: "Keep it human" },
        ],
      },
    },
    // TODO REVIEW: play 3, all of it.
    {
      title: "Govern in proportion",
      dimension: "governance",
      model: "One door, two speeds.",
      why: "Heavy review for everything teaches people to route around it.",
      working: [
        { question: "intake", text: "One place to ask: low-risk requests get a quick yes, riskier ones a closer look." },
        { question: "security", text: "Security reviews tools that touch customer data before the build, on a set turnaround." },
        { question: "register", text: "A current register lists every AI tool, its risk tier, data and owner." },
      ],
      notYet: [
        "People use tools nobody approved.",
        "Security first sees a tool after it's built.",
      ],
      bridge: [
        "Open one place to ask, with a promised turnaround.",
        "Start a one-page register: tool, purpose, data, tier, owner. Review it monthly.",
      ],
      figure: {
        kind: "grid",
        label: "Two speeds",
        corner: "If the request is",
        columns: ["It gets"],
        rows: [
          { name: "Low risk", cells: ["A quick yes"] },
          { name: "On customer data, or acting alone", cells: ["Security review first"] },
        ],
      },
    },
    // TODO REVIEW: play 4, all of it.
    {
      title: "Trust the track record",
      dimension: "trust",
      model: "Use AI where checking is cheaper than doing.",
      why: "AI sounds just as sure when it's wrong. Fluency isn't truth.",
      working: [
        { question: "unchecked", text: "Each use is placed by the cost of a mistake and the ease of checking." },
        { question: "checker", text: "An expert checks the output, as a step that can't be skipped." },
        { question: "error-rate", text: "Tools are tested on real examples before launch, and sampled after." },
      ],
      notYet: [
        "Output goes out because it reads well.",
        "Errors surface as complaints, not as a number.",
      ],
      bridge: [
        "Put your five most common AI uses on the trust map.",
        "Have an expert grade 20 outputs: right, fixable or wrong. Repeat monthly.",
      ],
      figure: {
        kind: "grid",
        label: "The trust map",
        corner: "If a mistake is",
        columns: ["Easy to check", "Hard to check"],
        rows: [
          { name: "Minor", cells: ["Delegate freely", "Ideas only"] },
          { name: "Costly", cells: ["Use, then verify", "Keep it human"] },
        ],
      },
    },
    // TODO REVIEW: play 5, all of it.
    {
      title: "Keep the judgment",
      dimension: "people",
      model: "Hand off the hauling, keep the reins.",
      why: "Judgment is a muscle. Every call you just approve is a skipped rep.",
      working: [
        { question: "final-call", text: "Which calls stay human is agreed in advance, and a named person makes each one." },
        { question: "skills", text: "Training is on real tasks: when to use AI, how to check it, what to keep." },
        { question: "champions", text: "Named champions have time set aside, share what works and report what breaks." },
      ],
      notYet: [
        "Signing off means approving whatever the tool suggested.",
        "Training means one session on features.",
      ],
      bridge: [
        "Before the work starts, name who makes the final call.",
        "Before anything goes out, ask: could I defend this without \"the AI suggested it\"?",
      ],
      figure: {
        kind: "grid",
        label: "Be the centaur",
        corner: "The work",
        columns: ["Centaur", "Reverse centaur"],
        rows: [
          { name: "Thinking", cells: ["Augmented", "Outsourced"] },
          { name: "Doing", cells: ["Outsourced", "Kept"] },
          { name: "Judging", cells: ["Kept", "Outsourced"] },
        ],
      },
    },
    // TODO REVIEW: play 6, all of it.
    {
      title: "Prove it with a number",
      dimension: "measurement",
      model: "Agree the number before you build.",
      why: "A demo shows AI at its best. A number shows an ordinary Tuesday.",
      working: [
        { question: "baseline", text: "A baseline and a target are agreed before the build, with whoever judges success." },
        { question: "tracking", text: "The number is tracked against the baseline on a schedule, by a named owner." },
        { question: "pilots", text: "Every pilot has a decision date: scale, change or stop, on the number." },
      ],
      notYet: [
        "Success is reported in logins and licenses.",
        "Pilots run on because nobody decided to stop them.",
      ],
      bridge: [
        "Before the next project, pick one number it should move, and measure it today.",
        "Give every pilot a decision date. Decide with the number in front of you.",
      ],
      figure: {
        kind: "steps",
        label: "Every pilot's path",
        steps: [
          { term: "Baseline" },
          { term: "Target" },
          { term: "Decision date" },
          { term: "Scale, change or stop" },
        ],
      },
    },
  ] satisfies Play[],

  // ---------------------------------------------------------------------------
  // Responsible AI: the rules that hold at every tier
  // ---------------------------------------------------------------------------
  guardrails: {
    heading: "Responsible AI guardrails",
    // TODO REVIEW
    intro: "Six rules for every tier.",
    // TODO REVIEW: rules 5 and 6 go a step past the frameworks as written; keep, change or cut them.
    rules: [
      {
        text: "Anything acting on customer data, or sending it outside, gets security review before the build.",
        framework: "risk-tiered-adoption",
      },
      {
        text: "Anything that sends, pays, deletes or publishes gets a person in the loop or a hard limit.",
        framework: "calibrated-trust",
      },
      {
        text: "Every AI tool has a named owner and a line in the register.",
        framework: "risk-tiered-adoption",
      },
      {
        text: "A named person makes every call that matters, and can defend it without the AI.",
        framework: "keep-it-human",
      },
      {
        text: "When AI decides about people, check its errors group by group: an average can hide who it fails.",
        framework: "calibrated-trust",
      },
      {
        text: "Say where AI did the work: it's a tool, not a secret.",
        framework: "keep-it-human",
      },
    ] satisfies Guardrail[],
  },

  // ---------------------------------------------------------------------------
  // The AI champion network
  // ---------------------------------------------------------------------------
  // TODO REVIEW: all of the champion network.
  champions: {
    heading: "The AI champion network",
    /** Which framework the network belongs to, by file name. */
    framework: "keep-it-human",
    model: "Champions are sensors, not cheerleaders.",
    points: [
      "One named champion per team, with a few hours a month.",
      "Every month, two questions: what's working that others should copy? What's breaking that someone should fix?",
      "They teach on real tasks, not features.",
    ],
    /** The diagram: how each kind of news travels, as a chain of who passes it on. */
    flow: {
      label: "How the news travels",
      routes: [
        { name: "What breaks", path: ["Team", "Champion", "Tool owner"] },
        { name: "What works", path: ["Team", "Champion", "Every team"] },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // The close
  // ---------------------------------------------------------------------------
  close: {
    // TODO REVIEW
    heading: "Where do you stand?",
    // TODO REVIEW
    text: "Score all six plays and get your three biggest gaps.",
    action: "Take the assessment",
  },

  footer: {
    updated: "Updated {date}",
    // TODO REVIEW: how you'd like it shared.
    share: "Free to share, with credit.",
  },
};
