import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import Anthropic from "@anthropic-ai/sdk";
import { PARSING_SYSTEM_PROMPT, buildParsingUserMessage } from "@/lib/parsingPrompt";
import { extractTextFromUrl } from "@/lib/extractText";
import { createPaper, createSession, ParsedPaper } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  spec_blob_url?: string;
  paper_blob_url?: string;
  mark_scheme_blob_url?: string;
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

  const specUrl = (body.spec_blob_url ?? "").toString().trim();
  const paperUrl = (body.paper_blob_url ?? "").toString().trim();
  const markSchemeUrl = (body.mark_scheme_blob_url ?? "").toString().trim();
  const userName = (body.user_name ?? "").toString().trim() || null;
  const totalMinutes =
    typeof body.total_minutes === "number" && body.total_minutes > 0
      ? Math.floor(body.total_minutes)
      : 0;

  if (!specUrl || !paperUrl || !markSchemeUrl) {
    return NextResponse.json(
      { error: "Missing uploaded files for spec, paper, or mark scheme." },
      { status: 400 }
    );
  }
  if (!totalMinutes) {
    return NextResponse.json(
      { error: "Set a total time (in minutes) for the paper." },
      { status: 400 }
    );
  }

  const blobUrls = [specUrl, paperUrl, markSchemeUrl];
  // Always clean up the uploaded blobs before returning — on success or on any
  // error. The extracted text lives in the database; we never keep originals.
  async function cleanupBlobs() {
    await Promise.all(
      blobUrls.map((url) =>
        del(url).catch(() => {
          // best effort — a failed cleanup shouldn't mask the real outcome
        })
      )
    );
  }

  // Server-side extraction. Fetch each blob and pull text out in Node, where
  // PDFs/images/Word docs read reliably (the client-side path failed silently
  // on iPad Safari).
  let specText: string;
  let paperText: string;
  let markSchemeText: string;
  try {
    [specText, paperText, markSchemeText] = await Promise.all([
      extractTextFromUrl(specUrl),
      extractTextFromUrl(paperUrl),
      extractTextFromUrl(markSchemeUrl),
    ]);
    specText = specText.trim();
    paperText = paperText.trim();
    markSchemeText = markSchemeText.trim();
  } catch {
    await cleanupBlobs();
    return NextResponse.json(
      {
        error:
          "We couldn't read one of your files. It might be image-based or password-protected. Try a different file.",
      },
      { status: 422 }
    );
  }

  if (!specText || !paperText || !markSchemeText) {
    await cleanupBlobs();
    return NextResponse.json(
      {
        error:
          "We couldn't read one of your files. It might be image-based or password-protected. Try a different file.",
      },
      { status: 422 }
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
  } catch {
    await cleanupBlobs();
    return NextResponse.json(
      {
        error:
          "We couldn't make sense of this paper. Check that all three uploads are the right documents.",
      },
      { status: 502 }
    );
  }

  if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    await cleanupBlobs();
    return NextResponse.json(
      {
        error:
          "We couldn't make sense of this paper. Check that all three uploads are the right documents.",
      },
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
    await cleanupBlobs();
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not save the session: ${message}` }, { status: 500 });
  }

  // Extraction and parsing succeeded — the text is in the database now, so the
  // original uploads are no longer needed.
  await cleanupBlobs();

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
