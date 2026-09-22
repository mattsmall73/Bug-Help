-- Piggy Bank: the two tables it needs.
--
-- Paste this into the Neon console SQL editor and run it. Safe to run again:
-- every statement is guarded, so a second run changes nothing.
--
-- Ported unchanged from Elena's app, so if the two apps ever share a Neon
-- database the tables line up and a second run of this changes nothing. The
-- apps keep apart by user_id: this one always writes 'izzie' (fixed in
-- lib/piggy-db.ts), Elena's writes 'elena'. Run the check at the bottom
-- before first use.
--
-- Nothing Exam Practice uses (papers, practice_sessions) is touched.

BEGIN;

-- One payout, written when she presses Payday.
--
-- mins and amount_pence are both stored. The amount is worked out once, from
-- the minutes, at the moment of paying, so a later change to the rate cannot
-- silently restate what she was actually handed. Pence as an integer, never a
-- float: money that has been through a float is money that eventually ends in
-- a penny nobody can account for.
CREATE TABLE IF NOT EXISTS piggy_payout (
  id            text PRIMARY KEY,
  user_id       text NOT NULL,
  mins          int NOT NULL,
  amount_pence  int NOT NULL,
  paid_at       timestamptz NOT NULL DEFAULT NOW()
);

-- One session of revision, on a real date.
--
-- entry_date is a date rather than a timestamp, and it is the date where she
-- is rather than where the server is. The server runs in UTC, so half past
-- midnight in British Summer Time would otherwise land on the day before and
-- in the wrong week.
--
-- payout_id is NULL until Payday claims it. That is what makes "not yet paid
-- for" a fact about the row rather than something worked out from dates, and
-- it is why Payday can archive instead of deleting: the lifetime total is a
-- sum over payouts, not a counter that drifts.
--
-- ON DELETE SET NULL rather than CASCADE, which is the one place this departs
-- from how the revision tables are keyed. An answer cannot outlive its sheet,
-- so cascading there is right. Here the entry is the record of work she
-- actually did and the payout is an event that happened to it afterwards.
-- Deleting a payout should hand those hours back as unpaid, not destroy them.
CREATE TABLE IF NOT EXISTS piggy_entry (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  entry_date  date NOT NULL,
  mins        int NOT NULL,
  payout_id   text REFERENCES piggy_payout (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

-- The two reads the app makes: everything not yet paid for, and the days
-- worked recently for the streak.
CREATE INDEX IF NOT EXISTS piggy_entry_unpaid
  ON piggy_entry (user_id, payout_id);
CREATE INDEX IF NOT EXISTS piggy_entry_by_date
  ON piggy_entry (user_id, entry_date);

COMMIT;

-- Check it worked. Expect five rows for piggy_payout, six for piggy_entry,
-- one foreign key on piggy_entry with confdeltype 'n' (set null), and the two
-- indexes.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('piggy_entry', 'piggy_payout')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS child_table, conname, confdeltype
FROM pg_constraint
WHERE conrelid = 'piggy_entry'::regclass
  AND contype = 'f';

SELECT indexname FROM pg_indexes
WHERE tablename = 'piggy_entry' ORDER BY indexname;

-- Separation check. Lists every user_id in the piggy tables with a row count.
-- On a database only this app uses, expect nothing or only 'izzie'. If
-- 'elena' appears, the database is shared with Elena's app. That is fine as
-- long as 'izzie' and 'elena' are separate rows here, which is what keeps her
-- money apart from Izzie's. Anything else showing up needs a look before use.
SELECT 'piggy_entry' AS tbl, user_id, COUNT(*) FROM piggy_entry GROUP BY user_id
UNION ALL
SELECT 'piggy_payout', user_id, COUNT(*) FROM piggy_payout GROUP BY user_id
ORDER BY tbl, user_id;
