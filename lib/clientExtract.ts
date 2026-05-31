// Client-side text extraction. Must only be imported into client components.
//
// Each helper returns plain text. PDFs and DOCX are extracted entirely in the
// browser; images are uploaded one-at-a-time to /api/exam/transcribe (which
// stays well under the 4.5MB Vercel Functions cap because it's one file, not
// three concatenated multipart parts).

export type ExtractProgress = (message: string) => void;

export async function extractTextFromFile(
  file: File,
  onProgress?: ExtractProgress
): Promise<string> {
  const lower = file.name.toLowerCase();
  const mime = file.type;

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return extractPdf(file, onProgress);
  }
  if (lower.endsWith(".docx")) {
    onProgress?.("Reading Word doc...");
    return extractDocx(file);
  }
  if (lower.endsWith(".doc")) {
    throw new Error(
      "Old .doc format isn't supported. Re-save as .docx, or export to PDF, or paste the text."
    );
  }
  if (lower.endsWith(".txt") || mime.startsWith("text/")) {
    onProgress?.("Reading text...");
    return file.text();
  }
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(lower)) {
    onProgress?.("Transcribing image...");
    return transcribeImage(file);
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

async function extractPdf(file: File, onProgress?: ExtractProgress): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Pin the worker to the installed version on the unpkg CDN. Bundling the
  // worker through Next.js' build is fragile across versions; the CDN URL is
  // a stable v2-grade fix and the worker file is tiny relative to the PDFs
  // it parses.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuf = await file.arrayBuffer();
  onProgress?.("Opening PDF...");
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`Reading page ${i} of ${pdf.numPages}...`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(text);
  }

  const joined = pages.join("\n\n").trim();
  if (!joined) {
    throw new Error(
      "This PDF doesn't contain selectable text — likely a scan. Convert to text-based PDF, or take screenshots and upload as images."
    );
  }
  return joined;
}

async function extractDocx(file: File): Promise<string> {
  // mammoth's browser build is a self-contained UMD; importing the main
  // package would try to pull in Node-only modules through Webpack and fail.
  const mod = (await import("mammoth/mammoth.browser.js")) as unknown as {
    default?: { extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
    extractRawText?: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const extractRawText = mod.default?.extractRawText ?? mod.extractRawText;
  if (!extractRawText) {
    throw new Error("Could not load Word document reader.");
  }
  const arrayBuf = await file.arrayBuffer();
  const result = await extractRawText({ arrayBuffer: arrayBuf });
  return result.value;
}

async function transcribeImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch("/api/exam/transcribe", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || "Could not transcribe the image.");
  }
  return json.text as string;
}
