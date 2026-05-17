// Body size: Vercel Functions cap requests at 4.5MB by default. Autosave
// payloads are JSON answer strings; for very long extended-response answers
// the cumulative payload can approach the limit. There is no App Router
// route-segment config to raise this. Fix is Vercel → Project → Settings →
// Functions → Fluid Compute (raises to ~100MB on Pro).

import { NextRequest, NextResponse } from "next/server";
import { updateSessionProgress, Answers, TimerState } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  let body: { session_id?: string; answers?: Answers; timer_state?: TimerState };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }
  if (!body.session_id) {
    return NextResponse.json({ error: "Missing session_id." }, { status: 400 });
  }

  try {
    await updateSessionProgress({
      session_id: body.session_id,
      answers: body.answers,
      timer_state: body.timer_state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
