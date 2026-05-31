-- Schema for Exam Practice. Run this once against the Neon database
-- after provisioning via Vercel's storage integration (custom prefix POSTGRES_).
--
-- Apply it via the Neon SQL editor, or:
--   psql "$POSTGRES_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT,
  spec_text TEXT NOT NULL,
  paper_text TEXT NOT NULL,
  mark_scheme_text TEXT NOT NULL,
  parsed_structure JSONB NOT NULL,
  total_marks INTEGER
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES papers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_name TEXT,
  total_minutes INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  timer_state JSONB NOT NULL DEFAULT '{"elapsed_seconds": 0, "paused": true}'::jsonb,
  submitted_at TIMESTAMPTZ,
  marking_results JSONB,
  results_html TEXT
);

CREATE INDEX IF NOT EXISTS practice_sessions_paper_id_idx ON practice_sessions (paper_id);
CREATE INDEX IF NOT EXISTS practice_sessions_submitted_at_idx ON practice_sessions (submitted_at);
