import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Signs short-lived upload tokens so the browser can upload her visual work
// (images and annotated PDFs) straight to Vercel Blob, bypassing the request
// body cap that base64-in-JSON hits. The chat endpoint then hands the model a
// URL for each file instead of inlining megabytes of base64 every turn.

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per file

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "File uploads aren't configured. Provision Vercel Blob (Storage → Create → Blob) and redeploy, or paste the text instead.",
      },
      { status: 503 }
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_SIZE_BYTES,
        addRandomSuffix: true,
      }),
      // The blobs live for the length of the conversation (re-referenced by URL
      // each turn), so nothing is deleted here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not authorise upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
