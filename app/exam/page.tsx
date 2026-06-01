"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

// The "spec" slot key is kept as an internal name to avoid churning the
// API/db field names; it now carries the examiner's report, not a spec.
type Slot = "spec" | "paper" | "mark_scheme";

const SLOTS: Slot[] = ["spec", "paper", "mark_scheme"];

const SLOT_META: Record<Slot, { label: string; sub: string; noun: string }> = {
  spec: {
    label: "Examiner's report",
    sub: "The examiner's commentary on this paper: what strong answers did, common mistakes, what separated top marks.",
    noun: "examiner's report",
  },
  paper: {
    label: "Past paper",
    sub: "The questions you'll answer.",
    noun: "paper",
  },
  mark_scheme: {
    label: "Mark scheme",
    sub: "What the examiner is looking for.",
    noun: "mark scheme",
  },
};

const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt";

type SlotState =
  | { kind: "empty" }
  | { kind: "attached"; file: File }
  | { kind: "uploading"; file: File; message: string }
  | { kind: "uploaded"; file: File; url: string }
  | { kind: "error"; file: File; message: string };

export default function Page() {
  const router = useRouter();
  const [slots, setSlots] = useState<Record<Slot, SlotState>>({
    spec: { kind: "empty" },
    paper: { kind: "empty" },
    mark_scheme: { kind: "empty" },
  });
  const [preset, setPreset] = useState<number | null>(90);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [userName, setUserName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [error, setError] = useState("");

  const specRef = useRef<HTMLInputElement>(null);
  const paperRef = useRef<HTMLInputElement>(null);
  const schemeRef = useRef<HTMLInputElement>(null);
  const refs: Record<Slot, React.RefObject<HTMLInputElement | null>> = {
    spec: specRef,
    paper: paperRef,
    mark_scheme: schemeRef,
  };

  const manualTotal =
    (parseInt(manualHours || "0", 10) || 0) * 60 + (parseInt(manualMinutes || "0", 10) || 0);
  const totalMinutes = preset !== null ? preset : manualTotal;

  const allAttached = SLOTS.every((s) => slots[s].kind !== "empty");
  const hasTime = totalMinutes > 0;
  const canStart = allAttached && hasTime && !submitting;

  function attachFile(slot: Slot, file: File) {
    setSlots((prev) => ({ ...prev, [slot]: { kind: "attached", file } }));
  }
  function clearFile(slot: Slot) {
    setSlots((prev) => ({ ...prev, [slot]: { kind: "empty" } }));
  }

  function selectPreset(v: number) {
    setPreset(v);
    setManualHours("");
    setManualMinutes("");
  }

  function updateManualHours(raw: string) {
    if (raw === "") {
      setManualHours("");
      setPreset(null);
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    const n = parseInt(raw, 10);
    if (n < 0 || n > 6) return;
    setManualHours(String(n));
    setPreset(null);
  }

  function updateManualMinutes(raw: string) {
    if (raw === "") {
      setManualMinutes("");
      setPreset(null);
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    const n = parseInt(raw, 10);
    if (n < 0 || n > 59) return;
    setManualMinutes(String(n));
    setPreset(null);
  }

  async function uploadOne(slot: Slot): Promise<string | null> {
    const current = slots[slot];
    if (current.kind === "empty") return null;
    if (current.kind === "uploaded") return current.url;
    const file = current.file;

    const base = `Uploading ${SLOT_META[slot].noun}...`;
    setSlots((prev) => ({ ...prev, [slot]: { kind: "uploading", file, message: base } }));

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/exam/upload-url",
        onUploadProgress: ({ percentage }) => {
          setSlots((prev) => {
            const s = prev[slot];
            if (s.kind !== "uploading") return prev;
            return { ...prev, [slot]: { ...s, message: `${base} ${Math.round(percentage)}%` } };
          });
        },
      });
      setSlots((prev) => ({ ...prev, [slot]: { kind: "uploaded", file, url: blob.url } }));
      return blob.url;
    } catch {
      setSlots((prev) => ({ ...prev, [slot]: { kind: "error", file, message: "Upload failed." } }));
      return null;
    }
  }

  async function start() {
    if (!canStart) return;
    setSubmitting(true);
    setError("");
    setSubmitMessage("Uploading your files...");

    const urls: Partial<Record<Slot, string>> = {};
    for (const slot of SLOTS) {
      const url = await uploadOne(slot);
      if (url === null) {
        setError("We couldn't upload the file. Try again, or check the file isn't corrupted.");
        setSubmitting(false);
        return;
      }
      urls[slot] = url;
    }

    setSubmitMessage("Parsing the paper...");

    try {
      const res = await fetch("/api/exam/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec_blob_url: urls.spec,
          paper_blob_url: urls.paper,
          mark_scheme_blob_url: urls.mark_scheme,
          total_minutes: totalMinutes,
          user_name: userName.trim() || null,
        }),
      });
      let json: { session_id?: string; error?: string };
      try {
        json = await res.json();
      } catch {
        setError("Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(`/exam/${json.session_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
      setSubmitting(false);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function slotStateLine(slot: Slot): { text: string; tone: "muted" | "accent" | "done" | "error" } {
    const s = slots[slot];
    switch (s.kind) {
      case "empty":
        return { text: "Tap to choose a file or drop it here", tone: "muted" };
      case "attached":
        return { text: `${s.file.name} · ${formatSize(s.file.size)}`, tone: "accent" };
      case "uploading":
        return { text: `${s.file.name} · ${s.message}`, tone: "accent" };
      case "uploaded":
        return { text: `${s.file.name} · ready`, tone: "done" };
      case "error":
        return { text: `${s.file.name} · ${s.message}`, tone: "error" };
    }
  }

  return (
    <div className="app">
      <div className="brand">
        <div className="brand-mark">For Izzie · Help!</div>
        <h1>Exam Practice</h1>
        <div className="tagline">Sit a real paper. Get back something better than a mark.</div>
        <div className="brand-back">
          <a href="/">← back to chooser</a>
        </div>
      </div>

      {submitting ? (
        <div className="card">
          <div className="loading">
            <div className="loading-text">{submitMessage}</div>
            <div className="loading-dots">
              <span />
              <span />
              <span />
            </div>
            <div style={{ marginTop: 18, fontSize: 13, color: "var(--muted)" }}>
              {SLOTS.map((slot) => {
                const s = slots[slot];
                const line = slotStateLine(slot);
                if (s.kind === "empty") return null;
                return (
                  <div key={slot} style={{ marginBottom: 4 }}>
                    <strong>{SLOT_META[slot].label}:</strong> {line.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="step-label">Step one</div>
            <h2>Three files</h2>

            {SLOTS.map((slot) => {
              const s = slots[slot];
              const line = slotStateLine(slot);
              const stateColor =
                line.tone === "done"
                  ? "var(--done)"
                  : line.tone === "error"
                  ? "var(--accent)"
                  : line.tone === "accent"
                  ? "var(--accent)"
                  : "var(--muted)";
              return (
                <div
                  key={slot}
                  className="upload-slot"
                  onClick={() => refs[slot].current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) attachFile(slot, file);
                  }}
                >
                  <div className="upload-slot-label">{SLOT_META[slot].label}</div>
                  <div className="upload-slot-sub">{SLOT_META[slot].sub}</div>
                  <div className="upload-slot-state" style={{ color: stateColor }}>
                    {line.text}
                  </div>
                  {s.kind !== "empty" && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <a
                        onClick={(e) => {
                          e.stopPropagation();
                          clearFile(slot);
                        }}
                        style={{
                          color: "var(--muted)",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textDecorationStyle: "dotted",
                          textUnderlineOffset: 3,
                        }}
                      >
                        replace
                      </a>
                    </div>
                  )}
                  <input
                    ref={refs[slot]}
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file) attachFile(slot, file);
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })}

            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, fontStyle: "italic" }}>
              PDFs, Word docs, plain text, or images. Files upload securely and are read on the server, so big PDFs work fine on any device.
            </div>
          </div>

          <div className="card">
            <div className="step-label">Step two</div>
            <h2>How long is the paper?</h2>
            <div className="time-options">
              {[
                { v: 60, label: "1 hour", sub: "short paper" },
                { v: 90, label: "1h 30m", sub: "standard" },
                { v: 120, label: "2 hours", sub: "long paper" },
                { v: 150, label: "2h 30m", sub: "the big one" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  className={`time-btn${preset === opt.v ? " selected" : ""}`}
                  onClick={() => selectPreset(opt.v)}
                >
                  <span className="label">{opt.label}</span>
                  <span className="sub">{opt.sub}</span>
                </button>
              ))}
            </div>

            <div className="time-manual">
              <div className="time-manual-label">or set it exactly:</div>
              <div className="time-manual-row">
                <label className="time-manual-field">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={manualHours}
                    onChange={(e) => updateManualHours(e.target.value)}
                    placeholder="0"
                    aria-label="Hours"
                  />
                  <span>hours</span>
                </label>
                <label className="time-manual-field">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={manualMinutes}
                    onChange={(e) => updateManualMinutes(e.target.value)}
                    placeholder="0"
                    aria-label="Minutes"
                  />
                  <span>minutes</span>
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="step-label">Optional</div>
            <h2>Your name</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginTop: -8, marginBottom: 14 }}>
              Goes on the &quot;For [name]&quot; line on the results.
            </p>
            <input
              className="name-input"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Izzie"
            />
          </div>

          <button className="generate" disabled={!canStart} onClick={start}>
            Start practice
          </button>

          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}
