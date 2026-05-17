import { notFound, redirect } from "next/navigation";
import { getSessionWithPaper } from "@/lib/db";
import AnswerClient from "./AnswerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.POSTGRES_URL) {
    return (
      <div className="app">
        <div className="brand">
          <div className="brand-mark">For Izzie · Help!</div>
          <h1>Exam Practice</h1>
        </div>
        <div className="card">
          <h2>Database not set up yet</h2>
          <p style={{ color: "var(--muted)" }}>
            Provision Neon via Vercel&apos;s storage integration with custom env prefix
            <code> POSTGRES_</code>, redeploy, and this page will load.
          </p>
        </div>
      </div>
    );
  }

  const row = await getSessionWithPaper(id);
  if (!row) notFound();

  if (row.session.submitted_at) {
    redirect(`/exam/${id}/results`);
  }

  return (
    <AnswerClient
      sessionId={row.session.id}
      paperTitle={row.paper.title ?? row.paper.parsed_structure.paper_title ?? "Paper"}
      parsed={row.paper.parsed_structure}
      initialAnswers={row.session.answers ?? {}}
      initialTimer={row.session.timer_state ?? { elapsed_seconds: 0, paused: true }}
      totalMinutes={row.session.total_minutes}
      userName={row.session.user_name}
    />
  );
}
