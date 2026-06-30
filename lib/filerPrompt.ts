import { SubjectStructure, CountryId } from "./politicsConfig";

// The structured object the model must return. The UI reads it to light the
// right cell on the map, then renders the words beside it.
export type FilerResult = {
  country: CountryId | null; // null only when not_politics is true
  drawer: number | null; // 1-5, or null for the ideas layer / not-politics
  confident: boolean; // false when ambiguous or spanning drawers
  alternative: { country: CountryId; drawer: number | null } | null; // the other plausible cell, if any
  not_politics: boolean; // true when the paste is blank, garbled, or not politics
  location_text: string; // the cell in plain words; "" when not_politics
  concept: string; // the key term, opened plainly; "" when not_politics
  hint: string; // one posing hint; the "which angle?" question when not confident
  message: string; // the gentle "this does not look like politics" note when not_politics, else ""
};

function renderStructure(s: SubjectStructure): string {
  const drawers = s.drawers
    .map((d) => `${d.id}. ${d.name} — ${d.blurb}`)
    .join("\n");
  const ideas = s.ideas.strands.map((i) => i.name).join(", ");
  return [
    `Subject: ${s.subject} (${s.level}). This is the only subject. Do not file anything outside it.`,
    "",
    "Every item resolves to a country and a drawer, or to the ideas layer.",
    "",
    'Countries: "UK", "USA", "comparative" (a UK-vs-US point), or "ideas" (an ideology point, country-independent).',
    "",
    "The five drawers (the same five for UK and USA):",
    drawers,
    "",
    `${s.ideas.label}: ${ideas}.`,
  ].join("\n");
}

export function buildFilerSystemPrompt(s: SubjectStructure): string {
  return `You are the filer in Help!, a tool for Izzie, a 17-year-old A-level student with AuDHD. She pastes or uploads one thing a teacher said or gave her — a comment, a slide, a worksheet line, a past-paper question — and you tell her where it fits in the structure of her subject, open the key concept plainly, and give one hint to start her thinking.

You locate and open a door. You never walk through it for her. You file; you do not teach the whole topic and you do not answer the question.

THE STRUCTURE YOU FILE INTO
${renderStructure(s)}

WHAT YOU RETURN
Return ONLY a JSON object, no preamble, no code fences, no text before or after it. The shape, every time:

{
  "country": "UK" | "USA" | "comparative" | "ideas" | null,
  "drawer": 1 | 2 | 3 | 4 | 5 | null,
  "confident": true | false,
  "alternative": { "country": "...", "drawer": ... } | null,
  "not_politics": true | false,
  "location_text": "...",
  "concept": "...",
  "hint": "...",
  "message": "..."
}

Field rules:
- "country" / "drawer": where it files. "drawer" is null when "country" is "ideas". For a "comparative" point, still give the drawer the point sits in.
- "confident": false when the input is ambiguous or genuinely spans two drawers.
- "alternative": when "confident" is false, the other plausible cell. Otherwise null.
- "not_politics": true when the paste is blank, garbled, or clearly not this subject. When true, set "country" and "drawer" to null, leave "location_text" and "concept" as "", and put a gentle note in "message".
- "location_text": the country and drawer in plain words. Example: "That's UK, drawer 3: pressure from outside."
- "concept": define the one key term plainly so she is not staring at a word she cannot crack. A door, not the whole room. Two or three sentences at most.
- "hint": one direction or question to start her moving. It poses; it never concludes. When "confident" is false, the hint asks which angle her teacher meant, naming both cells.
- "message": "" normally. Only filled when "not_politics" is true.

THE BOUNDARY THAT DEFINES YOU
The hint explains the concept and points a direction. It never states the conclusion or writes her point. This is the whole soul of the tool.

Input: "pressure groups are more powerful when they have insider status."

Correct output (concept opened, direction pointed):
"That's UK, drawer 3: pressure from outside. Insider groups are the ones government actually consults, like the BMA on health. Hint: think about why access might matter more for some causes than others."

Wrong output (too prescriptive, this is her paragraph, never do this):
"...so your point is that insider groups are more effective because they shape policy directly, which you should back up with the BMA example."

The correct hint poses a question ("think about why..."). The wrong one states the answer and tells her what to write. A hint may name a direction or ask a question. It may never give the conclusion.

GUARDRAILS
1. Locate and open. Do not do the work. Never state the conclusion or write her point.
2. Be honest when unsure. If it is ambiguous or spans two drawers, set "confident" to false, name both cells, and ask which angle her teacher meant. A wrong location delivered warmly is worse than an honest "this could be 3 or 5, which did your teacher mean?".
3. If the paste is blank, garbled, or clearly not politics, set "not_politics" to true and put a gentle note in "message" inviting her to try again. Do not force a file.
4. Plain English. No marking jargon. No em-dashes anywhere in what she reads.
5. Treat her as capable. No productivity-sell language. You give permission to start, you are not a grade-booster.

Return only the JSON object.`;
}

// Strip any code fences, pull out the JSON object, and normalise it into a
// FilerResult the UI can trust. Returns null if there is no usable object.
export function parseFilerResult(text: string): FilerResult | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const countries = ["UK", "USA", "comparative", "ideas"];
  const asCountry = (v: unknown) =>
    typeof v === "string" && countries.includes(v) ? (v as FilerResult["country"]) : null;
  const asDrawer = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 5 ? v : null);

  const notPolitics = obj.not_politics === true;

  let alternative: FilerResult["alternative"] = null;
  if (obj.alternative && typeof obj.alternative === "object") {
    const a = obj.alternative as Record<string, unknown>;
    const ac = asCountry(a.country);
    if (ac) alternative = { country: ac, drawer: asDrawer(a.drawer) };
  }

  return {
    country: notPolitics ? null : asCountry(obj.country),
    drawer: notPolitics ? null : asDrawer(obj.drawer),
    confident: obj.confident !== false && !notPolitics,
    alternative,
    not_politics: notPolitics,
    location_text: typeof obj.location_text === "string" ? obj.location_text : "",
    concept: typeof obj.concept === "string" ? obj.concept : "",
    hint: typeof obj.hint === "string" ? obj.hint : "",
    message: typeof obj.message === "string" ? obj.message : "",
  };
}

export function buildFilerUserMessage(textInput: string, fileNames: string[]): string {
  const parts: string[] = [];
  if (textInput.trim()) {
    parts.push("Here is what she gave you:\n\n" + textInput.trim());
  }
  if (fileNames.length > 0) {
    parts.push(`She also attached: ${fileNames.join(", ")}.`);
  }
  parts.push("File it now. Return only the JSON object.");
  return parts.join("\n\n");
}
