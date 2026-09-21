"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MINUTES,
  FIRST_STEP_SECONDS,
  PARKED_KEY,
  PARKED_LIMIT,
  STEPS,
  SUBJECTS,
  TIME_CHOICES,
  WAY_IN_NAME,
} from "@/lib/wayInConfig";
import type { WayInLanding, WayInQuestion, WayInResult, WayInStage } from "@/lib/wayInPrompt";
import styles from "./wayIn.module.css";

type Turn = { role: "user" | "assistant"; content: string };
type Parked = { text: string; interest: string; task: string; date: string };
type Phase = "start" | "talking" | "landed" | "paused";

const FAILED = "That didn't come through. Try again.";

// The first three beats of the progress path come from the stage the model
// returns. The fourth lights on landing.
const STAGE_STEP: Record<WayInStage, number> = { meet: 0, overlap: 1, cross: 2 };

// Assistant turns are stored as the JSON the model returned, because that is
// what gets replayed to it. Reading one back for display means parsing it.
function asQuestion(content: string): WayInQuestion | null {
  try {
    const parsed = JSON.parse(content) as WayInResult;
    return parsed && parsed.type === "question" ? parsed : null;
  } catch {
    return null;
  }
}

function clock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// The same soft sine chime the generated study guides use, rather than an alarm.
function chime() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch {}
}

export default function Page() {
  const [interest, setInterest] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>("start");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [landing, setLanding] = useState<WayInLanding | null>(null);
  const [pauseMessage, setPauseMessage] = useState("");

  const [parked, setParked] = useState<Parked[]>([]);
  const [showParked, setShowParked] = useState(false);
  const [copied, setCopied] = useState(false);

  const [timerOn, setTimerOn] = useState(false);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(FIRST_STEP_SECONDS);

  // Enter sends on a desktop keyboard. On a tablet or phone it makes a new
  // line, where there is no Shift to hold.
  const [enterSends, setEnterSends] = useState(false);

  const pending = useRef<{ history: Turn[]; skip: boolean } | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PARKED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setParked(parsed as Parked[]);
      }
    } catch {}
    try {
      setEnterSends(window.matchMedia("(pointer: fine)").matches);
    } catch {}
  }, []);

  useEffect(() => {
    if (phase === "talking" && !sending) answerRef.current?.focus();
  }, [phase, sending, turns.length]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && secondsLeft === 0) {
      setRunning(false);
      chime();
    }
  }, [running, secondsLeft]);

  function savePark(result: WayInLanding) {
    if (!result.parked) return;
    const item: Parked = {
      text: result.parked,
      interest: interest.trim(),
      task: task.trim(),
      date: new Date().toISOString(),
    };
    const next = [item, ...parked].slice(0, PARKED_LIMIT);
    setParked(next);
    try {
      localStorage.setItem(PARKED_KEY, JSON.stringify(next));
    } catch {}
  }

  function handle(result: WayInResult, history: Turn[]) {
    if (result.type === "pause") {
      setPauseMessage(result.message);
      setPhase("paused");
      return;
    }
    if (result.type === "landing") {
      setLanding(result);
      savePark(result);
      setTimerOn(false);
      setRunning(false);
      setSecondsLeft(FIRST_STEP_SECONDS);
      setPhase("landed");
      return;
    }
    setTurns([...history, { role: "assistant", content: JSON.stringify(result) }]);
  }

  async function send(history: Turn[], skip: boolean) {
    pending.current = { history, skip };
    setSending(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/way-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest,
          subject,
          task,
          minutes: minutes ?? DEFAULT_MINUTES,
          history,
          skip,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.result) {
        setErrorMsg(typeof json.error === "string" && json.error ? json.error : FAILED);
        return;
      }
      handle(json.result as WayInResult, history);
    } catch {
      setErrorMsg(FAILED);
    } finally {
      setSending(false);
    }
  }

  function begin() {
    if (!interest.trim() || !task.trim()) return;
    setTurns([]);
    setAnswer("");
    setLanding(null);
    setPauseMessage("");
    setErrorMsg("");
    setPhase("talking");
    send([], false);
  }

  function submitAnswer() {
    const text = answer.trim();
    if (!text || sending) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setAnswer("");
    send(next, false);
  }

  function skipToTask() {
    if (sending) return;
    send(turns, true);
  }

  function retry() {
    const last = pending.current;
    if (!last || sending) return;
    send(last.history, last.skip);
  }

  function backToStart() {
    setPhase("start");
    setTurns([]);
    setAnswer("");
    setLanding(null);
    setPauseMessage("");
    setErrorMsg("");
    setRunning(false);
    setTimerOn(false);
    setSecondsLeft(FIRST_STEP_SECONDS);
  }

  function startAnother() {
    backToStart();
    setInterest("");
    setSubject(null);
    setTask("");
    setMinutes(null);
  }

  async function copyParked() {
    if (!landing) return;
    try {
      await navigator.clipboard.writeText(landing.parked);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  function startTimer() {
    setSecondsLeft(FIRST_STEP_SECONDS);
    setTimerOn(true);
    setRunning(true);
  }

  const lastTurn = turns[turns.length - 1];
  const current = lastTurn && lastTurn.role === "assistant" ? asQuestion(lastTurn.content) : null;
  const earlier = current ? turns.slice(0, -1) : turns;
  const currentStep = phase === "landed" ? 3 : current ? STAGE_STEP[current.stage] : 0;
  const canStart = interest.trim().length > 0 && task.trim().length > 0;

  return (
    <div className="app">
      <div className="brand">
        <div className="brand-mark">For Izzie · Help!</div>
        <h1>{WAY_IN_NAME}</h1>
        <div className="tagline">A few questions from the thing you are thinking about to the thing you have to do.</div>
        <div className="brand-back"><a href="/">← back to chooser</a></div>
      </div>

      {phase === "start" && (
        <>
          <div className="card">
            <p className={styles.intro}>
              Tell me what&apos;s on your mind and what you need to do. I&apos;ll ask a few questions
              that get you from one to the other.
            </p>

            <div className={styles.field}>
              <div className={styles.label}>What&apos;s on your mind?</div>
              <input
                className={styles.input}
                type="text"
                placeholder="The thing you'd rather be thinking about"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <div className={styles.label}>
                Subject<span className={styles.optional}>optional</span>
              </div>
              <div className={styles.chips}>
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.chip}${subject === s ? ` ${styles.chipOn}` : ""}`}
                    onClick={() => setSubject(subject === s ? null : s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.label}>What do you need to do?</div>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. plan the labelling essay"
                value={task}
                onChange={(e) => setTask(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.label}>
                How long have you got?<span className={styles.optional}>optional</span>
              </div>
              <div className={styles.chips}>
                {TIME_CHOICES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    className={`${styles.chip}${minutes === t.minutes ? ` ${styles.chipOn}` : ""}`}
                    onClick={() => setMinutes(minutes === t.minutes ? null : t.minutes)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button className="generate" disabled={!canStart} onClick={begin}>
            Start
          </button>

          {parked.length > 0 && (
            <div className={styles.parkedList}>
              <button className={styles.parkedToggle} onClick={() => setShowParked(!showParked)}>
                <span>Parked earlier</span>
                <span className={styles.parkedChevron}>{showParked ? "−" : "+"}</span>
              </button>
              {showParked && (
                <div>
                  {parked.map((p, i) => (
                    <div className={styles.parkedItem} key={`${p.date}-${i}`}>
                      <p className={styles.parkedItemText}>{p.text}</p>
                      <div className={styles.parkedItemMeta}>
                        {[formatDate(p.date), p.task].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {phase === "talking" && (
        <>
          <div className={styles.path}>
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`${styles.step}${i === currentStep ? ` ${styles.stepNow}` : ""}${
                  i < currentStep ? ` ${styles.stepDone}` : ""
                }`}
              >
                <span className={styles.dot} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="card">
            {earlier.length > 0 && (
              <div className={styles.earlier}>
                {earlier.map((t, i) => {
                  if (t.role === "assistant") {
                    const q = asQuestion(t.content);
                    return q ? (
                      <p className={styles.earlierQ} key={i}>
                        {q.question}
                      </p>
                    ) : null;
                  }
                  return (
                    <p className={styles.earlierA} key={i}>
                      {t.content}
                    </p>
                  );
                })}
              </div>
            )}

            {current ? (
              <>
                {current.react && <p className={styles.react}>{current.react}</p>}
                <p className={styles.question}>{current.question}</p>
              </>
            ) : (
              !errorMsg && (
                <div className={styles.waiting}>
                  <span />
                  <span />
                  <span />
                </div>
              )
            )}

            {current && sending && (
              <div className={styles.waiting}>
                <span />
                <span />
                <span />
              </div>
            )}

            {current && !sending && (
              <div className={styles.answerRow}>
                <textarea
                  ref={answerRef}
                  className={styles.answer}
                  placeholder="Type your answer..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (enterSends && e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitAnswer();
                    }
                  }}
                  rows={2}
                />
                <button className={styles.send} onClick={submitAnswer} disabled={!answer.trim()}>
                  Send
                </button>
              </div>
            )}

            {errorMsg && (
              <div className={`error ${styles.errorRow}`}>
                {errorMsg}
                <button className={styles.retry} onClick={retry} disabled={sending}>
                  try again
                </button>
              </div>
            )}
          </div>

          <div className={styles.skipRow}>
            <button className={styles.skip} onClick={skipToTask} disabled={sending}>
              Take me to the task
            </button>
          </div>
        </>
      )}

      {phase === "landed" && landing && (
        <>
          <div className={styles.path}>
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`${styles.step}${i === 3 ? ` ${styles.stepNow}` : ` ${styles.stepDone}`}`}
              >
                <span className={styles.dot} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {(landing.parked || landing.link) && (
            <div className="card">
              {landing.parked && (
                <div className={styles.block}>
                  <div className={styles.blockLabel}>Parked for later</div>
                  <div className={styles.parkedRow}>
                    <p className={styles.blockText}>{landing.parked}</p>
                    <button className={styles.copy} onClick={copyParked}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              {landing.link && (
                <div className={styles.block}>
                  <div className={styles.blockLabel}>The link</div>
                  <p className={styles.blockText}>{landing.link}</p>
                </div>
              )}
            </div>
          )}

          <div className={styles.startHere}>
            <div className={styles.startHereLabel}>Start here</div>
            <p className={styles.startHereText}>{landing.first_step}</p>
            <div className={styles.timerRow}>
              {!timerOn ? (
                <button className={styles.timerBtn} onClick={startTimer}>
                  5 minute timer
                </button>
              ) : (
                <>
                  <div
                    className={`${styles.timerDisplay}${secondsLeft === 0 ? ` ${styles.timerDone}` : ""}`}
                  >
                    {secondsLeft === 0 ? "Done" : clock(secondsLeft)}
                  </div>
                  {secondsLeft === 0 ? (
                    <button className={styles.timerBtn} onClick={startTimer}>
                      Again
                    </button>
                  ) : (
                    <button className={styles.timerBtn} onClick={() => setRunning(!running)}>
                      {running ? "Pause" : "Resume"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {landing.next_step && (
            <div className="card">
              <div className={styles.block}>
                <div className={styles.blockLabel}>Then</div>
                <p className={styles.blockText}>{landing.next_step}</p>
              </div>
            </div>
          )}

          <div className={styles.landingActions}>
            <button className={styles.action} onClick={backToStart}>
              Done
            </button>
            <button className={styles.action} onClick={startAnother}>
              Start another
            </button>
          </div>
        </>
      )}

      {phase === "paused" && (
        <div className="card">
          <div className={styles.pause}>
            <p className={styles.pauseText}>{pauseMessage}</p>
            <button className={styles.action} onClick={backToStart}>
              Back to start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}
