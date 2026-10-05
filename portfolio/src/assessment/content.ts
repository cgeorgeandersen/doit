/**
 * EVERY WORD IN THE AI READINESS ASSESSMENT ("How Boring Is Your AI?",
 * /tools/how-boring-is-your-ai) LIVES IN THIS FILE.
 *
 * Edit the text between the quotes and save; `npm run dev` shows the change.
 * A few rules keep the page working:
 *
 * - Straight quotes and apostrophes are fine. The page turns them into curly
 *   ones, like the rest of the site.
 * - Words in {braces} are filled in by the page, like {n} in "Question {n} of
 *   {total}". Keep the braces and the word inside them.
 * - Text that should differ between the two modes is written as
 *   { department: "…", company: "…" }. Plain text reads the same for both.
 * - Every question has exactly four options, least ready first. They score
 *   0, 1, 2 and 3 in that order, so keep the order when you rewrite them.
 * - `framework` on a dimension is a file name from src/content/frameworks/:
 *   its gaps link to that framework, and the build stops if the name is wrong.
 * - Lines marked TODO REVIEW are drafts written for you. Rewrite what doesn't
 *   sound like you, then delete the marker. `npm run drafts` lists the ones left.
 *
 * `npm test` checks the structure (six dimensions, three questions each, four
 * options each, no empty text) and the tone (no emoji, no hype words, no
 * comparisons with other organizations), and says what to fix.
 */
import type { Dimension, Rules, Stage } from './model.ts';

export const ASSESSMENT = {
  /** The assessment's name: the browser tab, link previews, the share image. */
  // TODO REVIEW: working title.
  name: "How Boring Is Your AI?",

  /** Search results and link previews (LinkedIn, Slack, iMessage). */
  meta: {
    // TODO REVIEW
    description:
      "A five-minute self-assessment of how ready your department or company is to get AI into production, and the gaps to close first. Free, no sign-up.",
    /** The share image's description, under the title. Keep it to two lines (about 110 characters). */
    // TODO REVIEW
    imageDek: "Eighteen questions on how ready your team is to get AI into production, and what to fix first.",
    /** The line at the bottom of the share image. */
    // TODO REVIEW
    imageNote: "Magic → Alchemy → Chemistry → Boring",
  },

  // ---------------------------------------------------------------------------
  // The first screen
  // ---------------------------------------------------------------------------
  intro: {
    /** After the "Tools" link in the line above the headline. */
    // TODO REVIEW
    kicker: ["Self-assessment", "{questions} questions", "5 minutes"],
    /** The headline. `emphasis` is the word that sits on the four-color stripe. */
    // TODO REVIEW
    title: "How boring is your AI?",
    emphasis: "boring",
    // TODO REVIEW
    dek: "Boring is the goal: AI that's in production, measured, and trusted exactly as far as it's reliable. See how close you are, and what to fix first.",
    // TODO REVIEW
    modeHeading: "What are you assessing?",
    modes: {
      // TODO REVIEW
      department: { label: "My department", hint: "A team or function you lead or work in." },
      // TODO REVIEW
      company: { label: "My company", hint: "The whole organization, as far as you can see it." },
    },
    // TODO REVIEW
    notes: [
      "Answer for an ordinary Tuesday, not your best day. If you're torn between two answers, pick the lower one.",
      "Your answers stay in your browser. No sign-up, no cookies.",
    ],
    // TODO REVIEW
    noscript: "This assessment needs JavaScript to add up your answers. Nothing you choose leaves your browser.",
    // TODO REVIEW
    stagesHeading: "The four stages",
    // TODO REVIEW
    stagesIntro: "Your result places you on this scale. Boring is the goal.",
    goalLabel: "The goal",
    /** Above the frameworks the questions are built on, as on project pages. */
    frameworksHeading: "Puts into practice",
  },

  // ---------------------------------------------------------------------------
  // The four stages, lowest first. `minAverage` is the lowest average answer
  // (0 to 3) that reaches the stage.
  // ---------------------------------------------------------------------------
  stages: [
    {
      id: "magic",
      name: "Magic",
      minAverage: 0,
      // TODO REVIEW
      definition: "AI lives in demos and personal experiments, and nobody can say what it does for the work.",
      // TODO REVIEW
      next: "Pick one internal task, put one tool to work on it every day, and write down what happens.",
    },
    {
      id: "alchemy",
      name: "Alchemy",
      // TODO REVIEW: thresholds (0.75 / 1.5 / 2.25 split the 0-3 scale into equal quarters).
      minAverage: 0.75,
      // TODO REVIEW
      definition: "Some AI work is real, but it's impressive once, hard to repeat and occasionally explosive.",
      // TODO REVIEW
      next: "Make the good results repeatable: write down how AI work gets chosen, checked and measured.",
    },
    {
      id: "chemistry",
      name: "Chemistry",
      minAverage: 1.5,
      // TODO REVIEW
      definition: "There's a method: AI work is chosen, checked and measured, though not yet everywhere or every time.",
      // TODO REVIEW
      next: "Close your weakest links until the method holds on an ordinary Tuesday, then keep measuring.",
    },
    {
      id: "boring",
      name: "Boring",
      minAverage: 2.25,
      // TODO REVIEW
      definition: "AI is in production, measured, and trusted exactly as far as it's reliable, so nobody talks about it much.",
      // TODO REVIEW
      next: "Stay boring: take this again in six months, because the tools and the risks keep moving.",
    },
  ] satisfies Stage[],

  /** How a result is worked out. The page explains these rules under "How the score works". */
  rules: {
    // TODO REVIEW: one weak dimension holds the overall stage to one step above it. Set to null to turn it off.
    weakestLinkCap: 1,
    gapCount: 3,
  } satisfies Rules,

  /**
   * Bump this number if you add, remove or reorder questions or options. Older
   * share links then show a notice instead of someone else's answers read wrong.
   * Rewording a question or option doesn't need a bump.
   */
  shareVersion: 1,

  // ---------------------------------------------------------------------------
  // The questions: six dimensions, three questions each, four options each.
  // Options describe what someone could actually see happening, least ready first.
  // ---------------------------------------------------------------------------
  dimensions: [
    {
      id: "priorities",
      name: "Prioritization & risk tiers",
      // TODO REVIEW
      asks: "What goes first, and why?",
      framework: "risk-tiered-adoption",
      questions: [
        {
          id: "choose",
          // TODO REVIEW
          prompt: {
            department: "How does your department decide which AI ideas to pursue?",
            company: "How does your company decide which AI ideas to pursue?",
          },
          // TODO REVIEW
          options: [
            "There's no shared way. An idea moves when someone senior gets excited about it.",
            "We pick the ideas with the biggest projected savings.",
            "We weigh risk and return together, case by case.",
            "We sort ideas by risk first, then rank them by return within each level.",
          ],
          // TODO REVIEW
          nextStep:
            "Sort your AI ideas into three tiers: help with people's own work, AI inside a business process, and anything customers see. Rank by return within each tier, not across them.",
        },
        {
          id: "risk",
          // TODO REVIEW
          prompt: "How do you judge how risky an AI idea is?",
          // TODO REVIEW
          options: [
            "We don't, really. If it looks useful, it goes ahead.",
            "By who uses it. Internal tools count as safe, and anything customers see counts as risky.",
            "By the data it touches, such as customer or personal data.",
            "By the data it touches and the actions it can take on its own, like sending, paying or deleting.",
          ],
          // TODO REVIEW
          nextStep:
            "For each AI tool in use or in planning, write down the most sensitive data it touches and the most serious thing it can do without a person. Classify it by those, not by who uses it.",
        },
        {
          id: "track-record",
          // TODO REVIEW
          prompt: "Where is your AI work building its track record?",
          // TODO REVIEW
          options: [
            "Nowhere yet. People try chat tools on their own, if at all.",
            "On a customer-facing project, because that's where the payoff looks biggest.",
            "On internal tools, but they're still pilots that only a few people use.",
            "On internal tools in daily use. What we learned there shapes what we take on next.",
          ],
          // TODO REVIEW
          nextStep:
            "Pick one internal task where a mistake is cheap and easy to spot, and get one AI tool into daily use there. Write down what you learn about checking it before you take on riskier work.",
        },
      ],
    },
    {
      id: "workflow",
      name: "Workflow readiness",
      // TODO REVIEW
      asks: "Is the work fixed before AI is added?",
      framework: "fix-first-ai-last",
      questions: [
        {
          id: "mapped",
          // TODO REVIEW
          prompt: "Think of a process you'd like AI to help with. How well is it written down?",
          // TODO REVIEW
          options: [
            "It isn't. It lives in a few people's heads.",
            "There's a document, but the real process has drifted away from it.",
            "It's mapped and people follow it, but nobody has marked where work waits or gets redone.",
            "It's mapped step by step, and we know which steps are chasing, waiting or redoing.",
          ],
          // TODO REVIEW
          nextStep:
            "Map one process this week: every step, who does it and where it waits. Circle the steps that are chasing, waiting or redoing. Those need a fix, not a tool.",
        },
        {
          id: "fix",
          // TODO REVIEW
          prompt: "When a step in a process is slow, what usually happens?",
          // TODO REVIEW
          options: [
            "People work around it, and nobody owns fixing it.",
            "Someone proposes a new tool, often an AI one, before anyone knows the cause.",
            "We look for the cause first, but fixes stall when they need another team's sign-off.",
            "We fix the cause first, then try a simple rule. AI gets the reading and writing that's left.",
          ],
          // TODO REVIEW
          nextStep:
            "Run your slowest step through four questions, in order, and act on the first yes. Chasing, waiting or redoing? Fix the process. The same steps every time? Automate it with a rule. Mostly reading or writing? Let AI help. None of these? Keep it human.",
        },
        {
          id: "data",
          // TODO REVIEW
          prompt: "Could an AI tool get the information it needs for that work today?",
          // TODO REVIEW
          options: [
            "No. It's spread across inboxes, spreadsheets and people's memories.",
            "It's in our systems, but getting it out takes manual work, and people argue over which numbers are right.",
            "It's in systems we can reach. The gaps are known, but nobody owns fixing them.",
            "Yes. It's in systems approved tools can reach, and someone owns keeping it accurate.",
          ],
          // TODO REVIEW
          nextStep:
            "Name an owner for the data your first AI use depends on. Give them one job: list where it lives, what's missing and what's wrong. Fix those before the tool arrives.",
        },
      ],
    },
    {
      id: "governance",
      name: "Governance & intake",
      // TODO REVIEW
      asks: "How does an AI idea get a yes?",
      framework: "risk-tiered-adoption",
      questions: [
        {
          id: "intake",
          // TODO REVIEW
          prompt: {
            department: "If someone in your department wants to try a new AI tool, what happens?",
            company: "If someone at your company wants to try a new AI tool, what happens?",
          },
          // TODO REVIEW
          options: [
            "They just use it. Nobody would know.",
            "They ask around, and the answer depends on who they ask.",
            "There's a process, but every request gets the same heavy review, so people avoid it.",
            "There's one clear place to ask. Low-risk requests get a quick yes, and riskier ones get a closer look.",
          ],
          // TODO REVIEW
          nextStep:
            "Set up one place to ask, with a promised turnaround. Approve low-risk requests quickly, and save the deeper review for anything that touches customer data or acts on its own.",
        },
        {
          id: "security",
          // TODO REVIEW
          prompt: "What happens before an AI tool can act on customer data, or send data to an outside service?",
          // TODO REVIEW
          options: [
            "Nothing in particular. It depends on who builds it.",
            "Security looks at it, usually after it's built or already live.",
            "Security reviews it, but alongside the build rather than before it.",
            "Build work pauses for a security review first, and the review has a turnaround time people can plan around.",
          ],
          // TODO REVIEW
          nextStep:
            "Write one rule and share it: anything that takes automated action on customer data, or sends data to a service you don't control, gets a security review before build work continues. Then agree on how fast that review happens.",
        },
        {
          id: "register",
          // TODO REVIEW
          prompt: {
            department: "Could you list every AI tool your department uses, with the data it touches and who owns it?",
            company: "Could anyone at your company list every AI tool in use, with the data it touches and who owns it?",
          },
          // TODO REVIEW
          options: [
            "No. We'd have to ask around, and we'd still miss some.",
            "There's a list of approved tools, but not of how they're used.",
            "There's a list of AI projects, but it's out of date.",
            "Yes. It's current: every tool and project, its risk tier, the data it touches and a named owner.",
          ],
          // TODO REVIEW
          nextStep:
            "Start a one-page register: each AI tool or project, what it's for, the data it touches, its risk tier and one named owner. Review it monthly. A tool nobody owns is a pilot nobody will finish.",
        },
      ],
    },
    {
      id: "trust",
      name: "Trust & verification",
      // TODO REVIEW
      asks: "Is checking cheaper than doing?",
      framework: "calibrated-trust",
      questions: [
        {
          id: "unchecked",
          // TODO REVIEW
          prompt: "How do you decide which tasks AI can do without a person checking?",
          // TODO REVIEW
          options: [
            "We don't decide. People use their own judgment, or avoid AI.",
            "We trust it where it looked good when we tried it.",
            "We have rules of thumb, like always checking numbers, but they aren't written down.",
            "Each use is sorted by how costly a mistake would be and how easy it is to check. That decides what runs freely, gets reviewed or stays human.",
          ],
          // TODO REVIEW
          nextStep:
            "Place your five most common AI uses on two questions: how bad would a mistake be, and how easy is it to check? Easy to check: let it run if mistakes are minor, verify it if they're costly. Hard to check: ideas only, or keep it human.",
        },
        {
          id: "checker",
          // TODO REVIEW
          prompt: "Who checks AI output before someone relies on it?",
          // TODO REVIEW
          options: [
            "Nobody in particular. If it reads well, it goes out.",
            "Whoever used the tool, when they have time.",
            "Someone who knows the subject, for the riskier uses.",
            "Someone who knows the subject, as a step in the workflow that can't be skipped.",
          ],
          // TODO REVIEW
          nextStep:
            "For your riskiest AI use, name a reviewer who could do the work without the tool, and make their check a step in the process, not a favor. Give them a short list of what to look for.",
        },
        {
          id: "error-rate",
          // TODO REVIEW
          prompt: "How do you know how often your AI tools are wrong?",
          // TODO REVIEW
          options: [
            "We don't. We'd hear about a big mistake eventually.",
            "From complaints and stories.",
            "We tested on real examples before launch, but haven't checked since.",
            "We test on real examples before launch and keep sampling the output after, so we'd notice if it slipped.",
          ],
          // TODO REVIEW
          nextStep:
            "Pull 20 recent outputs from one AI tool and have someone who knows the work grade each one: right, fixable or wrong. That's your error rate. Repeat it every month, and after every model or prompt change.",
        },
      ],
    },
    {
      id: "people",
      name: "People & judgment",
      // TODO REVIEW
      asks: "Who holds the judgment?",
      framework: "keep-it-human",
      questions: [
        {
          id: "final-call",
          // TODO REVIEW
          prompt: "When AI helps with a decision, who owns the final call?",
          // TODO REVIEW
          options: [
            "It's unclear. If an AI-assisted call went wrong, we'd have to work out who answers for it.",
            "A person signs off, but mostly by approving what the tool suggests.",
            "A named person decides, and the AI's suggestion is one input among several.",
            "We agreed in advance which calls stay with people, and a named person makes each one.",
          ],
          // TODO REVIEW
          nextStep:
            "For each decision AI helps with, write down who makes the final call before the work starts. Before anything goes out, ask them: could you defend this without saying \"the AI suggested it\"?",
        },
        {
          id: "skills",
          // TODO REVIEW
          prompt: "How are people learning to use AI well?",
          // TODO REVIEW
          options: [
            "On their own, if at all.",
            "There was a training session once.",
            "There's ongoing training on the tools and their features.",
            "Training covers the work itself: when to use AI, how to check it and what to keep. People get time to practice on real tasks.",
          ],
          // TODO REVIEW
          nextStep:
            "Run a one-hour session on real work, not features. Bring three actual tasks and decide together which to hand off, which to check and which to keep, and why.",
        },
        {
          id: "champions",
          // TODO REVIEW
          prompt: {
            department: "Is there someone in your department people go to with AI questions?",
            company: "Are there people across your company that others go to with AI questions?",
          },
          // TODO REVIEW
          options: [
            "No. People figure it out alone, or don't try.",
            "A few enthusiasts help when asked, on top of their day jobs.",
            "There are named champions, with some time set aside for it.",
            "Named champions have time set aside, share what works and bring problems back to whoever owns the tools.",
          ],
          // TODO REVIEW
          nextStep:
            "Name one champion per team and give them a few hours a month for it. Ask them for two things each month: what's working that others should copy, and what's breaking that someone should fix.",
        },
      ],
    },
    {
      id: "measurement",
      name: "Measurement & value",
      // TODO REVIEW
      asks: "Can you show what it delivers?",
      framework: "ai-should-be-boring",
      questions: [
        {
          id: "baseline",
          // TODO REVIEW
          prompt: "Before an AI project starts, is there a number it's meant to move?",
          // TODO REVIEW
          options: [
            "No. The goal is to try it and see.",
            "There's a goal, like saving time, but no number.",
            "There's a target, but nobody measured where we started.",
            "There's a target, and a baseline measured before the build, agreed with the people who'll judge success.",
          ],
          // TODO REVIEW
          nextStep:
            "Before the next AI project starts, write down one number it should move, such as hours per week or error rate, and measure it now. Without a baseline, any result is a guess.",
        },
        {
          id: "tracking",
          // TODO REVIEW
          prompt: "After launch, how do you know an AI tool is delivering?",
          // TODO REVIEW
          options: [
            "We don't track it. We go on how people feel about it.",
            "We track usage: logins, licenses, prompts sent.",
            "We check a results number now and then, usually when someone asks.",
            "We track the agreed number against the baseline on a schedule, and someone owns it.",
          ],
          // TODO REVIEW
          nextStep:
            "In your next update, replace one usage number with a results number, shown against its baseline. Put a name and a date next to it.",
        },
        {
          id: "pilots",
          // TODO REVIEW
          prompt: "What happens to an AI pilot that doesn't hit its number?",
          // TODO REVIEW
          options: [
            "We couldn't say which pilots hit their number.",
            "It keeps running, because nobody decided to stop it.",
            "We change or stop it eventually, but there's no set point to decide.",
            "Every pilot has a decision date: scale it, change it or stop it, based on the number.",
          ],
          // TODO REVIEW
          nextStep:
            "Give every pilot a decision date and three possible outcomes: scale it, change it or stop it. On that date, decide with the number in front of you.",
        },
      ],
    },
  ] satisfies Dimension[],

  // ---------------------------------------------------------------------------
  // The question screens
  // ---------------------------------------------------------------------------
  quiz: {
    progress: "Question {n} of {total}",
    back: "Back",
    next: "Next",
    // TODO REVIEW
    finish: "See my results",
    // TODO REVIEW
    required: "Pick the answer closest to how things are today.",
  },

  // ---------------------------------------------------------------------------
  // The results
  // ---------------------------------------------------------------------------
  results: {
    kicker: { own: "Your result", shared: "Shared result" },
    // TODO REVIEW
    snapshot: "Self-reported snapshot",
    stamp: "Taken {date}",
    // TODO REVIEW
    lead: {
      own: { department: "Your department is at", company: "Your company is at" },
      shared: { department: "This department is at", company: "This company is at" },
    },
    // TODO REVIEW
    points: "{points} of {max} points, an average of {average} out of 3.",
    trackLabel: "The four stages",
    youAreHere: "You are here",
    // TODO REVIEW
    nextLabel: { up: "To move up", top: "To stay here" },
    // TODO REVIEW
    capped:
      "The points alone would reach {uncapped}. But {dimension} is at {weakStage}, and one weak link is enough to keep AI from being dependable, so the overall stage stops {steps} above it.",

    // TODO REVIEW
    dimensionsHeading: "By dimension",
    // TODO REVIEW
    dimensionsIntro: "Three questions each, worth up to {max} points.",
    dimensionPoints: "{points} of {max}",
    gapTag: "Gap {n}",

    // TODO REVIEW
    gaps: {
      heading: { own: "Your {count} biggest gaps", shared: "The {count} biggest gaps" },
      headingOne: { own: "Your biggest gap", shared: "The biggest gap" },
      intro: "The lowest-scoring dimensions, each with one next step.",
      said: "Where things stand",
      step: "Next step",
      read: "Read the framework: {framework}",
      none: "Nothing stands out: every dimension scored full marks. That's rare enough to double-check. Would the people doing the work answer the same way?",
    },

    // TODO REVIEW
    about: {
      heading: "What this is, and isn't",
      paragraphs: [
        "A self-reported snapshot, not a benchmark. It reflects one person's answers on one day, from where they sit.",
        "It doesn't compare you with other teams or companies, and no industry average sits behind it. The stages are a way to talk about readiness, not a grade.",
        "For a sharper picture, ask two or three colleagues to take it too, and talk about where your answers differ.",
      ],
      methodHeading: "How the score works",
      method: [
        "Each answer scores 0 to 3, from the first option to the last.",
        "A dimension's score is the total of its three answers, out of {max}.",
        "The stage comes from the average answer across all {questions} questions: {thresholds}.",
        "One weak link is enough to keep AI from being dependable, so the overall stage sits at most {steps} above the weakest dimension.",
        "The gaps are the lowest-scoring dimensions. A tie goes to the one with the lowest single answer. Each next step comes from the lowest answer in that dimension.",
      ],
      /** How the thresholds read in the sentence above. */
      thresholdFirst: "{stage} below {next}",
      thresholdOther: "{stage} from {min}",
    },

    // TODO REVIEW
    actions: {
      heading: "Save or share",
      print: "Print or save as PDF",
      copy: "Copy link",
      share: "Share",
      copied: "Link copied.",
      copyFailed: "Couldn't copy. Select the link and copy it yourself.",
      linkLabel: "Link to this result",
      linkNote:
        "The link holds the answers after the # sign, so nothing is stored on a server. Anyone with the link can see this page.",
      startOver: "Start over",
      printLink: "See this result online:",
    },

    // TODO REVIEW
    shared: {
      banner: "You're looking at a shared result.",
      takeIt: "Take the assessment yourself",
    },
    // TODO REVIEW
    badLink: {
      broken: "That link doesn't hold a complete result. It may have been cut off when it was copied. You can take the assessment yourself below.",
      old: "That link was made with an earlier version of these questions, so its answers can't be read. You can take the current version below.",
    },

    /** Under the contact band's heading at the end of the results. */
    // TODO REVIEW
    contactNote: "If these results raise a question, or you'd like a second opinion on where to start, I'm glad to talk it through.",
  },

  // ---------------------------------------------------------------------------
  // The optional email form. It only appears once an email service is plugged
  // in (see email.ts).
  // ---------------------------------------------------------------------------
  // TODO REVIEW: all of this, especially the consent text and the "a few a year" promise.
  email: {
    heading: "Email me this result",
    intro: "Get the link in your inbox, so you can come back to it or forward it.",
    label: "Email address",
    notes: "Also send me occasional notes on getting AI into production. A few a year at most. Unsubscribe anytime.",
    consent: "I'll use your address only to send this result and, if you tick the box, those notes. I won't share or sell it.",
    submit: "Email me this result",
    sending: "Sending…",
    sent: "Sent. It should arrive in a minute or two.",
    invalid: "Enter an email address, like name@example.com.",
    failed: "That didn't go through. The link above still works: copy it, or print this page.",
  },

  /** Read out to screen readers after a score such as "6 of 9". */
  pointsWord: "points",
};

export type Assessment = typeof ASSESSMENT;
