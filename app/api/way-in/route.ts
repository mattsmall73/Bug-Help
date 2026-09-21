import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  WAY_IN_SYSTEM_PROMPT,
  buildSetupMessage,
  parseWayInResult,
  type WayInResult,
} from "@/lib/wayInPrompt";
import { DEFAULT_MINUTES, QUESTION_CAP } from "@/lib/wayInConfig";

export const runtime = "nodejs";
export const maxDuration = 120;

// Same model as the rest of Help!.
const MODEL = "claude-opus-4-8";

const MUST_LAND = "[must_land: true]";
const SKIP = "SKIP_TO_TASK";

type Turn = { role: "user" | "assistant"; content: string };

type Body = {
  interest?: unknown;
  subject?: unknown;
  task?: unknown;
  minutes?: unknown;
  history?: unknown;
  skip?: unknown;
};

function isTurn(t: unknown): t is Turn {
  return (
    typeof t === "object" &&
    t !== null &&
    ((t as Turn).role === "user" || (t as Turn).role === "assistant") &&
    typeof (t as Turn).content === "string"
  );
}

// The API rejects two turns in a row from the same role, and the first turn has
// to be the user's. Merge any doubled-up turns and drop a leading assistant so
// a malformed history can never take the whole call down with it.
function alternate(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const turn of turns) {
    const content = turn.content.trim();
    if (!content) continue;
    if (out.length === 0 && turn.role !== "user") continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n\n${content}`;
      continue;
    }
    out.push({ role: turn.role, content });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in your Vercel project settings." },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That didn't come through. Try again." }, { status: 400 });
  }

  const interest = typeof body.interest === "string" ? body.interest.trim() : "";
  const task = typeof body.task === "string" ? body.task.trim() : "";
  const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : null;
  const minutes =
    typeof body.minutes === "number" && Number.isFinite(body.minutes) && body.minutes > 0
      ? Math.round(body.minutes)
      : DEFAULT_MINUTES;
  const history = Array.isArray(body.history) ? body.history.filter(isTurn) : [];
  const skip = body.skip === true;

  if (!interest || !task) {
    return NextResponse.json(
      { error: "Tell me what's on your mind and what you need to do." },
      { status: 400 }
    );
  }

  // The question cap lives here, not in the prompt. Once she has given
  // QUESTION_CAP answers the next reply has to be a landing.
  const answersGiven = history.filter((t) => t.role === "user").length;
  const mustLand = skip || answersGiven >= QUESTION_CAP;

  const setup = buildSetupMessage(interest, subject, task, minutes);
  const skipText = `${SKIP} ${MUST_LAND}`;
  let turns: Turn[];

  if (skip && history.length === 0) {
    // Nothing to reply to yet, so the skip rides on the setup turn. Sending it
    // as a second user message in a row would be rejected.
    turns = [{ role: "user", content: `${setup}\n\n${skipText}` }];
  } else {
    turns = [{ role: "user", content: setup }, ...history.map((t) => ({ ...t }))];
    if (skip) {
      turns.push({ role: "user", content: skipText });
    } else if (mustLand) {
      const last = turns[turns.length - 1];
      if (last.role === "user") {
        last.content = `${last.content}\n\n${MUST_LAND}`;
      } else {
        turns.push({ role: "user", content: MUST_LAND });
      }
    }
  }

  const messages: Anthropic.MessageParam[] = alternate(turns).map((t) => ({
    role: t.role,
    content: t.content,
  }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "That didn't come through. Try again." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  async function ask(
    msgs: Anthropic.MessageParam[]
  ): Promise<{ result: WayInResult | null; raw: string }> {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: WAY_IN_SYSTEM_PROMPT,
      messages: msgs,
    });
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { result: parseWayInResult(raw), raw };
  }

  try {
    let { result, raw } = await ask(messages);

    // One retry for a reply that wasn't clean JSON.
    if (!result) {
      ({ result, raw } = await ask(messages));
    }

    if (!result) {
      return NextResponse.json({ error: "That didn't come through. Try again." }, { status: 502 });
    }

    // Belt and braces on the cap: if it owes her a landing and asked another
    // question instead, ask once more for the landing.
    if (mustLand && result.type === "question") {
      const forced = await ask([
        ...messages,
        { role: "assistant", content: raw.trim() },
        { role: "user", content: `${SKIP} ${MUST_LAND}` },
      ]);
      if (forced.result && forced.result.type !== "question") {
        result = forced.result;
      }
    }

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 });
  }
}
