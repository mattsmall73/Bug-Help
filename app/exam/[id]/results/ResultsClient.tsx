"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  html: string;
  paperId: string;
  userName: string | null;
};

export default function ResultsClient(props: Props) {
  const router = useRouter();
  const [retaking, setRetaking] = useState(false);
  const [error, setError] = useState("");

  async function retake() {
    setRetaking(true);
    setError("");
    try {
      const res = await fetch("/api/exam/retake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_id: props.paperId, user_name: props.userName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not start a retake.");
        setRetaking(false);
        return;
      }
      router.push(`/exam/${json.session_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
      setRetaking(false);
    }
  }

  function download() {
    const blob = new Blob([props.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exam-results.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "var(--bg)",
          padding: "12px 16px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          zIndex: 10,
        }}
      >
        <a
          href="/"
          style={{
            fontSize: 13,
            color: "var(--muted)",
            textDecoration: "underline",
            textDecorationStyle: "dotted",
            textUnderlineOffset: 3,
          }}
        >
          ← Help!
        </a>
        <div style={{ flex: 1 }} />
        <button
          className="exam-btn"
          onClick={download}
          style={{ flex: "0 0 auto", minWidth: 0, padding: "8px 16px", fontSize: 14 }}
        >
          Download
        </button>
        <button
          className="exam-btn primary"
          onClick={retake}
          disabled={retaking}
          style={{ flex: "0 0 auto", minWidth: 0, padding: "8px 16px", fontSize: 14 }}
        >
          {retaking ? "Starting..." : "Retake this paper"}
        </button>
      </div>
      {error && <div className="error" style={{ margin: "12px 16px" }}>{error}</div>}
      <iframe
        srcDoc={props.html}
        title="Results"
        style={{ width: "100%", height: "calc(100vh - 56px)", border: "none", background: "var(--bg)" }}
      />
    </div>
  );
}
