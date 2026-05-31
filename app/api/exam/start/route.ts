// Body size: this route now accepts JSON with pre-extracted text only. Raw
// file uploads happen in the browser (lib/clientExtract.ts) for PDFs and
// Word docs, and via /api/exam/transcribe one image at a time. That keeps
// the payload here under the Vercel 4.5MB cap even for big exam papers.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PARSING_SYSTEM_PROMPT, buildParsingUserMessage } from "@/lib/parsingPrompt";
import { createPaper, createSession, ParsedPaper } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  spec_text?: string;
  paper_text?: string;
  mark_scheme_text?: string;
  total_minutes?: number;
  user_name?: string | null;
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 }
    );
  }
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      {
        error:
          "Exam Practice needs a database. Provision Neon via Vercel's storage integration (custom env prefix POSTGRES_), then redeploy.",
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const specText = (body.spec_text ?? "").trim();
  const paperText = (body.paper_text ?? "").trim();
  const markSchemeText = (body.mark_scheme_text ?? "").trim();
  const userName = (body.user_name ?? "").toString().trim() || null;
  const totalMinutes =
    typeof body.total_minutes === "number" && body.total_minutes > 0
      ? Math.floor(body.total_minutes)
      : 0;

  if (!specText || !paperText || !markSchemeText) {
    return NextResponse.json(
      { error: "Missing extracted text for spec, paper, or mark scheme." },
      { status: 400 }
    );
  }
  if (!totalMinutes) {
    return NextResponse.json(
      { error: "Set a total time (in minutes) for the paper." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });
  let parsed: ParsedPaper;
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      system: PARSING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildParsingUserMessage({
                total_minutes: totalMinutes,
                spec_text: specText,
                paper_text: paperText,
                mark_scheme_text: markSchemeText,
              }),
            },
          ],
        },
      ],
    });
    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    parsed = extractJson(out) as ParsedPaper;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not parse the paper: ${message}` }, { status: 502 });
  }

  if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    return NextResponse.json(
      { error: "The parser couldn't find any questions in the paper. Try a clearer upload." },
      { status: 502 }
    );
  }

  let paperId: string;
  let sessionId: string;
  try {
    paperId = await createPaper({
      title: parsed.paper_title || null,
      spec_text: specText,
      paper_text: paperText,
      mark_scheme_text: markSchemeText,
      parsed_structure: parsed,
      total_marks: typeof parsed.total_marks === "number" ? parsed.total_marks : null,
    });
    sessionId = await createSession({
      paper_id: paperId,
      user_name: userName,
      total_minutes: totalMinutes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not save the session: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ session_id: sessionId });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // fall through
    }
  }
  throw new Error("Model did not return valid JSON.");
}
