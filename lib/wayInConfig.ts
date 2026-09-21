// Way In: the tool for the free period that starts with her head full of
// something else. Everything here is the knobs, not the voice; the voice lives
// in lib/wayInPrompt.ts.

// Working name. Izzie may rename it, so the name lives in exactly one place.
export const WAY_IN_NAME = "Way In";

// Most questions she will ever be asked before the tool lands her on a first
// step. Enforced on the server in app/api/way-in/route.ts, not left to the
// prompt to remember.
export const QUESTION_CAP = 5;

// Used when she does not pick a time chip.
export const DEFAULT_MINUTES = 45;

export const SUBJECTS = ["Sociology", "Politics", "English Literature", "Other"] as const;

export const TIME_CHOICES: { label: string; minutes: number }[] = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hour", minutes: 60 },
  { label: "Longer", minutes: 90 },
];

// The four beats of the progress path. The first three map to the stages the
// model returns; the last lights on landing.
export const STEPS = ["Your thing", "Overlap", "Your task", "First step"] as const;

// Parked thoughts live in the browser only. No server storage in this version.
export const PARKED_KEY = "wayin.parked";
export const PARKED_LIMIT = 20;

// The five minute timer on the landing screen.
export const FIRST_STEP_SECONDS = 5 * 60;
