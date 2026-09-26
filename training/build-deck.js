/* CONA Services — Responsible AI training deck (Microsoft playbook, Coca-Cola system style) */
const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");

const OUT = process.argv[2] || "deck.pptx";
const RED = "E4002B", DRED = "B3001F", BLACK = "111111", INK = "3D3D3D", GREY = "6B6B6B", LIGHT = "F4F4F4", LINE = "E2E2E2", WHITE = "FFFFFF", TINT = "FDECEF";
const F = "Arial";
const W = 13.333, H = 7.5, M = 0.6;

async function icon(Comp, color, size = 256) {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
const IC = {};
async function loadIcons() {
  const list = {
    scale: fa.FaScaleBalanced, shield: fa.FaShieldHalved, lock: fa.FaLock, access: fa.FaUniversalAccess, eye: fa.FaEye, user: fa.FaUserCheck,
    bulb: fa.FaLightbulb, warn: fa.FaTriangleExclamation, check: fa.FaCircleCheck, chart: fa.FaChartLine, search: fa.FaMagnifyingGlass,
    sign: fa.FaFileSignature, users: fa.FaUsers, clip: fa.FaClipboardCheck, gavel: fa.FaGavel, heart: fa.FaHeartPulse, hand: fa.FaHandshake,
    robot: fa.FaRobot, file: fa.FaFileLines, mail: fa.FaEnvelope, xmark: fa.FaCircleXmark, clock: fa.FaClock, flag: fa.FaFlag, gear: fa.FaGears,
    book: fa.FaBookOpen, star: fa.FaStar, share: fa.FaShareNodes, tag: fa.FaTag, route: fa.FaRoute, graduation: fa.FaGraduationCap, comments: fa.FaComments,
    rights: fa.FaPersonCircleExclamation, money: fa.FaSackDollar, layers: fa.FaLayerGroup, calendar: fa.FaCalendarCheck
  };
  for (const [k, C] of Object.entries(list)) { IC[k] = await icon(C, WHITE); IC[k + "_red"] = await icon(C, RED); IC[k + "_black"] = await icon(C, BLACK); }
}

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "CONA Services AI Enablement";
pres.company = "CONA Services";
pres.title = "Responsible AI at CONA Services";
let n = 0;

/* ---------- helpers ---------- */
function T(slide, text, o) { slide.addText(text, Object.assign({ fontFace: F, color: INK, fontSize: 16, isTextBox: true, margin: 0, valign: "top" }, o)); }
function foot(slide, dark) {
  n++;
  T(slide, "CONA Services  ·  Responsible AI training", { x: M, y: H - 0.45, w: 3.5, h: 0.25, fontSize: 9, color: dark ? "FFD1DA" : GREY });
  T(slide, String(n), { x: W - M - 1, y: H - 0.45, w: 1, h: 0.25, fontSize: 9, color: dark === true ? "FFD1DA" : GREY, align: "right" });
}
function head(slide, kicker, title, sub) {
  T(slide, kicker.toUpperCase(), { x: M, y: 0.45, w: 10, h: 0.3, fontSize: 12, bold: true, color: RED, charSpacing: 2 });
  T(slide, title, { x: M, y: 0.78, w: W - 2 * M, h: 0.9, fontSize: 32, bold: true, color: BLACK, valign: "top" });
  if (sub) T(slide, sub, { x: M, y: 1.62, w: W - 2 * M, h: 0.5, fontSize: 16, color: GREY });
}
function circleIcon(slide, key, x, y, d, fill) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill || RED }, line: { color: fill || RED } });
  slide.addImage({ data: IC[key], x: x + d * 0.25, y: y + d * 0.25, w: d * 0.5, h: d * 0.5 });
}
function card(slide, x, y, w, h, fill) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill || LIGHT }, line: { color: fill || LIGHT } });
}
function bullets(items, o) {
  return items.map((t, i) => {
    const parts = Array.isArray(t) ? t : [t];
    return { text: parts[0], options: Object.assign({ bullet: { indent: 18 }, breakLine: i < items.length - 1, paraSpaceAfter: 8 }, o || {}) };
  });
}
function rich(items, size) { // [["Bold lead. ", "rest"], ...] as bulleted paragraphs
  const out = [];
  items.forEach((it, i) => {
    out.push({ text: it[0], options: { bold: true, color: BLACK, bullet: { indent: 18 }, fontSize: size } });
    out.push({ text: it[1], options: { color: INK, fontSize: size, breakLine: i < items.length - 1, paraSpaceAfter: 10 } });
  });
  return out;
}
function section(num, title, sub, notes) {
  const s = pres.addSlide(); s.background = { color: RED };
  T(s, num, { x: M, y: 1.1, w: 4, h: 1.6, fontSize: 110, bold: true, color: WHITE });
  T(s, title, { x: M, y: 2.95, w: 11.5, h: 1.5, fontSize: 40, bold: true, color: WHITE, valign: "bottom" });
  T(s, sub, { x: M, y: 4.75, w: 10.5, h: 0.9, fontSize: 18, color: "FFE3E8" });
  foot(s, true); s.addNotes(notes); return s;
}

async function build() {
  await loadIcons();
  let s;

  /* 1 ─ Title */
  s = pres.addSlide(); s.background = { color: RED };
  T(s, "CONA SERVICES  ·  AI ENABLEMENT", { x: M, y: 0.6, w: 8, h: 0.35, fontSize: 13, bold: true, color: WHITE, charSpacing: 3 });
  T(s, "Responsible AI\nat CONA Services", { x: M, y: 1.7, w: 9, h: 2.4, fontSize: 54, bold: true, color: WHITE });
  T(s, "Using AI well, using it safely, and proving it's worth it", { x: M, y: 4.2, w: 9, h: 0.6, fontSize: 22, color: WHITE });
  T(s, "Company-wide training  ·  Built on Microsoft's Responsible AI Standard and the Cloud Adoption Framework for AI", { x: M, y: 5.2, w: 10, h: 0.4, fontSize: 14, color: "FFE3E8" });
  s.addShape(pres.shapes.OVAL, { x: 10.2, y: 1.5, w: 2.5, h: 2.5, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ data: IC.robot_red, x: 10.8, y: 2.1, w: 1.3, h: 1.3 });
  foot(s, true);
  s.addNotes("Welcome everyone. This session takes about 75 minutes, including a short knowledge check at the end. It's for everyone at CONA Services, not just technical teams. By the end you'll know how to use AI tools like Microsoft 365 Copilot well and safely, what our six responsible AI principles mean in practice, how we decide which AI projects go ahead, and how we show that AI is worth the investment. Everything here follows Microsoft's published guidance, because we're a Microsoft 365 company and it's the framework our tools are built on.");

  /* 2 ─ Agenda */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Today", "Five short modules, about 75 minutes");
  const mods = [["01", "AI basics", "What it's good at, what it isn't, and how Copilot works", "10 min"],
    ["02", "Microsoft's six principles", "The rules we use to judge any use of AI", "15 min"],
    ["03", "Using AI safely every day", "Data, sharing, checking, and when to ask", "15 min"],
    ["04", "How we govern AI projects", "Risk tiers, approvals and the paperwork", "20 min"],
    ["05", "Proving the value", "How we measure what AI is worth", "10 min"]];
  mods.forEach((m, i) => {
    const y = 2.15 + i * 0.9;
    T(s, m[0], { x: M, y, w: 0.9, h: 0.7, fontSize: 30, bold: true, color: RED });
    T(s, m[1], { x: 1.6, y: y + 0.02, w: 5, h: 0.4, fontSize: 20, bold: true, color: BLACK });
    T(s, m[2], { x: 1.6, y: y + 0.42, w: 8, h: 0.35, fontSize: 14, color: GREY });
    T(s, m[3], { x: W - M - 1.6, y: y + 0.1, w: 1.6, h: 0.4, fontSize: 14, color: INK, align: "right" });
    if (i < mods.length - 1) s.addShape(pres.shapes.LINE, { x: 1.6, y: y + 0.84, w: W - 2.2, h: 0, line: { color: LINE, width: 1 } });
  });
  T(s, "Plus a five-question knowledge check and your first 30 days.", { x: M, y: 6.75, w: 9, h: 0.3, fontSize: 13, color: GREY, italic: true });
  foot(s);
  s.addNotes("Walk through the five modules. Emphasise that modules 1 to 3 are for everyone, every day. Module 4 matters most for anyone who owns or sponsors a project, but everyone should know it exists so they know when to use it. Module 5 is how we show leadership that this is worth it, and it depends on everyone logging their wins.");

  /* 3 ─ Outcomes */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "By the end of today", "Four things you'll be able to do");
  const outs = [["bulb", "Use AI on real work", "Brief Copilot like a colleague and get a useful first draft, not a generic one."],
    ["scale", "Apply the six principles", "Ask the right questions before AI touches customers, people or sensitive data."],
    ["clip", "Know when it's a project", "Spot when an idea needs a risk tier, a review and an approval."],
    ["chart", "Show what it's worth", "Log wins and track benefits honestly, so the numbers stand up."]];
  outs.forEach((o, i) => {
    const x = M + i * 3.1;
    card(s, x, 2.2, 2.85, 3.9);
    circleIcon(s, o[0], x + 0.3, 2.5, 0.9);
    T(s, o[1], { x: x + 0.3, y: 3.6, w: 2.3, h: 0.8, fontSize: 19, bold: true, color: BLACK });
    T(s, o[2], { x: x + 0.3, y: 4.45, w: 2.3, h: 1.5, fontSize: 14, color: INK });
  });
  foot(s);
  s.addNotes("These are the four outcomes. If someone only remembers one thing, it should be the second: the six principles are the questions we ask about any use of AI. The rest of the session hangs off them.");

  /* ── MODULE 1 ── */
  section("01", "AI basics", "What it's good at, what it isn't, and how Microsoft 365 Copilot works", "Module 1. The goal is to give everyone the same mental model of what these tools are, so the rest of the session makes sense.");

  /* 5 ─ good at / bad at */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "AI basics", "A smart new hire who has never worked here", "Well read, fast, eager to help. It doesn't know our customers, systems or last week's decision unless you tell it.");
  card(s, M, 2.45, 5.9, 4.2, LIGHT);
  circleIcon(s, "check", M + 0.3, 2.7, 0.7, BLACK);
  T(s, "Good at", { x: M + 1.2, y: 2.82, w: 4, h: 0.5, fontSize: 22, bold: true, color: BLACK });
  s.addText(bullets(["Drafting emails, documents and summaries", "Rewriting: shorter, clearer, a different tone", "Pulling structure out of messy notes", "Explaining formulas, code and jargon", "Comparing two documents", "Brainstorming options and questions"]), { x: M + 0.3, y: 3.6, w: 5.3, h: 2.9, fontFace: F, fontSize: 15, color: INK, isTextBox: true, valign: "top" });
  card(s, 6.83, 2.45, 5.9, 4.2, TINT);
  circleIcon(s, "xmark", 7.13, 2.7, 0.7, RED);
  T(s, "Not good at", { x: 8.03, y: 2.82, w: 4, h: 0.5, fontSize: 22, bold: true, color: BLACK });
  s.addText(bullets(["Exact arithmetic: it can add up wrong and sound sure", "Facts it wasn't given: it may invent a policy or a statistic", "Knowing our context: customers, history, decisions", "Giving the same answer twice", "Judgement calls about people", "Knowing when it's wrong"]), { x: 7.13, y: 3.6, w: 5.3, h: 2.9, fontFace: F, fontSize: 15, color: INK, isTextBox: true, valign: "top" });
  foot(s);
  s.addNotes("The new-hire analogy is the one to land. A very capable new hire who's read everything but never worked here. You'd give them context, check their work, and not let them make decisions about people on day one. AI is the same. Call out the arithmetic point: models predict text, they don't calculate. For numbers, use Excel and let AI explain or write the formula.");

  /* 6 ─ right tool */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "AI basics", "Use the right tool for the job", "A lot of work doesn't need AI. Knowing that is part of using it well.");
  const rows = [["The job", "Best tool", "Why"],
    ["Summarise a 40-message email thread", "Copilot in Outlook", "Reading and condensing language is its strength"],
    ["Total a column of 400 numbers", "Excel", "Exact every time. AI can explain the formula"],
    ["Apply the same written rules to every request", "Power Automate or a workflow", "Rules run identically and leave an audit trail"],
    ["Draft a first version of a proposal", "Copilot in Word", "A strong first draft saves hours; you edit"],
    ["Decide who gets a pay rise", "A person", "Decisions about people stay with people"],
    ["Report on something a system already tracks", "The existing report", "It's already built, supported and trusted"]];
  s.addTable(rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 1, color: i === 0 ? WHITE : (j === 1 ? BLACK : INK), fill: { color: i === 0 ? BLACK : (i % 2 ? WHITE : LIGHT) } } }))),
    { x: M, y: 2.35, w: W - 2 * M, colW: [4.6, 3.1, 4.43], fontFace: F, fontSize: 14, border: { type: "solid", color: LINE, pt: 0.75 }, rowH: 0.55, valign: "middle", margin: [0.04, 0.1, 0.04, 0.1] });
  foot(s);
  s.addNotes("Go down the table and ask the room before revealing the middle column if you have time. The point: AI is one tool among several. Conventional automation (Power Automate, a macro, a scheduled report) is often the better answer when rules are clear. That's not a failure of AI; it's good judgement. Our Idea check in the portal will tell you when that's the case.");

  /* 7 ─ How Copilot works */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "AI basics", "How Microsoft 365 Copilot works", "It answers using the content you already have permission to see, inside our Microsoft 365 tenant.");
  const flow = [["comments", "You ask", "A prompt in Word, Outlook, Teams, Excel or Copilot Chat"], ["search", "It looks", "Searches the emails, chats, meetings and files you can already open"],
    ["robot", "It drafts", "A large language model writes the answer from what it found"], ["file", "You check", "Answers show references. Open them before you rely on it"]];
  flow.forEach((f, i) => {
    const x = M + i * 3.1;
    circleIcon(s, f[0], x + 0.9, 2.45, 1.0, i === 3 ? BLACK : RED);
    T(s, f[1], { x, y: 3.6, w: 2.8, h: 0.45, fontSize: 20, bold: true, color: BLACK, align: "center" });
    T(s, f[2], { x: x + 0.1, y: 4.1, w: 2.6, h: 1.1, fontSize: 14, color: INK, align: "center" });
    if (i < 3) T(s, "→", { x: x + 2.55, y: 2.6, w: 0.6, h: 0.6, fontSize: 32, color: GREY, align: "center" });
  });
  card(s, M, 5.45, W - 2 * M, 1.2, LIGHT);
  s.addText(rich([["It respects permissions. ", "Copilot never gives you access to anything you couldn't already open."], ["Your data isn't used to train the models. ", "Microsoft states that prompts, responses and data accessed through Microsoft 365 aren't used to train its foundation models."]], 14), { x: M + 0.3, y: 5.6, w: W - 2 * M - 0.6, h: 1.0, fontFace: F, isTextBox: true, valign: "top" });
  foot(s);
  s.addNotes("Keep this simple. Copilot is grounded in your own work data through Microsoft Graph, which means it can only use what you can already access. That's great for usefulness. It also means that if something has been shared too widely, Copilot will find it quickly. We come back to that in module 3. The training commitment is Microsoft's published position for Microsoft 365 Copilot; point people to our AI policy for our own rules.");

  /* 8 ─ Brief like a colleague */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "AI basics", "Brief it the way you'd brief a colleague");
  const parts = [["Who it's for", "“For the VP of Sales, reading on their phone”"], ["What to do", "One clear verb: draft, shorten, compare, list"], ["The material", "Paste it or reference the file. Don't make it guess"], ["What good looks like", "Length, format, tone: “under 120 words, three bullets”"], ["An example", "“Write it like this one” beats any description"]];
  parts.forEach((p, i) => {
    const y = 1.85 + i * 0.95;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.6, h: 0.6, fill: { color: RED }, line: { color: RED } });
    T(s, String(i + 1), { x: M, y: y + 0.1, w: 0.6, h: 0.4, fontSize: 18, bold: true, color: WHITE, align: "center" });
    T(s, p[0], { x: M + 0.85, y: y + 0.02, w: 4.5, h: 0.35, fontSize: 17, bold: true, color: BLACK });
    T(s, p[1], { x: M + 0.85, y: y + 0.38, w: 4.8, h: 0.45, fontSize: 13, color: GREY });
  });
  card(s, 6.6, 1.85, 6.13, 1.2, LIGHT);
  T(s, "WEAK", { x: 6.85, y: 2.0, w: 2, h: 0.3, fontSize: 11, bold: true, color: GREY, charSpacing: 2 });
  T(s, "Write an email about the export delay.", { x: 6.85, y: 2.35, w: 5.6, h: 0.6, fontSize: 15, color: INK });
  s.addShape(pres.shapes.RECTANGLE, { x: 6.6, y: 3.25, w: 6.13, h: 3.35, fill: { color: WHITE }, line: { color: BLACK, width: 2 } });
  T(s, "STRONG", { x: 6.85, y: 3.42, w: 2, h: 0.3, fontSize: 11, bold: true, color: RED, charSpacing: 2 });
  T(s, "Write an email to our main contact at [customer]. Their data export scheduled for Tuesday will now run Thursday because a migration failed overnight. We've run their three most-used reports manually so they aren't blocked. Firm and factual, one apology, under 120 words. End by offering a call tomorrow.", { x: 6.85, y: 3.8, w: 5.65, h: 2.6, fontSize: 15, color: BLACK });
  foot(s);
  s.addNotes("Most disappointing answers come from short prompts. The fix is the same thing you'd do for a colleague: say who it's for, what you want, give them the material, and say what good looks like. Read out the strong example. Point out that nothing in it is technical; it's just a clear brief. The portal's prompt library has 41 ready-made prompts built this way.");

  /* ── MODULE 2 ── */
  section("02", "Microsoft's six principles", "The questions we ask about any use of AI, from a quick prompt to a major project", "Module 2. These six principles come from Microsoft's Responsible AI Standard. They're the same principles Microsoft's Cloud Adoption Framework uses to assess AI risk, and they're the backbone of our own governance.");

  /* 10 ─ principles overview */
  const P = [["scale", "Fairness", "AI systems should treat all people fairly."], ["shield", "Reliability and safety", "AI systems should perform reliably and safely."], ["lock", "Privacy and security", "AI systems should be secure and respect privacy."],
    ["access", "Inclusiveness", "AI systems should empower everyone and engage all people."], ["eye", "Transparency", "AI systems should be understandable."], ["user", "Accountability", "People should be accountable for AI systems."]];
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "The principles", "Six principles, one question each", "Microsoft's wording, and the question it turns into for us.");
  const Q = ["Could this treat someone differently because of who they are?", "What happens when it's wrong, and would we catch it?", "Is this data allowed in this tool, and is it shared only as needed?", "Does it work for everyone who has to use it?", "Do people know AI was involved, and what it can't do?", "Who owns this, and who answers for it?"];
  P.forEach((p, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = M + col * 4.1, y = 2.35 + row * 2.3;
    card(s, x, y, 3.85, 2.1);
    circleIcon(s, p[0], x + 0.25, y + 0.25, 0.7);
    T(s, p[1], { x: x + 1.1, y: y + 0.3, w: 2.6, h: 0.6, fontSize: 17, bold: true, color: BLACK, valign: "middle" });
    T(s, p[2], { x: x + 0.25, y: y + 1.05, w: 3.4, h: 0.4, fontSize: 12, italic: true, color: GREY });
    T(s, Q[i], { x: x + 0.25, y: y + 1.45, w: 3.4, h: 0.6, fontSize: 13.5, color: BLACK });
  });
  foot(s);
  s.addNotes("Here are all six on one page. Microsoft's one-line definition is in italics, and underneath is the plain question each one turns into for us. Over the next six slides we'll take each principle, say what it means for your day-to-day use, and what it means for projects.");

  /* 11–16 ─ one slide per principle */
  const detail = [
    { day: ["Don't use AI to rank, screen or judge people.", "Watch for AI copying biased language from old material.", "If an output treats groups differently, flag it."],
      proj: ["Is it a sensitive use: jobs, pay, credit, access to services?", "Test outputs across different customer and employee groups.", "A person makes every decision about people."],
      ex: "Using AI to shortlist job applicants is a sensitive use and needs a Tier 3 review. Using it to tidy your own interview notes is fine." },
    { day: ["Check numbers, names and dates against the source.", "Don't rely on AI for anything you can't check.", "Use Excel or a report for exact figures."],
      proj: ["Test on real past examples before launch.", "Set the pass mark before the pilot starts.", "Monitor it once it's live, and have a way to switch it off."],
      ex: "A support drafting pilot was tested on 50 past tickets, with a pass mark written down before it started, and a feature flag to turn it off in minutes." },
    { day: ["Use approved tools only, like Copilot in our tenant.", "Don't paste personal or confidential data you don't need.", "Keep sensitivity labels on, and share on purpose."],
      proj: ["Privacy review for personal data.", "Security review for any new vendor or model.", "Only the data fields that are actually needed."],
      ex: "Replacing names and account numbers with placeholders like [Customer A] lets AI help without the personal data ever leaving your hands." },
    { day: ["Write prompts and outputs in plain language.", "Consider people using screen readers or a second language.", "Don't leave out colleagues who work differently."],
      proj: ["Who uses it, and who is affected by it?", "Test accessibility and language support.", "Keep a non-AI route for people who need it."],
      ex: "A drafting tool rolled out in English and Spanish, tested with a screen reader, and kept the old workflow for agents who opted out." },
    { day: ["Don't present AI output as a checked fact.", "Say when AI drafted something, where our policy asks you to.", "Open the references Copilot shows."],
      proj: ["Tell users when they're dealing with AI output.", "Explain its limits in plain words.", "Customers get replies from a named person."],
      ex: "Agents see an “AI draft” label and a one-page guide to its limits. Customers still get replies written and sent by a named agent." },
    { day: ["You own everything you send, whoever drafted it.", "“The AI did it” is never the answer.", "Report problems to the tool owner."],
      proj: ["A named owner for every AI project.", "A named reviewer for outputs, and a route for complaints.", "Approvals by people who aren't involved in the project."],
      ex: "Owner: Head of Support Operations. Agents own every reply they send. Issues reach the support ops lead within one business day." }];
  const pnotes = [
    "Fairness. For everyday use, the key message is don't use AI to judge people. For projects, the first question is whether it's what Microsoft calls a sensitive use, meaning it could affect someone's job, pay, credit, housing or access to services. If so, it's automatically our highest risk tier.",
    "Reliability and safety. Day to day, this is simply: check before you trust. For projects, it's about testing on real examples, writing the pass mark down before the pilot starts so it can't be quietly moved, and monitoring once it's live. Every project needs a way to switch it off.",
    "Privacy and security. The everyday rules are approved tools, minimum data, and careful sharing. For projects: privacy review for personal data, security review for any new vendor or model. The placeholder trick is the most useful habit here.",
    "Inclusiveness is easy to forget. Think about who uses a tool and who is affected by it: people using screen readers, people working in a second language, people who prefer to work differently. Projects should test for this and keep a non-AI route.",
    "Transparency means people understand when AI is involved and what its limits are. Day to day, don't pass AI output off as a checked fact. Open the references Copilot shows you. For projects, label AI output and explain its limits in plain words.",
    "Accountability is the principle everything else rests on. A person owns every output and every project. For projects that means a named owner, a named reviewer, a complaints route, and approvals from people who aren't involved in the work."];
  P.forEach((p, i) => {
    s = pres.addSlide(); s.background = { color: WHITE };
    card(s, 0, 0, 4.3, H, RED);
    s.addShape(pres.shapes.OVAL, { x: M, y: 0.9, w: 1.3, h: 1.3, fill: { color: WHITE }, line: { color: WHITE } });
    s.addImage({ data: IC[p[0] + "_red"], x: M + 0.3, y: 1.2, w: 0.7, h: 0.7 });
    T(s, "PRINCIPLE " + (i + 1) + " OF 6", { x: M, y: 2.55, w: 3.4, h: 0.3, fontSize: 12, bold: true, color: "FFE3E8", charSpacing: 2 });
    T(s, p[1], { x: M, y: 2.9, w: 3.4, h: 1.3, fontSize: 32, bold: true, color: WHITE });
    T(s, "“" + p[2] + "”", { x: M, y: 4.35, w: 3.3, h: 1.0, fontSize: 15, italic: true, color: WHITE });
    T(s, "Microsoft Responsible AI Standard", { x: M, y: 5.4, w: 3.3, h: 0.3, fontSize: 11, color: "FFE3E8" });
    T(s, "The question: " + Q[i], { x: 4.9, y: 0.7, w: 7.8, h: 0.8, fontSize: 20, bold: true, color: BLACK });
    T(s, "IN YOUR DAY-TO-DAY WORK", { x: 4.9, y: 1.75, w: 3.6, h: 0.3, fontSize: 12, bold: true, color: RED, charSpacing: 1 });
    s.addText(bullets(detail[i].day), { x: 4.9, y: 2.15, w: 3.7, h: 2.6, fontFace: F, fontSize: 14, color: INK, isTextBox: true, valign: "top" });
    T(s, "IN AI PROJECTS", { x: 8.9, y: 1.75, w: 3.6, h: 0.3, fontSize: 12, bold: true, color: RED, charSpacing: 1 });
    s.addText(bullets(detail[i].proj), { x: 8.9, y: 2.15, w: 3.8, h: 2.6, fontFace: F, fontSize: 14, color: INK, isTextBox: true, valign: "top" });
    card(s, 4.9, 5.0, 7.83, 1.6, LIGHT);
    T(s, "EXAMPLE", { x: 5.15, y: 5.18, w: 2, h: 0.3, fontSize: 11, bold: true, color: GREY, charSpacing: 2 });
    T(s, detail[i].ex, { x: 5.15, y: 5.5, w: 7.35, h: 1.0, fontSize: 15, color: BLACK });
    foot(s, "split");
    s.addNotes(pnotes[i]);
  });

  /* 17 ─ Sensitive uses */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "The principles", "Three sensitive uses need the highest level of review", "From Microsoft's Responsible AI Standard. Any “yes” makes a project Tier 3 in our process.");
  const su = [["hand", "Life opportunities", "Could it affect someone's legal position or life opportunities, such as employment, pay, credit, housing, insurance, education or access to services?"],
    ["heart", "Serious harm", "Could its use or misuse cause someone significant physical or psychological injury?"],
    ["rights", "Human rights", "Could it restrict or undermine someone's human rights, such as privacy, freedom of expression or equal treatment?"]];
  su.forEach((c, i) => {
    const x = M + i * 4.1;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.4, w: 3.85, h: 3.4, fill: { color: WHITE }, line: { color: RED, width: 2 } });
    circleIcon(s, c[0], x + 0.3, 2.65, 0.85);
    T(s, c[1], { x: x + 0.3, y: 3.7, w: 3.3, h: 0.5, fontSize: 19, bold: true, color: BLACK });
    T(s, c[2], { x: x + 0.3, y: 4.25, w: 3.3, h: 1.5, fontSize: 14, color: INK });
  });
  card(s, M, 6.05, W - 2 * M, 0.7, BLACK);
  T(s, "Not sure? Treat it as a yes and ask the AI review board. A sensitive use isn't a no. It's a yes with the right people in the room.", { x: M + 0.3, y: 6.17, w: W - 2 * M - 0.6, h: 0.5, fontSize: 15, bold: true, color: WHITE, valign: "middle" });
  foot(s);
  s.addNotes("These three triggers come directly from Microsoft's Responsible AI Standard, where they trigger Microsoft's own sensitive-use review. We use them the same way. If an AI use could affect someone's life opportunities, cause harm, or touch human rights, it goes to the highest tier with Legal and Security involved. Stress the last line: it's not a ban, it's making sure the right people review it.");

  /* 18 ─ Quick check: principles */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Quick check", "Which principle is most at stake?", "Discuss in pairs for two minutes. Answers are in the speaker notes.");
  const qs = [["A", "A chatbot answers customers without anyone checking, and nobody told them it's AI."], ["B", "Copilot surfaces a salary spreadsheet shared with the whole company by mistake."], ["C", "An AI tool ranks employees for the annual performance review."], ["D", "A report generator gets figures wrong and nobody notices for a month."]];
  qs.forEach((q, i) => {
    const x = M + (i % 2) * 6.15, y = 2.4 + Math.floor(i / 2) * 2.1;
    card(s, x, y, 5.95, 1.85);
    T(s, q[0], { x: x + 0.3, y: y + 0.25, w: 0.8, h: 0.9, fontSize: 40, bold: true, color: RED });
    T(s, q[1], { x: x + 1.2, y: y + 0.3, w: 4.5, h: 1.4, fontSize: 16, color: BLACK });
  });
  foot(s);
  s.addNotes("Answers. A: Transparency, with accountability close behind; customers should know AI is involved and a person should check. It's also Tier 3 in our process because output reaches customers unchecked. B: Privacy and security. The fix is the sharing, not Copilot. C: Fairness, and it's a sensitive use because it affects people's pay and careers, so Tier 3 with a person making every decision. D: Reliability and safety; monitoring and a pass mark would have caught it. Several principles usually apply; the point is to get people asking the questions.");

  /* ── MODULE 3 ── */
  section("03", "Using AI safely every day", "Approved tools, careful sharing, and checking before anything leaves your hands", "Module 3. This is the everyday practice module. These habits apply every time you use AI.");

  /* 20 ─ traffic light */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Every day", "What's safe to use with AI", "Our AI policy is the final word. These are the common-sense basics.");
  const tl = [[BLACK, "check", "Go ahead", ["General business information in approved tools", "Your own notes, drafts and documents", "Public information"]],
    [GREY, "warn", "Take care", ["Personal data about customers or employees", "Confidential or labelled documents", "Only in approved tools, and only the fields you need"]],
    [RED, "xmark", "Don't", ["Company data in personal or unapproved AI tools", "Passwords, keys or payment card data", "Regulated or NDA data without written approval"]]];
  tl.forEach((c, i) => {
    const x = M + i * 4.1;
    card(s, x, 2.4, 3.85, 4.2, i === 2 ? TINT : LIGHT);
    circleIcon(s, c[1], x + 0.3, 2.65, 0.8, c[0]);
    T(s, c[2], { x: x + 1.3, y: 2.78, w: 2.4, h: 0.5, fontSize: 22, bold: true, color: BLACK });
    s.addText(bullets(c[3]), { x: x + 0.3, y: 3.75, w: 3.3, h: 2.7, fontFace: F, fontSize: 15, color: INK, isTextBox: true, valign: "top" });
  });
  foot(s);
  s.addNotes("The traffic light is the simplest way to remember this. Most everyday work is green. Personal and confidential data is amber: fine in approved tools like Microsoft 365 Copilot, but only share what's needed. Red is never: company data in personal accounts or public chatbots, secrets, and regulated data without written approval. Tell people exactly where the AI policy lives and who to ask. Adjust this slide if our policy differs.");

  /* 21 ─ Copilot sees what you can see */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Every day", "Copilot sees what you can see, so share on purpose");
  s.addText(rich([["It respects your permissions. ", "Copilot only uses content you can already open."], ["But it finds things fast. ", "A folder shared with everyone by mistake can show up in anyone's answer."], ["Sensitivity labels matter. ", "Label confidential files. Copilot respects labels, and content it creates from a labelled file picks up the label."], ["Check the references. ", "If Copilot cites something you didn't expect to see, tell the owner."]], 16),
    { x: M, y: 1.9, w: 6.2, h: 4.6, fontFace: F, isTextBox: true, valign: "top" });
  card(s, 7.2, 1.9, 5.53, 2.15, TINT);
  T(s, "RISKY", { x: 7.45, y: 2.05, w: 2, h: 0.3, fontSize: 11, bold: true, color: RED, charSpacing: 2 });
  T(s, "Salary review spreadsheet shared with “People in your organization” so two managers could open it.", { x: 7.45, y: 2.4, w: 5.0, h: 1.0, fontSize: 15, color: BLACK });
  T(s, "Now it can appear in anyone's Copilot answer about pay.", { x: 7.45, y: 3.45, w: 5.0, h: 0.5, fontSize: 13, italic: true, color: INK });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 4.3, w: 5.53, h: 2.15, fill: { color: WHITE }, line: { color: BLACK, width: 2 } });
  T(s, "SAFE", { x: 7.45, y: 4.45, w: 2, h: 0.3, fontSize: 11, bold: true, color: BLACK, charSpacing: 2 });
  T(s, "Shared with the two managers by name, with the Confidential sensitivity label applied.", { x: 7.45, y: 4.8, w: 5.0, h: 1.0, fontSize: 15, color: BLACK });
  T(s, "They can open it. Nobody else's Copilot will surface it.", { x: 7.45, y: 5.85, w: 5.0, h: 0.5, fontSize: 13, italic: true, color: INK });
  foot(s);
  s.addNotes("This is the most practical slide for a Microsoft 365 company. Copilot doesn't create new access, but it makes existing over-sharing visible very quickly. The fix is good sharing habits and sensitivity labels, which are part of Microsoft Purview. Ask everyone to check the sharing settings on the three folders or sites they use most this week. Confirm with IT which sensitivity labels we use before presenting.");

  /* 22 ─ Check before you send */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Every day", "Check it before it leaves your hands", "AI writes fluently even when it's wrong. Your name goes on what you send.");
  const passes = [["search", "Facts", "Numbers, names, dates and quotes match the source. These are the most common errors."], ["hand", "Promises", "Did it commit us to a date, a refund or a feature nobody agreed to?"], ["comments", "Tone", "Cut the over-apologising and padding. Would you say it out loud?"], ["layers", "Gaps", "Ask it: “What did you leave out?” Summaries quietly drop the awkward bit."]];
  passes.forEach((p, i) => {
    const y = 2.35 + i * 1.05;
    circleIcon(s, p[0], M, y, 0.75, i === 1 ? RED : BLACK);
    T(s, p[1], { x: M + 1.0, y: y + 0.05, w: 2.2, h: 0.4, fontSize: 19, bold: true, color: BLACK });
    T(s, p[2], { x: M + 3.1, y: y + 0.08, w: 9.0, h: 0.7, fontSize: 16, color: INK });
  });
  T(s, "Be most careful where you know least. If you couldn't spot a wrong answer, ask someone who could.", { x: M, y: 6.6, w: W - 2 * M, h: 0.4, fontSize: 14, italic: true, color: GREY });
  foot(s);
  s.addNotes("Four quick passes: facts, promises, tone, gaps. Together they take about two minutes. The promises pass is the one people skip, and it's where the real incidents come from: an AI-drafted email that promised a credit or a delivery date nobody approved. This is accountability and reliability in practice.");

  /* 23 ─ When it's a project */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Every day", "Personal use, or a project?", "Most AI use is personal productivity and needs no approval. Some needs a project.");
  card(s, M, 2.35, 5.9, 4.25, LIGHT);
  T(s, "Personal use: just do it well", { x: M + 0.3, y: 2.55, w: 5.3, h: 0.5, fontSize: 20, bold: true, color: BLACK });
  s.addText(bullets(["You're drafting, summarising or rewriting your own work", "A person reads it before it goes anywhere", "It uses data the tool is approved for", "Nobody else depends on it running"]), { x: M + 0.3, y: 3.2, w: 5.3, h: 3.2, fontFace: F, fontSize: 15, color: INK, isTextBox: true, valign: "top" });
  card(s, 6.83, 2.35, 5.9, 4.25, TINT);
  T(s, "Start a project if any is true", { x: 7.13, y: 2.55, w: 5.3, h: 0.5, fontSize: 20, bold: true, color: RED });
  s.addText(bullets(["Output reaches customers or the public", "It affects decisions about people", "It uses personal, confidential or regulated data at scale", "It acts in other systems automatically", "It needs a new vendor, model or tool", "A team or process will depend on it"]), { x: 7.13, y: 3.2, w: 5.3, h: 3.2, fontFace: F, fontSize: 15, color: INK, isTextBox: true, valign: "top" });
  foot(s);
  s.addNotes("This slide is the bridge to module 4. Personal productivity, meaning your own drafts, summaries and rewrites that you check, doesn't need approval. But the moment AI output reaches customers, affects people, uses sensitive data at scale, acts automatically, or becomes something a team depends on, it's a project. Start it on the Projects page of the AI portal.");

  /* ── MODULE 4 ── */
  section("04", "How we govern AI projects", "Following the Govern AI steps in Microsoft's Cloud Adoption Framework", "Module 4. Governance isn't there to stop things. It's how we say yes to AI projects safely and consistently.");

  /* 25 ─ CAF four steps */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Governance", "Microsoft's four steps for governing AI", "From the Govern AI guidance in Microsoft's Cloud Adoption Framework, and how we apply each one.");
  const caf = [["search", "Assess", "Understand each AI use and its risks, using the six principles.", "Intake, risk screen with sensitive uses, Responsible AI assessment"],
    ["book", "Document", "Write down the policies that address those risks.", "Risk tiers, required paperwork, approval authority, training"],
    ["gavel", "Enforce", "Apply the policies, automated where possible.", "Stage gates, board-only independent approvals, Purview labels"],
    ["chart", "Monitor", "Keep checking risk and results once it's running.", "Quarterly or yearly risk reviews, benefits tracking, post-launch review"]];
  caf.forEach((c, i) => {
    const x = M + i * 3.1;
    circleIcon(s, c[0], x, 2.35, 0.9, i % 2 ? BLACK : RED);
    T(s, (i + 1) + ". " + c[1], { x, y: 3.4, w: 2.8, h: 0.5, fontSize: 22, bold: true, color: BLACK });
    T(s, c[2], { x, y: 3.95, w: 2.8, h: 1.0, fontSize: 14, color: INK });
    card(s, x, 5.05, 2.85, 1.5, LIGHT);
    T(s, "HOW WE DO IT", { x: x + 0.2, y: 5.18, w: 2.5, h: 0.3, fontSize: 10, bold: true, color: RED, charSpacing: 1 });
    T(s, c[3], { x: x + 0.2, y: 5.48, w: 2.5, h: 1.0, fontSize: 13, color: BLACK });
    if (i < 3) T(s, "→", { x: x + 2.65, y: 2.5, w: 0.5, h: 0.6, fontSize: 28, color: GREY, align: "center" });
  });
  foot(s);
  s.addNotes("Microsoft's Cloud Adoption Framework sets out four steps for governing AI: assess risks, document policies, enforce them, and monitor. Microsoft's guidance uses the six principles as the lens for assessment and recommends quarterly risk reviews for high-risk AI and annual reviews for lower-risk systems. We've built each step into the AI portal so the process is the same for every project.");

  /* 26 ─ Lifecycle */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Governance", "Every project follows the same seven stages", "A project can't move on until the paperwork for its stage is done.");
  const stages = [["Idea", "Start it in the portal"], ["Assessed", "Idea check and risk tier done"], ["Awaiting approval", "Exec brief submitted"], ["Approved", "Decision recorded by the board"], ["Pilot", "Pass mark set before it starts"], ["Live", "Monitored and reviewed"], ["Closed", "Post-launch review done"]];
  const sw = (W - 2 * M) / 7;
  s.addShape(pres.shapes.LINE, { x: M + sw / 2, y: 2.9, w: sw * 6, h: 0, line: { color: LINE, width: 3 } });
  stages.forEach((st, i) => {
    const x = M + i * sw;
    s.addShape(pres.shapes.OVAL, { x: x + sw / 2 - 0.3, y: 2.6, w: 0.6, h: 0.6, fill: { color: i === 3 || i === 5 ? RED : BLACK }, line: { color: WHITE, width: 2 } });
    T(s, String(i + 1), { x: x + sw / 2 - 0.3, y: 2.7, w: 0.6, h: 0.4, fontSize: 16, bold: true, color: WHITE, align: "center" });
    T(s, st[0], { x: x + 0.05, y: 3.45, w: sw - 0.1, h: 0.7, fontSize: 16, bold: true, color: BLACK, align: "center" });
    T(s, st[1], { x: x + 0.1, y: 4.15, w: sw - 0.2, h: 1.0, fontSize: 12.5, color: INK, align: "center" });
  });
  card(s, M, 5.45, W - 2 * M, 1.15, LIGHT);
  s.addText(rich([["Gates, not suggestions. ", "The portal won't move a project to the next stage until the required paperwork is complete. Only the AI review board can record an approval, and never on a project they started."]], 15), { x: M + 0.3, y: 5.62, w: W - 2 * M - 0.6, h: 0.9, fontFace: F, isTextBox: true, valign: "top" });
  foot(s);
  s.addNotes("Seven stages from idea to closed. The two red ones are the checkpoints leadership cares about most: approval, and going live. The gates are enforced in the portal, which is the 'enforce' step from Microsoft's framework. The independent-approver rule comes from Microsoft's guidance that reviews should be done by people who aren't involved in the work.");

  /* 27 ─ Risk tiers */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Governance", "Three risk tiers decide how much review a project needs");
  const tiers = [[LIGHT, BLACK, "Tier 1", "Low risk", "Internal use, general data, and a person checks the output.", "Team lead and AI governance lead", "Every year"],
    ["3D3D3D", WHITE, "Tier 2", "Medium risk", "Personal or confidential data, automated actions, finance processes, or a new vendor.", "AI review board", "Every year"],
    [RED, WHITE, "Tier 3", "High risk", "A Microsoft sensitive use, or output reaching customers without a person checking it.", "AI review board with Legal and Security", "Every quarter"]];
  tiers.forEach((t, i) => {
    const x = M + i * 4.1;
    card(s, x, 1.85, 3.85, 4.75, t[0]);
    T(s, t[2], { x: x + 0.3, y: 2.05, w: 3.2, h: 0.6, fontSize: 30, bold: true, color: t[1] });
    T(s, t[3], { x: x + 0.3, y: 2.7, w: 3.2, h: 0.4, fontSize: 18, color: t[1] });
    T(s, t[4], { x: x + 0.3, y: 3.25, w: 3.25, h: 1.2, fontSize: 14, color: t[1] });
    T(s, "APPROVED BY", { x: x + 0.3, y: 4.55, w: 3.2, h: 0.3, fontSize: 10, bold: true, color: t[1], charSpacing: 1 });
    T(s, t[5], { x: x + 0.3, y: 4.85, w: 3.25, h: 0.6, fontSize: 14, bold: true, color: t[1] });
    T(s, "RISK REVIEW ONCE LIVE", { x: x + 0.3, y: 5.55, w: 3.2, h: 0.3, fontSize: 10, bold: true, color: t[1], charSpacing: 1 });
    T(s, t[6], { x: x + 0.3, y: 5.85, w: 3.2, h: 0.4, fontSize: 14, bold: true, color: t[1] });
  });
  T(s, "The highest “yes” in the risk screen sets the tier.", { x: M, y: 6.75, w: 8, h: 0.3, fontSize: 13, italic: true, color: GREY });
  foot(s);
  s.addNotes("The tier is set by a nine-question risk screen in the portal. The first three questions are Microsoft's sensitive uses; any yes makes it Tier 3. Tier 3 projects get a risk review every quarter once live, in line with Microsoft's guidance for high-risk AI. Everything else gets a yearly review. Most everyday projects will be Tier 1 or 2.");

  /* 28 ─ Paperwork matrix */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Governance", "The paperwork each tier needs", "All of it lives in the project's page in the AI portal, and exports as one governance pack PDF.");
  const Y = "●", N = "";
  const art = [["Paperwork", "What it answers", "T1", "T2", "T3"],
    ["Intake and idea check", "Is this a job for AI at all?", Y, Y, Y], ["Risk tier", "How risky is it, using the sensitive uses and screening?", Y, Y, Y],
    ["Exec brief", "What's the ask, the problem, the plan and the numbers?", Y, Y, Y], ["Approval record", "Who decided, when, and on what conditions?", Y, Y, Y],
    ["Pilot plan and result", "What pass mark did we set, and did we hit it?", N, Y, Y], ["Responsible AI assessment", "How does it meet each of the six principles?", N, Y, Y],
    ["Privacy and legal sign-off", "Have Privacy and Legal reviewed it before launch?", N, N, Y], ["Benefits tracking", "What did it actually deliver, quarter by quarter?", Y, Y, Y],
    ["Post-launch review", "What worked, what didn't, keep or stop?", Y, Y, Y]];
  s.addTable(art.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 0, align: j >= 2 ? "center" : "left", color: i === 0 ? WHITE : (j >= 2 ? RED : (j === 0 ? BLACK : INK)), fontSize: j >= 2 && i ? 18 : 13.5, fill: { color: i === 0 ? BLACK : (i % 2 ? WHITE : LIGHT) } } }))),
    { x: M, y: 2.3, w: W - 2 * M, colW: [3.4, 6.53, 0.7, 0.7, 0.8], fontFace: F, border: { type: "solid", color: LINE, pt: 0.75 }, rowH: 0.46, valign: "middle", margin: [0.04, 0.1, 0.04, 0.1] });
  foot(s);
  s.addNotes("This is the full list. Tier 1 projects need the basics: intake, risk tier, brief, approval, benefits and a review. Tier 2 adds a pilot with a pass mark and the Responsible AI assessment. Tier 3 adds Privacy and Legal sign-off before going live. The governance pack PDF bundles all of it with an audit trail, which is what an auditor or the board will ask for.");

  /* 29 ─ RAI assessment */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Governance", "The Responsible AI assessment", "One answer per principle. Questions adapted from Microsoft's Cloud Adoption Framework. Required for Tier 2 and 3.");
  const ra = [["Fairness", "How could it lead to unequal treatment or bias?", "Who could be treated differently, and how you'll check"], ["Reliability and safety", "Where could it fail or give unreliable results?", "Testing, monitoring and how to switch it off"],
    ["Privacy and security", "How might it expose sensitive data or create a security gap?", "What data it touches, where it goes, who approved the tool"], ["Inclusiveness", "Could some groups be left out or disadvantaged?", "Who uses it or is affected, and how it works for them"],
    ["Transparency", "What would be hard for people to understand?", "Who knows AI is involved and how its limits are explained"], ["Accountability", "Where could responsibility be unclear?", "The named owner, reviewer and complaints route"]];
  s.addTable([["Principle", "Microsoft's question", "What to write"], ...ra].map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 0, color: i === 0 ? WHITE : (j === 0 ? BLACK : INK), fill: { color: i === 0 ? RED : (i % 2 ? WHITE : LIGHT) } } }))),
    { x: M, y: 2.35, w: W - 2 * M, colW: [2.8, 4.8, 4.53], fontFace: F, fontSize: 14, border: { type: "solid", color: LINE, pt: 0.75 }, rowH: 0.58, valign: "middle", margin: [0.04, 0.1, 0.04, 0.1] });
  foot(s);
  s.addNotes("The Responsible AI assessment is the heart of the 'assess' step. It's six short answers, one per principle. Keep answers concrete: names, numbers, dates. 'We'll monitor it' is not an answer; 'the support ops lead reviews the weekly edit rate and error log' is.");

  /* 30 ─ Roles */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Governance", "Who does what");
  const roles = [["users", "Everyone", "Uses approved tools, checks outputs, logs wins, and flags anything that feels wrong."], ["user", "Project owner", "Runs the project, completes the paperwork, tracks benefits, and owns the outcome."],
    ["star", "Executive sponsor", "Backs the project, removes blockers, and is accountable for its business case."], ["gavel", "AI review board", "Records approval decisions. Never approves a project its members started."],
    ["lock", "Legal, Privacy, Security", "Sign off Tier 3 projects, review new vendors, and advise on sensitive data."], ["gear", "AI governance lead", "Keeps the process running, approves Tier 1 with team leads, and reports to leadership."]];
  roles.forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = M + col * 6.15, y = 1.9 + row * 1.6;
    circleIcon(s, r[0], x, y, 0.8, col ? BLACK : RED);
    T(s, r[1], { x: x + 1.05, y: y + 0.02, w: 4.9, h: 0.4, fontSize: 18, bold: true, color: BLACK });
    T(s, r[2], { x: x + 1.05, y: y + 0.45, w: 4.9, h: 0.9, fontSize: 14, color: INK });
  });
  foot(s);
  s.addNotes("Accountability in practice. Everyone has a role, including people who never start a project. Confirm the names for the AI review board and the AI governance lead before you present, and add them to this slide.");

  /* 31 ─ Monitor */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Governance", "Going live isn't the end: monitor it", "Microsoft's guidance: keep evaluating risk, measure consistently, and report what you find.");
  const mon = [["calendar", "Scheduled risk reviews", "Every quarter for Tier 3, every year otherwise. Overdue reviews show in red on the portal."], ["chart", "Benefits tracking", "Planned against actual, every quarter, with the evidence for each number."],
    ["search", "Monitoring", "The measures named in the Responsible AI assessment, reviewed by the named person."], ["flag", "Switch-off plan", "Who can turn it off, and how fast, if something goes wrong."], ["clip", "Post-launch review", "About three months in: what worked, what didn't, and whether to scale, change or stop."]];
  mon.forEach((m, i) => {
    const y = 2.3 + i * 0.9;
    circleIcon(s, m[0], M, y, 0.65, i === 0 ? RED : BLACK);
    T(s, m[1], { x: M + 0.9, y: y + 0.12, w: 3.6, h: 0.4, fontSize: 17, bold: true, color: BLACK });
    T(s, m[2], { x: 4.9, y: y + 0.12, w: 7.8, h: 0.7, fontSize: 15, color: INK });
  });
  foot(s);
  s.addNotes("This is the 'monitor' step. The most common failure in AI governance is treating approval as the finish line. Models, data and how people use a tool all change over time. Scheduled reviews and benefits tracking keep it honest.");

  /* ── MODULE 5 ── */
  section("05", "Proving the value", "Honest numbers that stand up in front of leadership", "Module 5. If we can't show AI is worth it, we lose the budget and the goodwill. If we overstate it, we lose trust. This module is about getting that balance right.");

  /* 33 ─ Hours ≠ money */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Value", "Hours saved are not money saved");
  T(s, "Time freed up only becomes value when it goes somewhere.", { x: M, y: 1.75, w: 7, h: 0.5, fontSize: 18, color: INK });
  const dest = [["Counts", ["A hire we no longer need", "Overtime or contractors that stop", "Named work people move to"]], ["Doesn't count", ["Time that just gets absorbed", "“We'll find something for them to do”", "Savings nobody can point to"]]];
  dest.forEach((d, i) => {
    const x = M + i * 3.55;
    card(s, x, 2.5, 3.35, 3.2, i ? TINT : LIGHT);
    T(s, d[0], { x: x + 0.3, y: 2.7, w: 2.8, h: 0.5, fontSize: 20, bold: true, color: i ? RED : BLACK });
    s.addText(bullets(d[1]), { x: x + 0.3, y: 3.35, w: 2.85, h: 2.2, fontFace: F, fontSize: 14, color: INK, isTextBox: true, valign: "top" });
  });
  card(s, 8.0, 2.5, 4.73, 3.2, BLACK);
  T(s, "Confidence haircut", { x: 8.3, y: 2.7, w: 4.2, h: 0.5, fontSize: 20, bold: true, color: WHITE });
  const hc = [["High", "measured it", "100%"], ["Medium", "trial or good estimate", "75%"], ["Low", "educated guess", "50%"]];
  hc.forEach((h, i) => {
    const y = 3.4 + i * 0.7;
    T(s, h[2], { x: 8.3, y, w: 1.3, h: 0.5, fontSize: 26, bold: true, color: i === 0 ? WHITE : (i === 1 ? "FFB3C1" : RED) });
    T(s, h[0] + ": " + h[1], { x: 9.7, y: y + 0.1, w: 2.9, h: 0.4, fontSize: 14, color: WHITE });
  });
  T(s, "A benefit you're 50/50 on is worth about half of itself today. Costs never get a haircut.", { x: M, y: 6.0, w: W - 2 * M, h: 0.5, fontSize: 15, italic: true, color: GREY });
  foot(s);
  s.addNotes("Two ideas that make our numbers credible. First, time saved only counts once someone says where the time goes: a hire we don't need, overtime that stops, or named work people move to. Second, the confidence haircut: an uncertain benefit is counted at a fraction of its value, the way you'd value a raffle ticket at its odds. Costs are never discounted, because we'll pay them either way. Leaders trust numbers that visibly under-promise.");

  /* 34 ─ How we measure (chart) */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Value", "Three numbers leadership will see every quarter");
  const kpi = [["Adoption", "People trained and active, by team"], ["Time back", "Wins people log, counted at 50% because self-reports run high"], ["Delivered value", "Project benefits against plan, with evidence"]];
  kpi.forEach((k, i) => {
    const y = 1.95 + i * 1.5;
    T(s, String(i + 1), { x: M, y, w: 0.7, h: 0.9, fontSize: 44, bold: true, color: RED });
    T(s, k[0], { x: M + 0.85, y: y + 0.05, w: 4.3, h: 0.45, fontSize: 20, bold: true, color: BLACK });
    T(s, k[1], { x: M + 0.85, y: y + 0.55, w: 4.3, h: 0.8, fontSize: 14, color: INK });
  });
  s.addChart(pres.charts.BAR, [{ name: "Planned", labels: ["Support reply drafts", "Contract review", "Incident summaries"], values: [158, 60, 40] }, { name: "Delivered", labels: ["Support reply drafts", "Contract review", "Incident summaries"], values: [172, 41, 38] }],
    { x: 6.0, y: 1.85, w: 6.73, h: 4.6, barDir: "bar", barGrouping: "clustered", chartColors: [BLACK, RED], showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 12,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 11, dataLabelFontFace: F, dataLabelColor: BLACK, dataLabelFormatCode: '"$"#,##0"k"',
      catAxisLabelFontFace: F, catAxisLabelFontSize: 12, catAxisLabelColor: INK, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
      showTitle: true, title: "Planned vs delivered, $k to date (illustrative)", titleFontFace: F, titleFontSize: 14, titleColor: BLACK });
  foot(s);
  s.addNotes("These are the three numbers on the Value page of the AI portal and in the quarterly value report. The chart is illustrative, showing how planned and delivered benefits are compared project by project. Delivered value, backed by evidence, is the number that matters most, because it's real. Hours back shows scale, but it isn't cash.");

  /* 35 ─ Knowledge check */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Knowledge check", "Five questions. Answers in the speaker notes.");
  const kc = ["You need the exact total of a 400-row column. What do you use?", "Copilot shows you a document you weren't meant to see. What most likely happened, and what do you do?", "Name Microsoft's three sensitive uses.", "A pilot has finished. When should its pass mark have been set?", "A project saves 2,000 hours a year, but nobody has said where the time goes. How much of that counts?"];
  kc.forEach((q, i) => {
    const y = 1.9 + i * 0.95;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.6, h: 0.6, fill: { color: i % 2 ? BLACK : RED }, line: { color: i % 2 ? BLACK : RED } });
    T(s, String(i + 1), { x: M, y: y + 0.1, w: 0.6, h: 0.4, fontSize: 18, bold: true, color: WHITE, align: "center" });
    T(s, q, { x: M + 0.9, y: y + 0.08, w: 11.3, h: 0.7, fontSize: 18, color: BLACK });
  });
  foot(s);
  s.addNotes("Answers. 1: Excel, not AI. AI can explain or write the formula. 2: The document was shared more widely than intended and Copilot found it, because Copilot only uses what you can already open. Tell the owner or IT so they can fix the sharing. 3: Consequential impact on someone's legal position or life opportunities; risk of physical or psychological injury; threat to human rights. 4: Before the pilot started, so it can't be moved to make the pilot pass. 5: None of it, until someone names where the time goes: a hire not needed, overtime stopped, or named work.");

  /* 36 ─ First 30 days */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "What next", "Your first 30 days", "Everything below is in the CONA AI Portal.");
  const days = [["Week 1", "graduation", "Finish the eight lessons", "About 40 minutes. Takes you to Practitioner."], ["Week 2", "route", "Pick one weekly task", "Use a prompt from the library on it every week."], ["Week 3", "chart", "Log your wins", "Twenty seconds each. It's how we prove this works."], ["Week 4", "share", "Share what works", "Post a prompt, or run the 30-minute team session."]];
  days.forEach((d, i) => {
    const x = M + i * 3.1;
    card(s, x, 2.3, 2.85, 3.9);
    T(s, d[0].toUpperCase(), { x: x + 0.3, y: 2.5, w: 2.3, h: 0.3, fontSize: 12, bold: true, color: RED, charSpacing: 2 });
    circleIcon(s, d[1], x + 0.3, 2.95, 0.8, BLACK);
    T(s, d[2], { x: x + 0.3, y: 3.95, w: 2.35, h: 0.8, fontSize: 18, bold: true, color: BLACK });
    T(s, d[3], { x: x + 0.3, y: 4.8, w: 2.35, h: 1.2, fontSize: 14, color: INK });
  });
  T(s, "Levels: Starter → Practitioner → Regular → Champion", { x: M, y: 6.5, w: 9, h: 0.35, fontSize: 14, bold: true, color: BLACK });
  foot(s);
  s.addNotes("Close with a concrete plan. Share the portal link in the chat now. Encourage managers to run the 30-minute team session within the month. Champions are the people who help others. We want at least one in every team.");

  /* 37 ─ Resources */
  s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "What next", "Where to go for help");
  const res = [["CONA AI Portal", "Lessons, prompts, projects and the value dashboard.", "[Add the portal link]"], ["AI review board", "Questions about projects, tiers and approvals.", "[Add a name or Teams channel]"], ["IT and Security", "Approved tools, sharing settings and sensitivity labels.", "[Add the service desk link]"],
    ["Microsoft's Responsible AI principles", "The six principles and Microsoft's approach.", "microsoft.com/ai/principles-and-approach"], ["Cloud Adoption Framework: Govern AI", "Microsoft's four steps for governing AI.", "learn.microsoft.com/azure/cloud-adoption-framework/ai/govern"], ["Microsoft Responsible AI Standard v2", "Where the sensitive uses and impact assessment come from.", "Search: Microsoft Responsible AI Standard General Requirements"]];
  res.forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = M + col * 6.15, y = 1.9 + row * 1.6;
    card(s, x, y, 5.95, 1.4, row === 0 ? TINT : LIGHT);
    T(s, r[0], { x: x + 0.25, y: y + 0.15, w: 5.5, h: 0.4, fontSize: 17, bold: true, color: BLACK });
    T(s, r[1], { x: x + 0.25, y: y + 0.55, w: 5.5, h: 0.4, fontSize: 13, color: INK });
    T(s, r[2], { x: x + 0.25, y: y + 0.93, w: 5.5, h: 0.35, fontSize: 12, color: row === 0 ? RED : GREY, bold: row === 0 });
  });
  foot(s);
  s.addNotes("Fill in the three red placeholders before presenting: the portal link, the review board contact, and the IT service desk link. The Microsoft sources are public and worth sharing with anyone who wants to go deeper.");

  /* 38 ─ Close */
  s = pres.addSlide(); s.background = { color: RED };
  T(s, "Use it well.\nCheck it.\nOwn it.", { x: M, y: 1.3, w: 8, h: 3.6, fontSize: 60, bold: true, color: WHITE });
  T(s, "Questions?", { x: M, y: 5.2, w: 6, h: 0.7, fontSize: 28, color: WHITE });
  s.addShape(pres.shapes.OVAL, { x: 9.9, y: 1.8, w: 2.6, h: 2.6, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ data: IC.user_red, x: 10.55, y: 2.45, w: 1.3, h: 1.3 });
  foot(s, true);
  s.addNotes("Three words to leave them with. Use it well: brief it like a colleague and use it on real work. Check it: facts, promises, tone, gaps. Own it: you're accountable for what you send, and every AI project has a named owner. Then take questions.");

  await pres.writeFile({ fileName: OUT });
  console.log("wrote", OUT, "slides:", n);
}
build().catch(e => { console.error(e); process.exit(1); });
