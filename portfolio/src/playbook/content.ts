/**
 * EVERY WORD IN THE PLAYBOOK ("What boring AI looks like", /playbook) LIVES
 * IN THIS FILE, apart from the framework names in its footer, which come from
 * the frameworks themselves.
 *
 * It's written to be the first thing someone sees: it explains itself, and
 * uses no term from the rest of the site without saying what it means.
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
      "A two-page guide to getting AI out of pilots and into everyday work, safely: what good looks like, where to start, and the first 90 days. Free PDF.",
    /** The share image's description, under the title. Keep it to two lines (about 110 characters). */
    // TODO REVIEW
    imageDek: "Getting AI out of pilots and into everyday work: where to start, and what good looks like.",
    /** The line at the bottom of the share image. */
    imageNote: "Six plays · The first 90 days · Free PDF",
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
    dek: "A two-page guide to getting AI out of pilots and into everyday work, safely.",
    download: "Download the PDF",
    /** Beside the download button: what you get. */
    downloadNote: "Two pages, free to share",
    print: "Print",
    /** The button when the PDF is out of date (see the top of this file). */
    printOnly: "Print or save as PDF",
  },

  /** What "boring" means, for someone who has never seen the site. */
  // TODO REVIEW: the case for "boring", in four lines.
  boring: {
    heading: "Why boring?",
    text: "The most useful technologies end up boring. Nobody gets excited about electricity or spreadsheets; people just rely on them. Most AI isn't there yet: it impresses in demos and stalls in pilots. Boring AI is AI you can depend on:",
    points: [
      { term: "In production", text: "part of everyday work, not a pilot or a demo" },
      { term: "Measured", text: "judged by a number agreed up front" },
      { term: "Fit to the work", text: "added after the process is fixed" },
      { term: "Trusted as far as it's reliable", text: "checked as much as a mistake would cost" },
    ],
  },

  /** Where to start: a plan anyone can follow, and who does what. */
  // TODO REVIEW: the first 90 days, and the roles.
  start: {
    heading: "Start here: the first 90 days",
    steps: [
      { when: "Weeks 1–2", text: "Set ground rules: what may go into AI tools, and one place to ask before trying a new one.", owner: "AI lead and security" },
      { when: "Weeks 3–4", text: "List every AI tool in use: its owner, its data, its risk.", owner: "AI lead" },
      { when: "Month 2", text: "Pick one internal task where mistakes are cheap. Fix the process, measure the start, then add one tool.", owner: "A team lead" },
      { when: "Month 3", text: "Have an expert grade 20 outputs. Then scale it, change it or stop.", owner: "Sponsor" },
    ],
    rolesHeading: "Who's who",
    roles: [
      { name: "Sponsor", text: "an executive who funds the work and decides on pilots" },
      { name: "AI lead", text: "runs the tool list and the place to ask" },
      { name: "Security", text: "reviews anything touching customer data" },
    ],
  },

  /** The headings inside every play. */
  labels: {
    play: "Play {n}",
    working: "You'll know it's working when",
    notYet: "Watch out for",
    bridge: "First move",
  },

  /** Above the six plays. */
  playsHeading: "The six plays",
  playsIntro: "Each shows what good looks like, a warning sign and a first move.",

  // ---------------------------------------------------------------------------
  // The six plays, in the assessment's order
  // ---------------------------------------------------------------------------
  plays: [
    // TODO REVIEW: play 1, all of it.
    {
      title: "Sequence by risk",
      dimension: "priorities",
      model: "Build skill where mistakes are cheap.",
      working: [
        { question: "choose", text: "Ideas are sorted by risk first, then by return within each tier." },
        { question: "risk", text: "Risk means the data a tool touches and what it can do on its own." },
        { question: "track-record", text: "Internal tools are in daily use, and teach what to try next." },
      ],
      notYet: ["The first big AI bet faces customers."],
      bridge: ["Sort your AI ideas into the three tiers, then rank by return within each."],
      figure: {
        kind: "steps",
        label: "Three tiers, light review to heavy",
        steps: [
          { term: "Help with people's own work", then: "a person sees every output" },
          { term: "AI inside a business process", then: "mistakes reach colleagues" },
          { term: "Anything customers see", then: "mistakes reach customers" },
        ],
      },
    },
    // TODO REVIEW: play 2, all of it.
    {
      title: "Fix the work first",
      dimension: "workflow",
      model: "Don't automate the jam.",
      why: "AI added to a broken process just makes the mess faster.",
      working: [
        { question: "mapped", text: "Processes are mapped step by step, with chasing, waiting and redoing marked." },
        { question: "fix", text: "Causes are fixed first, then rules; AI gets the reading and writing left." },
        { question: "data", text: "Data is in systems approved tools can reach, and someone keeps it accurate." },
      ],
      notYet: ["A new tool is proposed before anyone knows why the work is slow."],
      bridge: ["Put each slow step through the four questions. The first yes decides."],
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
      model: "One front door, two speeds.",
      why: "Heavy review for everything teaches people to go around it.",
      working: [
        { question: "intake", text: "One place to ask: a quick yes for low risk, a closer look for the rest." },
        { question: "security", text: "Security reviews customer-data tools before they're built, on a set turnaround." },
        { question: "register", text: "A current one-page list shows every AI tool's risk, data and owner." },
      ],
      notYet: ["People use AI tools nobody approved."],
      bridge: ["Promise a turnaround for requests, and keep it."],
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
      why: "AI sounds just as sure when it's wrong.",
      working: [
        { question: "unchecked", text: "Each use is placed by the cost of a mistake and the ease of checking." },
        { question: "checker", text: "An expert checks the output, as a step that can't be skipped." },
        { question: "error-rate", text: "Tools are tested on real examples before launch, and sampled after." },
      ],
      notYet: ["Output goes out because it reads well."],
      bridge: ["Place your five most common AI uses on this grid."],
      figure: {
        kind: "grid",
        label: "How far to rely on it",
        corner: "If a mistake is",
        columns: ["Easy to check", "Hard to check"],
        rows: [
          { name: "Minor", cells: ["Let it run", "Ideas only"] },
          { name: "Costly", cells: ["Use, then verify", "Keep it human"] },
        ],
      },
    },
    // TODO REVIEW: play 5, all of it.
    {
      title: "Keep people in charge",
      dimension: "people",
      model: "AI does the work. People make the call.",
      why: "Approving isn't the same as judging.",
      working: [
        { question: "final-call", text: "The calls that stay human are agreed in advance, each with a named owner." },
        { question: "skills", text: "Training is on real tasks: when to use AI, how to check it, what to keep." },
        { question: "champions", text: "Named champions have time set aside, share what works and report what breaks." },
      ],
      notYet: ["Signing off means approving whatever the tool suggested."],
      bridge: ["Before anything goes out, ask: could I defend this without saying \"the AI suggested it\"?"],
      figure: {
        kind: "grid",
        label: "Split the work",
        corner: "The work",
        columns: ["AI", "People"],
        rows: [
          { name: "Thinking", cells: ["Suggests, challenges", "Decide what matters"] },
          { name: "Doing", cells: ["Drafts, sorts", "Check, finish"] },
          { name: "Deciding", cells: ["Never alone", "Make the call"] },
        ],
      },
    },
    // TODO REVIEW: play 6, all of it.
    {
      title: "Prove it with a number",
      dimension: "measurement",
      model: "Agree the number before you build.",
      why: "A demo shows AI at its best. A number shows an ordinary day.",
      working: [
        { question: "baseline", text: "A baseline and a target are agreed before the build, with whoever judges success." },
        { question: "tracking", text: "A named owner tracks the number against the baseline." },
        { question: "pilots", text: "Every pilot has a decision date: scale, change or stop, on the number." },
      ],
      notYet: ["Success is reported in logins and licenses."],
      bridge: ["Measure one number before the next project starts."],
      figure: {
        kind: "steps",
        label: "Good first numbers",
        steps: [
          { term: "Hours a week", then: "spent on the task" },
          { term: "Error rate", then: "in graded samples" },
          { term: "Turnaround", then: "from request to done" },
        ],
      },
    },
  ] satisfies Play[],

  // ---------------------------------------------------------------------------
  // Responsible AI: the rules that hold everywhere
  // ---------------------------------------------------------------------------
  guardrails: {
    heading: "Responsible AI: six rules",
    // TODO REVIEW
    intro: "For every AI tool.",
    // TODO REVIEW: rule 6 goes a step past the frameworks as written; keep, change or cut it.
    rules: [
      {
        text: "Write down what data may go into AI tools, and what never may.",
        framework: "risk-tiered-adoption",
      },
      {
        text: "Anything acting on customer data, or sending it outside, gets security review before it's built.",
        framework: "risk-tiered-adoption",
      },
      {
        text: "Anything that sends, pays, deletes or publishes gets a person in the loop or a hard limit.",
        framework: "calibrated-trust",
      },
      {
        text: "Every AI tool has a named owner and a line on the list.",
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
      "One per team, with a few hours a month for it.",
      "Every month they ask two questions: what's working that others should copy? What's breaking that someone should fix?",
    ],
  },

  // ---------------------------------------------------------------------------
  // The close
  // ---------------------------------------------------------------------------
  close: {
    // TODO REVIEW
    heading: "Where do you stand?",
    // TODO REVIEW
    text: "A free five-minute assessment scores all six plays and shows where to start.",
    action: "Take the assessment",
  },

  /** Who made it: for someone who found the PDF without the site. */
  // TODO REVIEW: how you'd like to be introduced.
  about: {
    heading: "Who made this",
    text: "George Andersen helps lead AI enablement for a large commercial organization. These plays come from that work.",
    action: "Talk to me on LinkedIn",
  },

  footer: {
    updated: "Updated {date}",
    builtOn: "Built on five frameworks",
    // TODO REVIEW: how you'd like it shared.
    share: "Free to share, with credit.",
  },
};
