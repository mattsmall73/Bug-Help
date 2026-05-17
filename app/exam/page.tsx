"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Slot = "spec" | "paper" | "mark_scheme";

const SLOT_META: Record<Slot, { label: string; sub: string }> = {
  spec: {
    label: "Subject specification",
    sub: "What's examinable, assessment objectives, level descriptors.",
  },
  paper: {
    label: "Past paper",
    sub: "The questions you'll answer.",
  },
  mark_scheme: {
    label: "Mark scheme",
    sub: "What the examiner is looking for.",
  },
};

const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt";

const LOADING_MESSAGES = [
  "Reading your spec...",
  "Walking through the paper...",
  "Cross-checking the mark scheme...",
  "Working out the timing...",
  "Almost ready...",
];

export default function Page() {
  const router = useRouter();
  const [files, setFiles] = useState<Record<Slot, File | null>>({
    spec: null,
    paper: null,
    mark_scheme: null,
  });
  const [preset, setPreset] = useState<number | null>(90);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState(0);
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

  const hasAllFiles = !!files.spec && !!files.paper && !!files.mark_scheme;
  const hasTime = totalMinutes > 0;
  const canStart = hasAllFiles && hasTime && !loading;

  function setSlotFile(slot: Slot, f: File | null) {
    setFiles((prev) => ({ ...prev, [slot]: f }));
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

  async function start() {
    if (!canStart) return;
    setLoading(true);
    setError("");
    setLoadingIdx(0);
    const tick = setInterval(() => {
      setLoadingIdx((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1));
    }, 4000);

    const fd = new FormData();
    fd.append("spec", files.spec!, files.spec!.name);
    fd.append("paper", files.paper!, files.paper!.name);
    fd.append("mark_scheme", files.mark_scheme!, files.mark_scheme!.name);
    fd.append("total_minutes", String(totalMinutes));
    if (userName.trim()) fd.append("user_name", userName.trim());

    try {
      const res = await fetch("/api/exam/start", { method: "POST", body: fd });
      const json = await res.json();
      clearInterval(tick);
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push(`/exam/${json.session_id}`);
    } catch (err) {
      clearInterval(tick);
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
      setLoading(false);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
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

      {loading ? (
        <div className="card">
          <div className="loading">
            <div className="loading-text">{LOADING_MESSAGES[loadingIdx]}</div>
            <div className="loading-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="step-label">Step one</div>
            <h2>Three files</h2>

            {(Object.keys(SLOT_META) as Slot[]).map((slot) => {
              const f = files[slot];
              return (
                <div
                  key={slot}
                  className="upload-slot"
                  onClick={() => refs[slot].current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) setSlotFile(slot, file);
                  }}
                >
                  <div className="upload-slot-label">{SLOT_META[slot].label}</div>
                  <div className="upload-slot-sub">{SLOT_META[slot].sub}</div>
                  <div className={`upload-slot-state${f ? " filled" : ""}`}>
                    {f ? `${f.name} · ${formatSize(f.size)}` : "Tap to choose a file or drop it here"}
                  </div>
                  <input
                    ref={refs[slot]}
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setSlotFile(slot, file);
                    }}
                  />
                </div>
              );
            })}
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
