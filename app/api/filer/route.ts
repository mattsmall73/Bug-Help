import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { buildFilerSystemPrompt, buildFilerUserMessage, parseFilerResult } from "@/lib/filerPrompt";
import { POLITICS } from "@/lib/politicsConfig";

export const runtime = "nodejs";
export const maxDuration = 300;

type ContentBlock = Anthropic.MessageCreateParams["messages"][number]["content"];

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in your Vercel project settings." },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read upload. Try again." }, { status: 400 });
  }

  const pastedText = (formData.get("text") as string | null) ?? "";
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (!pastedText.trim() && files.length === 0) {
    return NextResponse.json({ error: "Nothing to file. Paste something or attach a file." }, { status: 400 });
  }

  // Same server-side extraction approach as /api/generate: PDFs and images go to
  // the model as native blocks, docx/txt are read inline.
  const contentBlocks: Exclude<ContentBlock, string> = [];
  const extraTextNotes: string[] = [];
  const fileNames: string[] = [];

  for (const file of files) {
    fileNames.push(file.name);
    const buf = Buffer.from(await file.arrayBuffer());
    const lower = file.name.toLowerCase();
    const mime = file.type;

    if (mime === "application/pdf" || lower.endsWith(".pdf")) {
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
      });
    } else if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(lower)) {
      const mediaType = (mime.startsWith("image/") ? mime : "image/png") as
        | "image/png"
        | "image/jpeg"
        | "image/gif"
        | "image/webp";
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
      });
    } else if (lower.endsWith(".docx")) {
      try {
        const result = await mammoth.extractRawText({ buffer: buf });
        extraTextNotes.push(`--- Contents of ${file.name} ---\n${result.value}`);
      } catch {
        extraTextNotes.push(`(Could not read ${file.name}; please paste its contents instead.)`);
      }
    } else if (lower.endsWith(".doc")) {
      extraTextNotes.push(`(${file.name} is an old .doc format. Please re-save as .docx or paste the text.)`);
    } else if (lower.endsWith(".txt") || mime.startsWith("text/")) {
      extraTextNotes.push(`--- Contents of ${file.name} ---\n${buf.toString("utf-8")}`);
    } else {
      extraTextNotes.push(`(Skipped ${file.name} — unsupported file type.)`);
    }
  }

  const combinedText = [pastedText, ...extraTextNotes].filter(Boolean).join("\n\n");
  const userMessage = buildFilerUserMessage(combinedText, fileNames);

  contentBlocks.push({ type: "text", text: userMessage });

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      // The brief asked for a low temperature for filing consistency, but
      // claude-opus-4-8 has deprecated the temperature parameter and rejects the
      // request if it is set. Filing consistency leans on the structured prompt
      // and the locked JSON contract instead.
      system: buildFilerSystemPrompt(POLITICS),
      messages: [{ role: "user", content: contentBlocks }],
    });

    const textOut = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const result = parseFilerResult(textOut);
    if (!result) {
      return NextResponse.json(
        { error: "Couldn't read that back cleanly. Try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 });
  }
}
