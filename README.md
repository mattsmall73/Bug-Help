# Study Translator

A web app that takes Izzie's messy school worksheets and turns them into structured, AuDHD-friendly study guides — with timers, checklists, scheduled breaks, and a clear "you're done" signal at the end.

She drops in a PDF, image, Word doc, or pasted text. The app sends it to Claude with a tailored system prompt and gets back a self-contained HTML study guide she can open or download.

---

## What you need to do once (about 10 minutes)

You don't need to be a developer. You just need to do three things, in order.

### 1. Get an Anthropic API key

You said you already have one. It looks like `sk-ant-...`. Keep it handy — you'll paste it into Vercel in step 3.

If you ever need a new one: go to <https://console.anthropic.com>, sign in, click **API Keys**, and **Create Key**.

### 2. Push this repo to GitHub

This branch (`claude/study-guide-translator-N2GZP`) already contains the whole app. From your laptop, push it to your `mattsmall73/Bug-Help` GitHub repo if it isn't there already. (Claude Code can do this for you — just ask.)

### 3. Deploy to Vercel

1. Go to <https://vercel.com> and sign in with your GitHub account.
2. Click **Add New → Project**.
3. Pick the `Bug-Help` repo from the list. Click **Import**.
4. Vercel will auto-detect Next.js. Don't change any build settings.
5. Before clicking **Deploy**, expand **Environment Variables** and add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your `sk-ant-...` key
6. Click **Deploy**. Wait two minutes.
7. Vercel gives you a URL like `study-translator-xyz.vercel.app`. That's the app. Bookmark it on Izzie's phone.

That's it. You don't have to redeploy unless you change the code — Vercel will redeploy automatically whenever the GitHub branch is updated.

---

## Running it on your own laptop (optional)

Useful for testing changes before pushing.

```bash
npm install
cp .env.example .env.local
# then open .env.local and paste your real key after ANTHROPIC_API_KEY=
npm run dev
```

Open <http://localhost:3000>.

---

## How it works (just enough to know what's where)

- `app/page.tsx` — the page Izzie sees. Upload, paste, choose a duration, hit "Make my guide". History is saved in her browser (localStorage), not on a server.
- `app/api/generate/route.ts` — the server-side endpoint. Receives the files and text, sends them to Claude (with PDF/image support and `.docx` text extraction), and returns the generated HTML.
- `lib/systemPrompt.ts` — the long instruction prompt that tells Claude exactly how to structure a guide for Izzie. Edit this if you ever want to tweak the format or tone.
- `app/globals.css` — styling for the input page (warm-paper look matching the guides themselves).

The generated guides are fully self-contained HTML files — they work offline once downloaded.

---

## What it costs

Each guide costs roughly a few cents in Anthropic API credits (depending on how much input she gives it). Vercel hosting is free at this scale.

---

## Things you might want to change later

- **Different model** — `app/api/generate/route.ts`, line with `model: "claude-opus-4-7"`. Swap to `claude-sonnet-4-6` to cut costs roughly 5× at the cost of slightly less polish.
- **Tone / format of the guides** — `lib/systemPrompt.ts`. The whole instruction set lives there.
- **Default time choice** — `app/page.tsx`, the `useState(60)` near the top.
