import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { COACH_SYSTEM_PROMPT, buildCoachMessages, type CoachMessage } from "@/lib/coachPrompt";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  messages?: unknown;
  material?: unknown;
  fileNames?: unknown;
};

function isMessage(m: unknown): m is CoachMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    ((m as CoachMessage).role === "user" || (m as CoachMessage).role === "assistant") &&
    typeof (m as CoachMessage).content === "string"
  );
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
    return NextResponse.json({ error: "Could not read the message. Try again." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.filter(isMessage) : [];
  const material = typeof body.material === "string" ? body.material : "";
  const fileNames = Array.isArray(body.fileNames)
    ? body.fileNames.filter((n): n is string => typeof n === "string")
    : [];

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Nothing to reply to. Send a message first." },
      { status: 400 }
    );
  }

  const finalMessages = buildCoachMessages(messages, material, fileNames);

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1600,
      system: COACH_SYSTEM_PROMPT,
      messages: finalMessages.map((m) => ({ role: m.role, content: m.content })),
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!reply) {
      return NextResponse.json({ error: "Empty reply. Try again." }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 });
  }
}
