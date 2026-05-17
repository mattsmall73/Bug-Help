# Help!

A web app for Izzie with two modes:

- **Help!** (study guide) — drop in a worksheet or essay brief, get back a sequenced study guide with timers, breaks, and a clear stopping point.
- **Exam Practice** — upload a past paper, spec, and mark scheme. Sit the paper with a timer. Submit, and get back a marked paper with coaching feedback in the Help! voice.

The home page at `/` is a chooser. The two modes share the brand, the engine, the aesthetic, and the voice. They are different jobs.

---

## What you need to do once

You don't need to be a developer. You just need to do these in order.

### 1. Get an Anthropic API key

You said you already have one. It looks like `sk-ant-...`. Keep it handy.

If you need a new one: <https://console.anthropic.com> → API Keys → Create Key.

### 2. Push this repo to GitHub

The whole app is in this branch. Push it to your `mattsmall73/Bug-Help` GitHub repo if it isn't there already.

### 3. Deploy to Vercel

1. Go to <https://vercel.com> and sign in with your GitHub account.
2. **Add New → Project**, pick `Bug-Help`, **Import**.
3. Vercel auto-detects Next.js. Don't change build settings.
4. Before clicking **Deploy**, expand **Environment Variables** and add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your `sk-ant-...` key
5. Click **Deploy**.

The Help! (study guide) mode works after this step.

### 4. Enable Fluid Compute (recommended)

Vercel's default 4.5MB request body cap will bite some flows. Exam Practice
extracts text in the browser before uploading (so a 10MB PDF is fine), but
images go via a tiny transcribe endpoint and a >4MB image will still hit the
cap. Enabling Fluid Compute on Pro raises the per-request limit to ~100MB
and is one toggle.

1. In Vercel, open the project → **Settings** → **Functions**.
2. Toggle **Fluid Compute** on.
3. Redeploy once.

The Help! study guide mode still uses server-side file handling and will
hit the cap on big PDFs/images — same toggle helps. A future cleanup would
move that flow to client-side extraction too.

### 5. Provision Neon Postgres (for Exam Practice)

Exam Practice needs a database. The Help! study guide mode does not — it uses your browser's localStorage and is unaffected by anything in this step.

1. In Vercel, open the deployed project.
2. **Storage** tab → **Create Database** → **Neon Postgres**.
3. Region: London (`lhr1`).
4. Plan: Free.
5. **Custom env prefix:** set this to `POSTGRES_` (capital letters, trailing underscore). The integration will create `POSTGRES_URL` and friends.
6. Click through to create. Vercel wires the env vars into the project automatically.
7. Redeploy the project once (Vercel may do this for you).

Then run the schema once against the new database:

- In the Vercel Storage tab, open the Neon database → **Open in Neon** → SQL editor.
- Paste the contents of `schema.sql` from this repo and run it.

That's it. The Exam Practice flow is now live.

---

## Running it on your own laptop (optional)

```bash
npm install
cp .env.example .env.local
# paste your real ANTHROPIC_API_KEY
# paste the POSTGRES_URL from your Vercel Neon integration (for Exam Practice)
npm run dev
```

Open <http://localhost:3000>.

---

## How it works (just enough to know what's where)

### Top-level

- `app/page.tsx` — home chooser. Two cards: Help! and Exam Practice.
- `app/layout.tsx` — site frame, fonts, title.
- `app/globals.css` — shared styling (warm-paper look).

### Help! (study guide)

- `app/help/page.tsx` — upload + paste + duration. History is saved in localStorage, not on a server.
- `app/api/generate/route.ts` — sends the work to Claude with the system prompt and returns generated HTML.
- `lib/systemPrompt.ts` — the long instruction prompt for the study guide.

### Exam Practice

- `app/exam/page.tsx` — three upload slots (spec, paper, mark scheme), total time, optional name. Extracts text in the browser before submitting so big PDFs never hit the upload cap.
- `app/exam/[id]/page.tsx` + `AnswerClient.tsx` — the answering screen. Total-paper timer, autosave, submit.
- `app/exam/[id]/results/page.tsx` + `ResultsClient.tsx` — the marked-paper artefact (downloadable, retake button).
- `lib/clientExtract.ts` — client-side text extraction. PDFs via pdfjs-dist, Word via mammoth's browser build, plain text via FileReader, images via the transcribe endpoint.
- `app/api/exam/start/route.ts` — takes JSON `{spec_text, paper_text, mark_scheme_text, ...}`, parses the paper structure, creates paper + session rows.
- `app/api/exam/transcribe/route.ts` — single-image transcription via Claude (one file at a time, stays small).
- `app/api/exam/autosave/route.ts` — POST answers and timer state.
- `app/api/exam/submit/route.ts` — run marking, generate results HTML, store.
- `app/api/exam/retake/route.ts` — start a new session from an existing paper.
- `lib/parsingPrompt.ts` — system prompt for parsing the paper into structured JSON.
- `lib/markingPrompt.ts` — system prompt for marking the paper. The voice is calibrated; treat changes as deliberate prompt-iteration cycles.
- `lib/resultsHtml.ts` — server-side template for the results artefact.
- `lib/db.ts` — Neon client and query helpers.
- `schema.sql` — database schema. Run once after provisioning.

### Shared

- `lib/extractText.ts` — extracts plain text from PDFs, images, Word, or text uploads. Used by Exam Practice for parsing/marking; the Help! flow uses its own extraction inline.

---

## What it costs

Each study guide is a few cents in Anthropic credits.

Each exam practice (parse + mark) is more — extended-response papers can run 20-30k tokens through Opus. Expect 30-60p per paper at current pricing. Vercel and Neon are free at this scale.

---

## Things you might want to change later

- **Different model** — `app/api/generate/route.ts` and `app/api/exam/start/route.ts`, `app/api/exam/submit/route.ts` use `claude-opus-4-7`. Swap to `claude-sonnet-4-6` to cut costs roughly 5x.
- **Tone / format of the study guides** — `lib/systemPrompt.ts`.
- **Tone of the marking** — `lib/markingPrompt.ts`. The closing-line tier system is the calibrated part; change deliberately, not casually.
