import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { COACH_SYSTEM_PROMPT, buildCoachMessages, type CoachMessage } from "@/lib/coachPrompt";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  messages?: unknown;
  material?: unknown;
  fileNames?: unknown;
  images?: unknown;
};

type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
const ALLOWED_IMAGE_TYPES: ImageMediaType[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

type CoachImage = { mediaType: ImageMediaType; data: string };

function isMessage(m: unknown): m is CoachMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    ((m as CoachMessage).role === "user" || (m as CoachMessage).role === "assistant") &&
    typeof (m as CoachMessage).content === "string"
  );
}

function toImage(x: unknown): CoachImage | null {
  if (typeof x !== "object" || x === null) return null;
  const { mediaType, data } = x as { mediaType?: unknown; data?: unknown };
  if (typeof data !== "string" || data.length === 0) return null;
  const type = ALLOWED_IMAGE_TYPES.includes(mediaType as ImageMediaType)
    ? (mediaType as ImageMediaType)
    : "image/png";
  return { mediaType: type, data };
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
  const images = Array.isArray(body.images)
    ? body.images.map(toImage).filter((x): x is CoachImage => x !== null)
    : [];

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Nothing to reply to. Send a message first." },
      { status: 400 }
    );
  }

  const finalMessages = buildCoachMessages(messages, material, fileNames);

  // Text content per turn. Any images she has shown are attached to the first
  // user turn as vision blocks, alongside the folded text material, so the
  // tutor can actually see her annotations rather than a flattened transcript.
  const apiMessages: Anthropic.MessageParam[] = finalMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (images.length > 0) {
    const firstUserIdx = apiMessages.findIndex((m) => m.role === "user");
    if (firstUserIdx !== -1) {
      const folded = apiMessages[firstUserIdx].content as string;
      apiMessages[firstUserIdx] = {
        role: "user",
        content: [
          {
            type: "text",
            text: "Some of my work is attached below as images. These are photos of my own pages, often with my annotations on them (underlines, circles, margin notes). Look at them and use them to advise me on how to annotate better. Do not grade them.",
          },
          ...images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
          })),
          { type: "text" as const, text: folded },
        ],
      };
    }
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1600,
      system: COACH_SYSTEM_PROMPT,
      messages: apiMessages,
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
