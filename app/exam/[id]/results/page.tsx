import { notFound } from "next/navigation";
import { getSessionWithPaper } from "@/lib/db";
import ResultsClient from "./ResultsClient";

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
          <p style={{ color: "var(--muted)" }}>Set <code>POSTGRES_URL</code> and redeploy.</p>
        </div>
      </div>
    );
  }

  const row = await getSessionWithPaper(id);
  if (!row) notFound();

  if (!row.session.submitted_at || !row.session.results_html) {
    return (
      <div className="app">
        <div className="brand">
          <div className="brand-mark">For Izzie · Help!</div>
          <h1>Not marked yet</h1>
        </div>
        <div className="card">
          <p style={{ color: "var(--muted)" }}>
            This paper hasn&apos;t been submitted for marking. Go back and finish answering.
          </p>
          <div style={{ marginTop: 16 }}>
            <a href={`/exam/${id}`} className="exam-btn primary" style={{ display: "inline-block", textDecoration: "none", padding: "12px 24px" }}>
              Back to the paper
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ResultsClient
      html={row.session.results_html}
      paperId={row.paper.id}
      userName={row.session.user_name}
    />
  );
}
