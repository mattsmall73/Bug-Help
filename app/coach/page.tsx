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

// Visual work she shows the tutor: images and PDFs. Both are kept as-is (held
// as a data URL) and sent to the model so it can see her annotations, rather
// than flattened to a transcript that drops every mark she made.
type Attachment = { name: string; dataUrl: string; kind: "image" | "pdf" };
type Stored = {
  messages: Msg[];
  material: string;
  fileNames: string[];
  attachments: Attachment[];
};

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;
const PDF_RE = /\.pdf$/i;

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([OPENING]);
  const [material, setMaterial] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
        if (Array.isArray(parsed.attachments)) setAttachments(parsed.attachments);
      }
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const payload: Stored = { messages, material, fileNames, attachments };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch {
      // Photos and PDFs can push past the localStorage quota. Keep her
      // conversation and text material persisted even when the files are too
      // big to store between visits.
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...payload, attachments: [] }));
      } catch {}
    }
  }, [messages, material, fileNames, attachments]);

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
          attachments: attachments.map(toAttachmentPayload).filter(Boolean),
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
    setErrorMsg("");
    for (const file of files) {
      const isImage = file.type.startsWith("image/") || IMAGE_RE.test(file.name);
      const isPdf = file.type === "application/pdf" || PDF_RE.test(file.name);
      if (isImage || isPdf) {
        // Images and PDFs are kept whole so the tutor can SEE her annotations.
        // No transcription: read to a data URL and hold it client-side; the
        // model receives the file itself (image block or document block).
        try {
          const dataUrl = await readDataUrl(file);
          setAttachments((prev) => [
            ...prev,
            { name: file.name, dataUrl, kind: isImage ? "image" : "pdf" },
          ]);
        } catch {
          setErrorMsg(`Could not read ${file.name}.`);
        }
        continue;
      }
      // Word and plain text have no visual layer worth keeping; flatten to text.
      setExtracting(true);
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
      } finally {
        setExtracting(false);
      }
    }
  }

  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function clearWork() {
    setMaterial("");
    setFileNames([]);
    setAttachments([]);
  }

  function startFresh() {
    if (sending) return;
    setMessages([OPENING]);
    setMaterial("");
    setFileNames([]);
    setAttachments([]);
    setInput("");
    setErrorMsg("");
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {}
  }

  const hasMaterial =
    material.trim().length > 0 || fileNames.length > 0 || attachments.length > 0;
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
            {workSummary(fileNames, attachments, material)} · we'll work from this
          </div>
        )}

        {showWork && (
          <div className="coach-work-body">
            <p className="coach-work-intro">
              A passage to annotate, an essay you're shaping, a mark scheme to work against.
              Or a PDF or photo of a page you've already marked up, and I'll look at your
              annotations and help you sharpen them. Paste it or drop a file. The pen stays yours.
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

            {attachments.length > 0 && (
              <div className="coach-thumbs">
                {attachments.map((att, i) => (
                  <div className="coach-thumb" key={`${att.name}-${i}`}>
                    {att.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={att.dataUrl} alt={att.name} />
                    ) : (
                      <div className="coach-thumb-pdf">
                        <span className="coach-thumb-pdf-tag">PDF</span>
                        <span className="coach-thumb-pdf-name">{att.name}</span>
                      </div>
                    )}
                    <button
                      className="coach-thumb-remove"
                      onClick={() => removeAttachment(i)}
                      aria-label={`Remove ${att.name}`}
                    >
                      ×
                    </button>
                  </div>
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

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Splits a data URL (data:image/png;base64,AAAA...) into the pieces the API
// wants, tagged with its kind. Returns null for anything that isn't a base64
// data URL.
function toAttachmentPayload(
  att: Attachment
): { kind: "image" | "pdf"; mediaType: string; data: string } | null {
  const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { kind: att.kind, mediaType: match[1], data: match[2] };
}

function workSummary(
  fileNames: string[],
  attachments: Attachment[],
  material: string
): string {
  const parts: string[] = [];
  if (fileNames.length > 0) parts.push(fileNames.join(", "));
  const images = attachments.filter((a) => a.kind === "image").length;
  const pdfs = attachments.filter((a) => a.kind === "pdf").length;
  if (images > 0) parts.push(`${images} ${images === 1 ? "image" : "images"}`);
  if (pdfs > 0) parts.push(`${pdfs} PDF${pdfs === 1 ? "" : "s"}`);
  if (parts.length === 0 && material.trim().length > 0) parts.push("pasted text");
  return parts.join(" · ") || "your work";
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
