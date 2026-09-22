import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { RATE_PENCE_PER_HOUR } from "./piggy";

/* Ported from Elena's Piggy Bank. Separate from lib/db.ts so one app's queries
   cannot break another's. Same POSTGRES_URL, same driver, no new dependency.

   PIGGY_USER_ID is a partition key. It is fixed here in code rather than read
   from the environment on purpose. Elena's copy reads DOODLE_USER_ID and falls
   back to "elena", and the two apps may share a database. A hard-coded "izzie"
   cannot be pointed at her rows by a stray environment variable. Every query
   below filters on it, including the payday claim. */
export const PIGGY_USER_ID = "izzie";

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

export interface PiggyEntry {
  id: string;
  /** YYYY-MM-DD, the day where she is. */
  entryDate: string;
  mins: number;
}

export interface PiggyState {
  /** Everything not yet paid for, newest first. */
  open: PiggyEntry[];
  /** Days worked recently, paid or not, so the streak survives a payday. */
  recentDates: string[];
  /** Sum of every payout ever made. */
  lifetimePence: number;
}

/** How far back the streak can look. */
const RECENT_DAYS = 40;

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Postgres returns a date column as a Date or a string; we want the key back unchanged. */
function dateKey(v: unknown): string {
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    return [
      v.getUTCFullYear(),
      String(v.getUTCMonth() + 1).padStart(2, "0"),
      String(v.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }
  return "";
}

export async function getState(): Promise<PiggyState> {
  const sql = client();
  const [open, recent, paid] = (await Promise.all([
    sql`
      SELECT id, entry_date::text AS entry_date, mins
      FROM piggy_entry
      WHERE user_id = ${PIGGY_USER_ID} AND payout_id IS NULL
      ORDER BY entry_date DESC, created_at DESC
    `,
    sql`
      SELECT DISTINCT entry_date::text AS entry_date
      FROM piggy_entry
      WHERE user_id = ${PIGGY_USER_ID}
        AND entry_date >= CURRENT_DATE - ${RECENT_DAYS}::int
      ORDER BY entry_date DESC
    `,
    sql`
      SELECT COALESCE(SUM(amount_pence), 0)::int AS total
      FROM piggy_payout
      WHERE user_id = ${PIGGY_USER_ID}
    `,
  ])) as Record<string, unknown>[][];

  return {
    open: open.map((r) => ({
      id: r.id as string,
      entryDate: dateKey(r.entry_date),
      mins: r.mins as number,
    })),
    recentDates: recent.map((r) => dateKey(r.entry_date)),
    lifetimePence: (paid[0]?.total as number) ?? 0,
  };
}

export async function addEntry(entryDate: string, mins: number): Promise<PiggyEntry> {
  const sql = client();
  const entry: PiggyEntry = { id: id("pe"), entryDate, mins };
  await sql`
    INSERT INTO piggy_entry (id, user_id, entry_date, mins)
    VALUES (${entry.id}, ${PIGGY_USER_ID}, ${entryDate}::date, ${mins})
  `;
  return entry;
}

/**
 * Undo. Only ever touches an entry that has not been paid for, so a mistyped
 * number can be taken back and a settled week cannot be edited after the fact.
 */
export async function deleteOpenEntry(entryId: string): Promise<boolean> {
  const sql = client();
  const rows = (await sql`
    DELETE FROM piggy_entry
    WHERE id = ${entryId} AND user_id = ${PIGGY_USER_ID} AND payout_id IS NULL
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

export interface Payout {
  id: string;
  mins: number;
  amountPence: number;
}

/**
 * Pay out everything outstanding, in one transaction.
 *
 * Elena's version runs this as an interactive transaction and does the sum in
 * JavaScript between statements. The Neon HTTP driver used here sends a
 * transaction as a single batch, so nothing can run in between. The sum moves
 * into SQL instead, using the same RATE_PENCE_PER_HOUR passed in as a
 * parameter. At 200p an hour, mins * 200 / 60 never lands on a half, so
 * Postgres ROUND and Math.round cannot disagree.
 *
 * The order is the same as Elena's and for the same reasons:
 *   1. Write the payout row at zero, because entries carry a foreign key to it.
 *   2. Claim every unpaid entry in one UPDATE. WHERE payout_id IS NULL can only
 *      match each row once, so a second Payday arriving at the same moment
 *      waits on the row locks, then claims nothing.
 *   3. Write the total onto the payout from the minutes actually claimed.
 *   4. If nothing was claimed, delete the empty payout.
 *   5. Read back what was written.
 *
 * Nothing the browser sends is trusted with money.
 */
export async function payday(): Promise<Payout | null> {
  const sql = client();
  const payoutId = id("po");

  const results = (await sql.transaction([
    sql`
      INSERT INTO piggy_payout (id, user_id, mins, amount_pence)
      VALUES (${payoutId}, ${PIGGY_USER_ID}, 0, 0)
    `,
    sql`
      UPDATE piggy_entry
      SET payout_id = ${payoutId}
      WHERE user_id = ${PIGGY_USER_ID} AND payout_id IS NULL
    `,
    sql`
      UPDATE piggy_payout p
      SET mins = t.mins,
          amount_pence = ROUND(t.mins * ${RATE_PENCE_PER_HOUR}::numeric / 60)::int
      FROM (
        SELECT COALESCE(SUM(mins), 0)::int AS mins
        FROM piggy_entry
        WHERE payout_id = ${payoutId} AND user_id = ${PIGGY_USER_ID}
      ) t
      WHERE p.id = ${payoutId}
    `,
    sql`
      DELETE FROM piggy_payout
      WHERE id = ${payoutId} AND mins = 0
    `,
    sql`
      SELECT mins, amount_pence
      FROM piggy_payout
      WHERE id = ${payoutId}
    `,
  ])) as Record<string, unknown>[][];

  const row = results[4]?.[0];
  if (!row) return null;
  return {
    id: payoutId,
    mins: row.mins as number,
    amountPence: row.amount_pence as number,
  };
}

/** True when the tables have not been created yet. */
export function isMissingTable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; sourceError?: { code?: string } };
  return e.code === "42P01" || e.sourceError?.code === "42P01";
}
