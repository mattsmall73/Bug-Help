// Body size: one image at a time. A typical photo of a printed page is
// 1-3MB, well under Vercel's 4.5MB cap. If a user uploads a giant image
// they'll get an error and can convert to PDF instead.

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
    return NextResponse.json({ error: `Could not transcribe: ${message}` }, { status: 502 });
  }
}
