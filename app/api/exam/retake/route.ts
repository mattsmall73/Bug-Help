import { NextRequest, NextResponse } from "next/server";
import { createSession, getPaper } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  let body: { paper_id?: string; user_name?: string | null; total_minutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }
  if (!body.paper_id) {
    return NextResponse.json({ error: "Missing paper_id." }, { status: 400 });
  }

  const paper = await getPaper(body.paper_id);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  const totalMinutes =
    typeof body.total_minutes === "number" && body.total_minutes > 0
      ? body.total_minutes
      : sumSuggested(paper.parsed_structure);

  let sessionId: string;
  try {
    sessionId = await createSession({
      paper_id: paper.id,
      user_name: (body.user_name ?? "").trim() || null,
      total_minutes: totalMinutes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ session_id: sessionId });
}

function sumSuggested(parsed: {
  sections: { suggested_minutes?: number }[];
}): number {
  const total = parsed.sections.reduce((sum, s) => sum + (s.suggested_minutes ?? 0), 0);
  return total > 0 ? total : 90;
}
