"use client";

import { useEffect, useRef, useState } from "react";
import { POLITICS } from "@/lib/politicsConfig";
import { FilerResult } from "@/lib/filerPrompt";
import PoliticsMap from "./PoliticsMap";

type Phase = "input" | "loading" | "result" | "error";

const LOADING_MESSAGES = [
  "Reading what your teacher gave you...",
  "Working out where it lives...",
  "Finding the right drawer...",
  "Almost there...",
];

export default function Page() {
  const [files, setFiles] = useState<File[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [result, setResult] = useState<FilerResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase !== "loading") return;
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, LOADING_MESSAGES.length - 1);
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 3000);
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

  const hasContent = files.length > 0 || pasteText.trim().length > 0;

  async function fileIt() {
    setPhase("loading");
    setLoadingMsg(LOADING_MESSAGES[0]);
    setErrorMsg("");

    const fd = new FormData();
    fd.append("text", pasteText);
    files.forEach((f) => fd.append("files", f, f.name));

    try {
      const res = await fetch("/api/filer", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Something went wrong.");
        setPhase("error");
        return;
      }
      setResult(json.result as FilerResult);
      setPhase("result");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setErrorMsg(message);
      setPhase("error");
    }
  }

  function reset() {
    setFiles([]);
    setPasteText("");
    setResult(null);
    setErrorMsg("");
    setPhase("input");
  }

  return (
    <div className="app">
      <div className="brand">
        <div className="brand-mark">For Izzie · Help!</div>
        <h1>Where does this go?</h1>
        <div className="tagline">Paste something a teacher gave you. Find out where it fits.</div>
        <div className="brand-back"><a href="/">← back to chooser</a></div>
      </div>

      {(phase === "input" || phase === "error") && (
        <>
          <div className="card">
            <div className="step-label">Politics · A-level</div>
            <h2>What did your teacher give you?</h2>

            <textarea
              className="paste-area"
              placeholder="Paste a comment, a slide, a worksheet line, or a question here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              autoFocus
            />

            <div
              className={`dropzone filer-dropzone${dragging ? " dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <div className="dropzone-text">or drop a file</div>
              <div className="dropzone-sub">a photo of the slide, a PDF, a Word doc</div>
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
          </div>

          <button className="generate" disabled={!hasContent} onClick={fileIt}>
            File it
          </button>

          {phase === "error" && errorMsg && <div className="error">{errorMsg}</div>}
        </>
      )}

      {phase === "loading" && (
        <div className="card">
          <div className="loading">
            <div className="loading-text">{loadingMsg}</div>
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <>
          {result.not_politics ? (
            <div className="card filer-answer">
              <div className="filer-answer-block">
                <p className="filer-not-politics">
                  {result.message || "This doesn't look like politics. Have a look and try pasting it again."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <PoliticsMap structure={POLITICS} result={result} />

              <div className="card filer-answer">
                {result.location_text && (
                  <div className="filer-answer-block">
                    <div className="filer-answer-label">{result.confident ? "Where it goes" : "Most likely"}</div>
                    <p className="filer-location">{result.location_text}</p>
                  </div>
                )}

                {result.concept && (
                  <div className="filer-answer-block">
                    <div className="filer-answer-label">The idea, opened</div>
                    <p>{result.concept}</p>
                  </div>
                )}

                {result.hint && (
                  <div className="filer-answer-block">
                    <div className="filer-answer-label">{result.confident ? "A way in" : "Worth checking"}</div>
                    <p className="filer-hint">{result.hint}</p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="secondary-actions filer-again">
            <a onClick={reset}>File another</a>
          </div>
        </>
      )}
    </div>
  );
}
