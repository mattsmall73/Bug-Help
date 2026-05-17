import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

function client(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "POSTGRES_URL is not set. Provision a Neon database via the Vercel storage integration (custom env prefix POSTGRES_), then redeploy."
    );
  }
  cached = neon(url);
  return cached;
}

export type ParsedQuestion = {
  number: string;
  text: string;
  marks: number;
  type?: string;
};

export type ParsedSection = {
  title: string;
  instructions?: string;
  suggested_minutes?: number;
  questions: ParsedQuestion[];
};

export type ParsedPaper = {
  paper_title: string;
  total_marks: number;
  sections: ParsedSection[];
};

export type TimerState = {
  elapsed_seconds: number;
  paused: boolean;
  last_started_at?: number | null;
};

export type Answers = Record<string, string>;

export type MarkedQuestion = {
  number: string;
  mark_awarded: number;
  mark_available: number;
  what_worked: string;
  what_the_scheme_wanted: string;
  next_step: string;
  closing_line?: string | null;
};

export type MarkingResults = {
  overall_summary: string;
  total_mark: number;
  total_available: number;
  headline_next_step: string;
  questions: MarkedQuestion[];
};

export type PaperRow = {
  id: string;
  created_at: string;
  title: string | null;
  spec_text: string;
  paper_text: string;
  mark_scheme_text: string;
  parsed_structure: ParsedPaper;
  total_marks: number | null;
};

export type PracticeSessionRow = {
  id: string;
  paper_id: string;
  created_at: string;
  updated_at: string;
  user_name: string | null;
  total_minutes: number;
  answers: Answers;
  timer_state: TimerState;
  submitted_at: string | null;
  marking_results: MarkingResults | null;
  results_html: string | null;
};

export async function createPaper(input: {
  title: string | null;
  spec_text: string;
  paper_text: string;
  mark_scheme_text: string;
  parsed_structure: ParsedPaper;
  total_marks: number | null;
}): Promise<string> {
  const sql = client();
  const rows = (await sql`
    INSERT INTO papers (title, spec_text, paper_text, mark_scheme_text, parsed_structure, total_marks)
    VALUES (${input.title}, ${input.spec_text}, ${input.paper_text}, ${input.mark_scheme_text}, ${JSON.stringify(input.parsed_structure)}::jsonb, ${input.total_marks})
    RETURNING id
  `) as { id: string }[];
  return rows[0].id;
}

export async function createSession(input: {
  paper_id: string;
  user_name: string | null;
  total_minutes: number;
}): Promise<string> {
  const sql = client();
  const rows = (await sql`
    INSERT INTO practice_sessions (paper_id, user_name, total_minutes)
    VALUES (${input.paper_id}, ${input.user_name}, ${input.total_minutes})
    RETURNING id
  `) as { id: string }[];
  return rows[0].id;
}

export async function getSessionWithPaper(
  session_id: string
): Promise<{ session: PracticeSessionRow; paper: PaperRow } | null> {
  const sql = client();
  const rows = (await sql`
    SELECT
      s.id, s.paper_id, s.created_at, s.updated_at, s.user_name, s.total_minutes,
      s.answers, s.timer_state, s.submitted_at, s.marking_results, s.results_html,
      p.id AS p_id, p.created_at AS p_created_at, p.title AS p_title,
      p.spec_text, p.paper_text, p.mark_scheme_text, p.parsed_structure, p.total_marks
    FROM practice_sessions s
    JOIN papers p ON p.id = s.paper_id
    WHERE s.id = ${session_id}
    LIMIT 1
  `) as any[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    session: {
      id: r.id,
      paper_id: r.paper_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user_name: r.user_name,
      total_minutes: r.total_minutes,
      answers: r.answers ?? {},
      timer_state: r.timer_state ?? { elapsed_seconds: 0, paused: true },
      submitted_at: r.submitted_at,
      marking_results: r.marking_results,
      results_html: r.results_html,
    },
    paper: {
      id: r.p_id,
      created_at: r.p_created_at,
      title: r.p_title,
      spec_text: r.spec_text,
      paper_text: r.paper_text,
      mark_scheme_text: r.mark_scheme_text,
      parsed_structure: r.parsed_structure,
      total_marks: r.total_marks,
    },
  };
}

export async function updateSessionProgress(input: {
  session_id: string;
  answers?: Answers;
  timer_state?: TimerState;
}): Promise<void> {
  const sql = client();
  if (input.answers !== undefined && input.timer_state !== undefined) {
    await sql`
      UPDATE practice_sessions
      SET answers = ${JSON.stringify(input.answers)}::jsonb,
          timer_state = ${JSON.stringify(input.timer_state)}::jsonb,
          updated_at = NOW()
      WHERE id = ${input.session_id} AND submitted_at IS NULL
    `;
  } else if (input.answers !== undefined) {
    await sql`
      UPDATE practice_sessions
      SET answers = ${JSON.stringify(input.answers)}::jsonb,
          updated_at = NOW()
      WHERE id = ${input.session_id} AND submitted_at IS NULL
    `;
  } else if (input.timer_state !== undefined) {
    await sql`
      UPDATE practice_sessions
      SET timer_state = ${JSON.stringify(input.timer_state)}::jsonb,
          updated_at = NOW()
      WHERE id = ${input.session_id} AND submitted_at IS NULL
    `;
  }
}

export async function submitSession(input: {
  session_id: string;
  marking_results: MarkingResults;
  results_html: string;
}): Promise<void> {
  const sql = client();
  await sql`
    UPDATE practice_sessions
    SET marking_results = ${JSON.stringify(input.marking_results)}::jsonb,
        results_html = ${input.results_html},
        submitted_at = NOW(),
        updated_at = NOW()
    WHERE id = ${input.session_id} AND submitted_at IS NULL
  `;
}

export async function getPaper(paper_id: string): Promise<PaperRow | null> {
  const sql = client();
  const rows = (await sql`
    SELECT id, created_at, title, spec_text, paper_text, mark_scheme_text, parsed_structure, total_marks
    FROM papers WHERE id = ${paper_id} LIMIT 1
  `) as PaperRow[];
  return rows[0] ?? null;
}
