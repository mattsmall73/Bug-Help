"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STORE_KEY = "coach-conversation";

// Family-authored fixed copy. The opening line sets the tutor frame before a
// single token is spent: here to think it through with her, not to do it for her.
const OPENING: Msg = {
  role: "assistant",
  content:
    "Hi Izzie. I'm here to think things through with you, not to do them for you. Tell me what you're stuck on, or bring a passage or an essay and we'll start from there. Annotation and structure are the two I'm best at.",
};

type Stored = { messages: Msg[]; material: string; fileNames: string[] };

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([OPENING]);
  const [material, setMaterial] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showWork, setShowWork] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // Load any in-progress conversation. AuDHD-friendly: don't lose her place.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored;
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          setMessages(parsed.messages);
        }
        if (typeof parsed.material === "string") setMaterial(parsed.material);
        if (Array.isArray(parsed.fileNames)) setFileNames(parsed.fileNames);
      }
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      const payload: Stored = { messages, material, fileNames };
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch {}
  }, [messages, material, fileNames]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function send(history: Msg[]) {
    setSending(true);
    setErrorMsg("");
    try {
      // The API needs the list to start with a user turn. Drop the opening
      // greeting (and any leading assistant turns) before sending.
      let start = 0;
      while (start < history.length && history[start].role === "assistant") start++;
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(start),
          material,
          fileNames,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Something went wrong.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply as string }]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setSending(false);
    }
  }

  function submit() {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    send(next);
  }

  function retry() {
    if (sending) return;
    send(messages);
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setExtracting(true);
    setErrorMsg("");
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/coach/extract", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) {
          setErrorMsg(json.error || `Could not read ${file.name}.`);
          continue;
        }
        const text = (json.text as string) || "";
        setMaterial((prev) => (prev ? `${prev}\n\n${text}` : text));
        setFileNames((prev) => [...prev, file.name]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : `Could not read ${file.name}.`);
      }
    }
    setExtracting(false);
  }

  function clearWork() {
    setMaterial("");
    setFileNames([]);
  }

  function startFresh() {
    if (sending) return;
    setMessages([OPENING]);
    setMaterial("");
    setFileNames([]);
    setInput("");
    setErrorMsg("");
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {}
  }

  const hasMaterial = material.trim().length > 0 || fileNames.length > 0;
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";

  return (
    <div className="app coach">
      <div className="brand">
        <div className="brand-mark">For Izzie · Help!</div>
        <h1>Coach</h1>
        <div className="tagline">A tutor to think it through with. No marks, no pen taken out of your hand.</div>
        <div className="brand-back">
          <a href="/">← back to chooser</a>
        </div>
      </div>

      <div className="card coach-work">
        <button className="coach-work-toggle" onClick={() => setShowWork((v) => !v)}>
          <span>{hasMaterial ? "Your work is loaded" : "Bring your work (optional)"}</span>
          <span className="coach-work-chevron">{showWork ? "−" : "+"}</span>
        </button>

        {hasMaterial && !showWork && (
          <div className="coach-work-summary">
            {fileNames.length > 0 ? fileNames.join(", ") : "pasted text"} · we'll work from this
          </div>
        )}

        {showWork && (
          <div className="coach-work-body">
            <p className="coach-work-intro">
              A passage to annotate, an essay you're shaping, a mark scheme to work against.
              Paste it or drop a file. I'll point at it. The pen stays yours.
            </p>

            <div
              className={`upload-slot${dragging ? " dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <div className="upload-slot-label">Drop a file or tap to browse</div>
              <div className="upload-slot-sub">PDF, image, Word, or plain text</div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt"
                onChange={(e) => addFiles(Array.from(e.target.files || []))}
              />
            </div>

            {extracting && <div className="coach-extracting">Reading that in...</div>}

            {fileNames.length > 0 && (
              <div className="coach-chips">
                {fileNames.map((n, i) => (
                  <span className="coach-chip" key={`${n}-${i}`}>
                    {n}
                  </span>
                ))}
              </div>
            )}

            <textarea
              className="paste-area"
              placeholder="...or paste the passage, essay, or scheme here."
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            />

            {hasMaterial && (
              <button className="coach-clear" onClick={clearWork}>
                clear this work
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card coach-thread-card">
        <div className="coach-thread" ref={threadRef}>
          {messages.map((m, i) => (
            <div key={i} className={`coach-msg ${m.role}`}>
              <div className="coach-msg-who">{m.role === "assistant" ? "Coach" : "You"}</div>
              <div className="coach-msg-body">{renderRich(m.content)}</div>
            </div>
          ))}

          {sending && (
            <div className="coach-msg assistant">
              <div className="coach-msg-who">Coach</div>
              <div className="coach-msg-body">
                <div className="coach-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="error coach-error">
            {errorMsg}
            {lastIsUser && (
              <button className="coach-retry" onClick={retry}>
                try again
              </button>
            )}
          </div>
        )}

        <div className="coach-input-row">
          <textarea
            className="coach-input"
            placeholder="Type what you're stuck on..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
          />
          <button className="coach-send" onClick={submit} disabled={sending || !input.trim()}>
            Send
          </button>
        </div>

        <div className="coach-footer">
          <a onClick={startFresh}>start fresh</a>
        </div>
      </div>
    </div>
  );
}

// A small, safe renderer for the tutor's replies: paragraphs, simple bullet
// lists, and inline bold. React escapes text, so this stays injection-safe.
function renderRich(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    nodes.push(<p key={`p-${nodes.length}`}>{inline(para.join(" "))}</p>);
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={`u-${nodes.length}`}>
        {bullets.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushPara();
      flushBullets();
      continue;
    }
    const bulletMatch = line.match(/^([-*•])\s+(.*)$/);
    if (bulletMatch) {
      flushPara();
      bullets.push(bulletMatch[2]);
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushPara();
  flushBullets();

  return nodes;
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
