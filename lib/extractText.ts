import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

type ContentBlock = Exclude<
  Anthropic.MessageCreateParams["messages"][number]["content"],
  string
>[number];

export type ExtractionResult = {
  blocks: ContentBlock[];
  textNotes: string[];
  fileName: string;
};

export async function extractFile(file: File): Promise<ExtractionResult> {
  const fileName = file.name;
  const buf = Buffer.from(await file.arrayBuffer());
  const lower = fileName.toLowerCase();
  const mime = file.type;

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return {
      fileName,
      textNotes: [],
      blocks: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
        },
      ],
    };
  }

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(lower)) {
    const mediaType = (mime.startsWith("image/") ? mime : "image/png") as
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";
    return {
      fileName,
      textNotes: [],
      blocks: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
        },
      ],
    };
  }

  if (lower.endsWith(".docx")) {
    try {
      const result = await mammoth.extractRawText({ buffer: buf });
      return {
        fileName,
        blocks: [],
        textNotes: [`--- Contents of ${fileName} ---\n${result.value}`],
      };
    } catch {
      return {
        fileName,
        blocks: [],
        textNotes: [`(Could not read ${fileName}; please paste its contents instead.)`],
      };
    }
  }

  if (lower.endsWith(".doc")) {
    return {
      fileName,
      blocks: [],
      textNotes: [`(${fileName} is an old .doc format. Please re-save as .docx or paste the text.)`],
    };
  }

  if (lower.endsWith(".txt") || mime.startsWith("text/")) {
    return {
      fileName,
      blocks: [],
      textNotes: [`--- Contents of ${fileName} ---\n${buf.toString("utf-8")}`],
    };
  }

  return {
    fileName,
    blocks: [],
    textNotes: [`(Skipped ${fileName} — unsupported file type.)`],
  };
}

export async function extractTextOnly(file: File, pastedText?: string): Promise<string> {
  const result = await extractFile(file);
  if (result.textNotes.length > 0) {
    return result.textNotes.join("\n\n");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set; cannot extract text from PDFs or images.");
  }
  if (result.blocks.length === 0) {
    return pastedText?.trim() ?? "";
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8000,
    system:
      "You are a faithful transcriber. Extract the full text from the attached file as plain text, preserving question numbering, marks (e.g. '[4 marks]'), and section headings exactly as printed. Do not summarise. Do not add commentary. Output the transcribed text only.",
    messages: [
      {
        role: "user",
        content: [
          ...result.blocks,
          { type: "text", text: "Transcribe this exam-paper artefact in full as plain text." },
        ],
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
