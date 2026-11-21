/**
 * Smoke: late guess within accept grace is stored; after grace it is rejected.
 * Run: node scripts/smoke-guess-grace.mjs
 */
import { createRoom, joinRoom, hostAction, submitGuess, getRoom, listGuesses, GUESS_ACCEPT_GRACE_MS, GuessError, buildRoomView } from "../src/lib/game.ts";

async function main() {
  process.env.DATABASE_URL = ""; // force PGlite

  const { code, hostToken } = await createRoom({ timerSeconds: 15 });
  const { playerId } = await joinRoom(code, "Ana");
  await hostAction(code, hostToken, "start");

  let room = await getRoom(code);
  if (!room?.round_ends_at) throw new Error("missing round_ends_at");

  // Force ends_at into the past but still inside grace.
  const past = new Date(Date.now() - 800).toISOString();
  const { sql } = await import("../src/lib/db.ts");
  await sql(
    "update rooms set round_ends_at = $2, round_started_at = $3 where code = $1",
    [code, past, new Date(Date.now() - 15800).toISOString()],
  );

  room = await getRoom(code);
  const view = await buildRoomView(code);
  if (view?.phase !== "guessing") {
    throw new Error(`expected guessing during grace, got ${view?.phase}`);
  }

  const productId = room.product_order[room.product_index];
  const amount = room.options[0];
  const ack = await submitGuess(code, playerId, amount);
  if (!ack.accepted) throw new Error("expected accepted");

  const guesses = await listGuesses(code, productId);
  if (guesses.length !== 1) throw new Error("guess not stored");

  // Idempotent retry
  const ack2 = await submitGuess(code, playerId, amount);
  if (!ack2.accepted) throw new Error("retry should ack");

  // Move past grace → expire on poll
  const expired = new Date(Date.now() - GUESS_ACCEPT_GRACE_MS - 500).toISOString();
  await sql("update rooms set round_ends_at = $2 where code = $1", [
    code,
    expired,
  ]);

  const { playerId: lateId } = await joinRoom(code, "Beto");
  // Need another room still guessing — reopen timing on same room after expire
  // First expire via buildRoomView
  const closed = await buildRoomView(code);
  if (closed?.phase !== "revealed") {
    throw new Error(`expected revealed after grace, got ${closed?.phase}`);
  }

  let rejected = false;
  try {
    await submitGuess(code, lateId, amount);
  } catch (e) {
    if (e instanceof GuessError && (e.reason === "closed" || e.reason === "too_late")) {
      rejected = true;
    } else {
      throw e;
    }
  }
  if (!rejected) throw new Error("expected reject after close");

  console.log(
    JSON.stringify({
      ok: true,
      graceMs: GUESS_ACCEPT_GRACE_MS,
      acceptedDuringGrace: true,
      idempotentRetry: true,
      rejectedAfterClose: true,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
