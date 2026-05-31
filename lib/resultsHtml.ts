import { MarkingResults, ParsedPaper, ParsedQuestion } from "./db";

export function renderResultsHtml(input: {
  paper_title: string;
  user_name: string | null;
  practised_at: Date;
  elapsed_seconds: number;
  parsed: ParsedPaper;
  answers: Record<string, string>;
  marking: MarkingResults;
}): string {
  const {
    paper_title,
    user_name,
    practised_at,
    elapsed_seconds,
    parsed,
    answers,
    marking,
  } = input;

  const questionByNumber = new Map<string, ParsedQuestion & { section: string }>();
  for (const section of parsed.sections) {
    for (const q of section.questions) {
      questionByNumber.set(q.number, { ...q, section: section.title });
    }
  }

  const dateStr = practised_at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const elapsedStr = formatElapsed(elapsed_seconds);

  const questionsHtml = marking.questions
    .map((q) => {
      const parsedQ = questionByNumber.get(q.number);
      const questionText = parsedQ?.text ?? "";
      const answer = (answers[q.number] ?? "").trim();
      const closing = q.closing_line && q.closing_line.trim() ? q.closing_line.trim() : "";
      return `
  <article class="question">
    <header class="question-header">
      <div class="question-number">Q${escapeHtml(q.number)}</div>
      <div class="question-mark">${q.mark_awarded} / ${q.mark_available}</div>
    </header>
    ${
      questionText
        ? `<div class="question-text">${escapeHtml(questionText)}</div>`
        : ""
    }
    <div class="answer-block">
      <div class="answer-label">Your answer</div>
      <div class="answer-body">${answer ? escapeHtml(answer) : `<em class="empty">No answer given.</em>`}</div>
    </div>
    <div class="feedback">
      <p class="feedback-line worked">${escapeHtml(q.what_worked)}</p>
      <p class="feedback-line scheme">${escapeHtml(q.what_the_scheme_wanted)}</p>
      <p class="feedback-line next">${escapeHtml(q.next_step)}</p>
      ${closing ? `<p class="feedback-line closing">${escapeHtml(closing)}</p>` : ""}
    </div>
  </article>`;
    })
    .join("\n");

  const forLine = user_name ? `For ${escapeHtml(user_name)}` : "Marked paper";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(paper_title)} — results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400;1,600&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f4f1ea; --paper: #fbf9f4; --ink: #2a2622; --muted: #6b6358;
    --accent: #8b3a3a; --accent-soft: #e8dcd0; --line: #d9d2c4;
    --done: #5a7a5a; --done-soft: #e3ebe0;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: 'Inter Tight', sans-serif; font-size: 16px; line-height: 1.6; padding: 32px 16px 80px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  header.top { text-align: center; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
  .for-line { font-family: 'Fraunces', serif; font-style: italic; font-size: 14px; color: var(--accent); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 32px; margin: 0 0 8px; letter-spacing: -0.01em; }
  .meta-row { font-family: 'Fraunces', serif; font-style: italic; color: var(--muted); font-size: 15px; }
  .meta-row .dot { margin: 0 8px; opacity: 0.5; }
  .total-mark {
    background: var(--accent);
    color: var(--paper);
    border-radius: 4px;
    padding: 18px 24px;
    margin: 24px 0 32px;
    text-align: center;
  }
  .total-mark .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.85; margin-bottom: 6px; }
  .total-mark .value { font-family: 'Fraunces', serif; font-weight: 600; font-size: 36px; letter-spacing: -0.01em; }
  .summary {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 22px 24px;
    margin-bottom: 28px;
    font-size: 15px;
    line-height: 1.65;
  }
  .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: var(--accent); font-weight: 600; margin-bottom: 8px; }
  .questions-label {
    font-family: 'Fraunces', serif;
    font-style: italic;
    color: var(--muted);
    font-size: 14px;
    margin-bottom: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .question {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 22px 24px;
    margin-bottom: 18px;
  }
  .question-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed var(--line); }
  .question-number { font-family: 'Fraunces', serif; font-weight: 600; font-size: 20px; color: var(--accent); }
  .question-mark { margin-left: auto; font-family: 'Fraunces', serif; font-weight: 600; font-size: 18px; }
  .question-text { font-size: 14px; color: var(--muted); margin-bottom: 14px; white-space: pre-wrap; line-height: 1.55; }
  .answer-block { background: var(--bg); border-radius: 4px; padding: 14px 16px; margin-bottom: 14px; }
  .answer-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent); font-weight: 600; margin-bottom: 6px; }
  .answer-body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
  .answer-body .empty { color: var(--muted); }
  .feedback p { margin: 0 0 10px; font-size: 15px; line-height: 1.6; }
  .feedback p:last-child { margin-bottom: 0; }
  .feedback-line.closing { color: var(--accent); font-style: italic; font-family: 'Fraunces', serif; font-size: 16px; }
  .footer-note {
    background: var(--accent-soft);
    border-radius: 4px;
    padding: 20px 24px;
    margin-top: 28px;
    margin-bottom: 20px;
    font-size: 15px;
    line-height: 1.6;
  }
  .footer-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: var(--accent); font-weight: 600; margin-bottom: 6px; }
  @media (max-width: 480px) {
    h1 { font-size: 26px; }
    .total-mark .value { font-size: 30px; }
    .question { padding: 18px 18px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="for-line">${forLine}</div>
    <h1>${escapeHtml(paper_title)}</h1>
    <div class="meta-row">
      <span>${escapeHtml(dateStr)}</span>
      <span class="dot">·</span>
      <span>${escapeHtml(elapsedStr)} on the clock</span>
    </div>
  </header>

  <div class="total-mark">
    <div class="label">Total</div>
    <div class="value">${marking.total_mark} / ${marking.total_available}</div>
  </div>

  <div class="summary">
    <div class="summary-label">Overall</div>
    <div>${escapeHtml(marking.overall_summary)}</div>
  </div>

  <div class="questions-label">By question</div>
${questionsHtml}

  <div class="footer-note">
    <div class="footer-label">Highest-leverage next step</div>
    <div>${escapeHtml(marking.headline_next_step)}</div>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0 && m === 0) return "less than a minute";
  if (h === 0) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  if (m === 0) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${h}h ${m}m`;
}
