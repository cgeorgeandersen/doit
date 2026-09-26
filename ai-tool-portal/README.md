# AI Tool Portal

A single-file web app (`index.html`) with three tools for deciding where AI is worth using:

1. **Pilot check.** Scores one task on feasibility, fit and value, plus a "rule-shaped" signal. It returns one of six verdicts: pilot, automate conventionally, leave manual, blocked, needs groundwork, or reshape. A pilot or automate verdict can start a business case pre-filled with the hours estimate.
2. **Business case desk.** Five-year costs, benefits and risks on a common basis: confidence haircut, adoption ramp, desk-wide discount rate. It produces NPV, payback, benefit/cost, safety margin and net per bottler. Freed time is counted at $0 until someone says where it goes. Exports a PDF brief, CSV, plain text, and a JSON case file that others can open.
3. **Prompt library.** 35 copyable prompts, filtered by function, time sink, experience level and free text. Each has the time it usually saves and a check for how it can mislead.

## Running it

Open `index.html` in a browser. There is no build step or server. Everything you enter is stored in the browser's `localStorage` and never sent anywhere. The only network requests are for Google Fonts and, when you export a PDF, jsPDF from cdnjs.

## Where the logic lives

| What | Look for |
| --- | --- |
| Questions, verdict copy, example cases, prompts | the first `<script>` block (`FEAS`, `FIT`, `VERDICTS`, `EXAMPLE_CASES`, `PROMPTS`) |
| Pilot scoring | `score()` |
| Five-year financial model | `model(c)` |
| PDF export | `exportPDF()` |
