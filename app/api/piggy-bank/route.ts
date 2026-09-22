import {
  addEntry,
  deleteOpenEntry,
  getState,
  isMissingTable,
} from "@/lib/piggy-db";
import {
  MAX_ENTRY_MINS,
  MIN_ENTRY_MINS,
  RATE_PENCE_PER_HOUR,
  addDays,
  isDateKey,
  localDateKey,
} from "@/lib/piggy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notSetUp() {
  console.error(
    "[piggy-bank] piggy_entry or piggy_payout is missing. " +
      "Run schema-piggy-bank.sql to create them.",
  );
  return Response.json(
    { error: "The piggy bank isn't switched on here yet." },
    { status: 503 },
  );
}

function wentWrong(err: unknown) {
  // The message stays server side. A Postgres error names tables, columns and
  // sometimes the connection.
  console.error("[piggy-bank] request failed:", err);
  return Response.json(
    { error: "Something went wrong at our end. Try that again." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const state = await getState();
    return Response.json({ ...state, ratePencePerHour: RATE_PENCE_PER_HOUR });
  } catch (err) {
    if (isMissingTable(err)) return notSetUp();
    return wentWrong(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { entryDate?: unknown; mins?: unknown };

    const mins = typeof body.mins === "number" ? Math.round(body.mins) : NaN;
    if (!Number.isFinite(mins) || mins < MIN_ENTRY_MINS) {
      return Response.json({ error: "Pick how long first." }, { status: 400 });
    }
    if (mins > MAX_ENTRY_MINS) {
      return Response.json(
        { error: "Ten hours in one go? Nice try." },
        { status: 400 },
      );
    }

    /* The day comes from her device, because the server runs in UTC and would
       put half past midnight in the summer on the day before. It is still
       checked here: a date only has to be real and roughly now, and one day of
       slack either side covers every timezone she could plausibly be in. */
    const today = localDateKey();
    const { entryDate } = body as { entryDate?: unknown };
    if (!isDateKey(entryDate)) {
      return Response.json({ error: "That date isn't a date." }, { status: 400 });
    }
    if (entryDate > addDays(today, 1) || entryDate < addDays(today, -400)) {
      return Response.json(
        { error: "That date is a long way from today." },
        { status: 400 },
      );
    }

    const entry = await addEntry(entryDate, mins);
    return Response.json({ entry });
  } catch (err) {
    if (isMissingTable(err)) return notSetUp();
    return wentWrong(err);
  }
}

/** Undo. The id comes from the open list, and only an unpaid entry can go. */
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) {
      return Response.json({ error: "Nothing to undo." }, { status: 400 });
    }
    const removed = await deleteOpenEntry(id);
    if (!removed) {
      return Response.json(
        { error: "That one has already been paid for." },
        { status: 409 },
      );
    }
    return Response.json({ ok: true });
  } catch (err) {
    if (isMissingTable(err)) return notSetUp();
    return wentWrong(err);
  }
}
