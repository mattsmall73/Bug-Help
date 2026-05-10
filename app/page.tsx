"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "input" | "loading" | "result" | "error";

type HistoryItem = {
  id: string;
  title: string;
  createdAt: number;
  html: string;
};

const HISTORY_KEY = "study-translator-history";
const LOADING_MESSAGES = [
  "Reading what your teacher actually meant...",
  "Untangling the instructions...",
  "Working out where to start...",
  "Sequencing the stages...",
  "Almost there...",
];

export default function Page() {
  const [files, setFiles] = useState<File[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [time, setTime] = useState(60);
  const [phase, setPhase] = useState<Phase>("input");
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [resultHtml, setResultHtml] = useState<string>("");
  const [resultTitle, setResultTitle] = useState<string>("Study guide");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (phase !== "loading") return;
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, LOADING_MESSAGES.length - 1);
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 4000);
    return () => clearInterval(id);
  }, [phase]);

  function addFiles(newFiles: File[]) {
    setFiles((prev) => [...prev, ...newFiles]);
  }
  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }
  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  const hasInput = files.length > 0 || pasteText.trim().length > 0;

  async function generate() {
    setPhase("loading");
    setLoadingMsg(LOADING_MESSAGES[0]);
    setErrorMsg("");

    const fd = new FormData();
    fd.append("text", pasteText);
    fd.append("time", String(time));
    files.forEach((f) => fd.append("files", f, f.name));

    try {
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Something went wrong.");
        setPhase("error");
        return;
      }
      const html = json.html as string;
      const title = extractTitle(html) || "Study guide";
      const item: HistoryItem = { id: makeId(), title, createdAt: Date.now(), html };
      const next = [item, ...history].slice(0, 20);
      setHistory(next);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      setResultHtml(html);
      setResultTitle(title);
      setPhase("result");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setErrorMsg(message);
      setPhase("error");
    }
  }

  function downloadCurrent() {
    downloadHtml(resultHtml, resultTitle);
  }

  function openCurrent() {
    openHtml(resultHtml);
  }

  function reset() {
    setFiles([]);
    setPasteText("");
    setShowPaste(false);
    setTime(60);
    setResultHtml("");
    setErrorMsg("");
    setPhase("input");
  }

  function deleteHistoryItem(id: string) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  }

  function openHistoryItem(item: HistoryItem) {
    openHtml(item.html);
  }

  return (
    <div className="app">
      <div className="brand">
        <div className="brand-mark">For Izzie</div>
        <h1>Study Translator</h1>
        <div className="tagline">Drop in the work. Get back something you can actually start.</div>
      </div>

      {phase === "input" || phase === "error" ? (
        <>
          <div className="card">
            <div className="step-label">Step one</div>
            <h2>What do you need to work through?</h2>

            <div
              className={`dropzone${dragging ? " dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <div className="dropzone-icon">⌁</div>
              <div className="dropzone-text">Drag files here or tap to browse</div>
              <div className="dropzone-sub">PDFs, images, Word docs, plain text — all fine</div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt"
                onChange={(e) => addFiles(Array.from(e.target.files || []))}
              />
            </div>

            <div className="file-list">
              {files.map((f, i) => (
                <div className="file-item" key={`${f.name}-${i}`}>
                  <div className="file-icon">§</div>
                  <div className="file-name">{f.name}</div>
                  <div className="file-size">{formatSize(f.size)}</div>
                  <button className="file-remove" onClick={() => removeFile(i)}>×</button>
                </div>
              ))}
            </div>

            <div className="paste-toggle">
              or <a onClick={() => setShowPaste((v) => !v)}>paste the text directly</a>
            </div>

            {showPaste && (
              <textarea
                className="paste-area"
                placeholder="Paste the instructions or worksheet text here..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                autoFocus
              />
            )}
          </div>

          <div className="card">
            <div className="step-label">Step two — optional</div>
            <h2>How long have you got?</h2>
            <div className="time-options">
              {[
                { v: 30, label: "Half an hour", sub: "quick session" },
                { v: 60, label: "An hour", sub: "a free period" },
                { v: 120, label: "Two hours", sub: "proper sit-down" },
                { v: 0, label: "Don't know", sub: "no pressure" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  className={`time-btn${time === opt.v ? " selected" : ""}`}
                  onClick={() => setTime(opt.v)}
                >
                  <span className="label">{opt.label}</span>
                  <span className="sub">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="generate" disabled={!hasInput} onClick={generate}>
            Make my guide
          </button>

          {phase === "error" && errorMsg && (
            <div className="error">{errorMsg}</div>
          )}

          <div className="history">
            <div className="history-label">Your recent guides</div>
            {history.length === 0 ? (
              <div className="history-empty">Nothing here yet. Make your first guide above.</div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="history-item" onClick={() => openHistoryItem(item)}>
                  <div className="history-meta">
                    <div className="history-title">{item.title}</div>
                    <div className="history-date">{formatDate(item.createdAt)}</div>
                  </div>
                  <button
                    className="history-delete"
                    onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                    aria-label="Delete"
                  >×</button>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      {phase === "loading" && (
        <div className="card">
          <div className="loading">
            <div className="loading-text">{loadingMsg}</div>
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="card">
          <div className="result">
            <div className="result-icon">✓</div>
            <h2>Your guide is ready</h2>
            <p>Open it in a new tab to use it now, or download the file to keep.</p>
            <div>
              <button className="download-btn" onClick={openCurrent}>Open guide</button>
              <button className="download-btn secondary" onClick={downloadCurrent}>Download</button>
            </div>
            <div className="secondary-actions">
              <a onClick={reset}>Make another</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return m[1].trim();
  const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h) return h[1].replace(/<[^>]+>/g, "").trim();
  return null;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  if (sameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function downloadHtml(html: string, title: string) {
  const safe = title.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "study-guide";
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openHtml(html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    alert("Browser blocked the popup. Use Download instead, then open the file.");
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
