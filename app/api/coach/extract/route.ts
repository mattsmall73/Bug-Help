// Turns a single attached passage/essay/scheme into plain text, once, so the
// chat endpoint can stay pure JSON and turns stay cheap. Reuses the same
// extraction path as the exam flow (PDF/image via Claude, Word via mammoth,
// plain text direct). One file at a time keeps each request small.

import { NextRequest, NextResponse } from "next/server";
import { extractTextOnly } from "@/lib/extractText";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set." }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const text = await extractTextOnly(file);
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not read that file: ${message}` }, { status: 502 });
  }
}
