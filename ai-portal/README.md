# CONA AI Portal

A single-file web app (`index.html`) for helping people use AI well at work. It has four sections:

- **Learn.** Six five-minute lessons, each with a poor-vs-good example, something to try on your own work, and a one-question check. Also a 30-minute team session plan and a one-page cheat sheet.
- **Prompt library.** 35 copyable prompts for real tasks, searchable and filterable by function. Each one lists the time it saves and what to check.
- **Idea check.** Nine questions that tell you whether a task suits an AI pilot, conventional automation, a tool we already own, or nothing yet. A pilot or automation result can start an exec brief.
- **Exec brief.** A guided form that builds a one-page brief (the ask, problem, plan, three-year numbers, timeline, risks, success measures). A built-in check flags missing numbers, buzzwords, long sentences and time savings with nowhere to go. Exports to PDF, email text or a shareable file.

Open `index.html` in a browser. There is no build step or server. Progress and briefs stay in the browser's `localStorage`. The PDF export loads jsPDF from cdnjs when first used.

Content (lessons, questions, prompts, example brief) lives in the first `<script>` blocks, so wording can be changed without touching the logic.
