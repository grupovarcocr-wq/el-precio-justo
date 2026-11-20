import { randomBytes } from "node:crypto";
import { sql } from "./db";
import {
  DEFAULT_TIMER_SECONDS,
  generatePriceOptions,
  getProductoById,
  PRODUCTOS,
  shuffleProductIds,
  speedPoints,
  TIMER_CHOICES,
  toPublicProducto,
  type PublicProducto,
} from "./productos";

export type Phase = "lobby" | "guessing" | "revealed" | "finished";

export type PlayerRow = {
  id: string;
  room_code: string;
  name: string;
  score: number;
};

export type GuessRow = {
  room_code: string;
  player_id: string;
  product_id: number;
  amount: number;
  answered_at: string | Date;
  points_awarded: number;
};

export type RoomRow = {
  code: string;
  host_token: string;
  phase: Phase;
  product_index: number;
  product_order: number[];
  timer_seconds: number;
  round_started_at: string | Date | null;
  round_ends_at: string | Date | null;
  options: number[];
};

export type GuessResult = {
  playerId: string;
  name: string;
  amount: number;
  correct: boolean;
  points: number;
  /** Kept for backwards UI compatibility; 0 if correct. */
  diff: number;
  winner: boolean;
};

export type RoomView = {
  code: string;
  phase: Phase;
  productIndex: number;
  productCount: number;
  /** True when the current round is the reserved sudden-death product. */
  isTiebreaker: boolean;
  product: PublicProducto | null;
  options: number[] | null;
  timerSeconds: number;
  roundEndsAt: string | null;
  roundStartedAt: string | null;
  serverNow: string;
  players: { id: string; name: string; score: number; hasGuessed: boolean }[];
  results: GuessResult[] | null;
  winners: string[] | null;
  isHost?: boolean;
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode(length = 4): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[bytes[i]! % CODE_CHARS.length];
  }
  return out;
}

export function makeId(): string {
  return randomBytes(12).toString("hex");
}

function clampTimer(seconds: number | undefined): number {
  if (
    typeof seconds === "number" &&
    (TIMER_CHOICES as readonly number[]).includes(seconds)
  ) {
    return seconds;
  }
  return DEFAULT_TIMER_SECONDS;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Normalize PG/PGlite integer[] (array or "{1,2,3}" string). */
function asIntArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  }
  if (typeof value === "string") {
    const inner = value.replace(/^\{/, "").replace(/\}$/, "").trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

function productOrderFor(room: RoomRow): number[] {
  if (Array.isArray(room.product_order) && room.product_order.length > 0) {
    return room.product_order;
  }
  return PRODUCTOS.map((p) => p.id);
}

/** Last shuffled product is held back for a possible tiebreaker. */
function mainRoundCount(order: number[]): number {
  return order.length >= 2 ? order.length - 1 : order.length;
}

function isTiebreakerIndex(order: number[], productIndex: number): boolean {
  return order.length >= 2 && productIndex === order.length - 1;
}

/** Two or more players share the highest score (including 0–0). */
export function topScoresTied(
  players: { score: number }[],
): boolean {
  if (players.length < 2) return false;
  const top = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === top).length >= 2;
}

async function finishRoom(code: string): Promise<void> {
  await sql(
    "update rooms set phase = 'finished', options = '{}', round_started_at = null, round_ends_at = null where code = $1",
    [code],
  );
}

/**
 * After a reveal (or skip), open the next product — or finish.
 * The last product in the shuffled order is reserved: it only opens
 * when the leaders are tied after the main rounds.
 */
async function advanceAfterRound(room: RoomRow): Promise<void> {
  const order = productOrderFor(room);
  const next = room.product_index + 1;

  if (next >= order.length) {
    await finishRoom(room.code);
    return;
  }

  if (isTiebreakerIndex(order, next)) {
    const players = await listPlayers(room.code);
    if (!topScoresTied(players)) {
      await finishRoom(room.code);
      return;
    }
  }

  await openRound(room, next);
}

export function currentProduct(room: RoomRow) {
  const order = productOrderFor(room);
  const id = order[room.product_index];
  if (id == null) return null;
  return getProductoById(id);
}

export async function createRoom(opts: {
  timerSeconds?: number;
} = {}): Promise<{ code: string; hostToken: string }> {
  const timerSeconds = clampTimer(opts.timerSeconds);
  const order = shuffleProductIds();

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    const hostToken = makeId();
    try {
      await sql(
        `insert into rooms
          (code, host_token, phase, product_index, product_order, timer_seconds, options)
         values ($1, $2, 'lobby', 0, $3, $4, '{}')`,
        [code, hostToken, order, timerSeconds],
      );
      return { code, hostToken };
    } catch {
      // collision — retry
    }
  }
  throw new Error("No se pudo crear la sala");
}

export async function getRoom(code: string): Promise<RoomRow | null> {
  const rows = await sql<RoomRow>(
    `select code, host_token, phase, product_index,
            coalesce(product_order, '{}') as product_order,
            coalesce(timer_seconds, ${DEFAULT_TIMER_SECONDS}) as timer_seconds,
            round_started_at, round_ends_at,
            coalesce(options, '{}') as options
     from rooms where code = $1`,
    [code.toUpperCase()],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    product_order: asIntArray(row.product_order),
    options: asIntArray(row.options),
    timer_seconds: Number(row.timer_seconds) || DEFAULT_TIMER_SECONDS,
  };
}

export async function listPlayers(code: string): Promise<PlayerRow[]> {
  return sql<PlayerRow>(
    "select id, room_code, name, score from players where room_code = $1 order by joined_at asc",
    [code.toUpperCase()],
  );
}

export async function listGuesses(
  code: string,
  productId: number,
): Promise<GuessRow[]> {
  return sql<GuessRow>(
    `select room_code, player_id, product_id, amount,
            coalesce(answered_at, now()) as answered_at,
            coalesce(points_awarded, 0) as points_awarded
     from guesses where room_code = $1 and product_id = $2`,
    [code.toUpperCase(), productId],
  );
}

export async function joinRoom(
  code: string,
  name: string,
): Promise<{ playerId: string; name: string }> {
  const room = await getRoom(code);
  if (!room) throw new Error("Sala no encontrada");
  if (room.phase === "finished") throw new Error("La partida ya terminó");

  const clean = name.trim().slice(0, 24);
  if (clean.length < 1) throw new Error("Escribe tu nombre");

  const playerId = makeId();
  await sql(
    "insert into players (id, room_code, name, score) values ($1, $2, $3, 0)",
    [playerId, room.code, clean],
  );
  return { playerId, name: clean };
}

async function openRound(room: RoomRow, productIndex: number): Promise<void> {
  const order = productOrderFor(room);
  const productId = order[productIndex];
  if (productId == null) throw new Error("No hay más productos");
  const product = getProductoById(productId);
  if (!product) throw new Error("Producto no válido");

  const options = generatePriceOptions(product.precio);
  const timerSeconds = clampTimer(room.timer_seconds);
  const started = new Date();
  const ends = new Date(started.getTime() + timerSeconds * 1000);

  await sql(
    `update rooms set
       phase = 'guessing',
       product_index = $2,
       options = $3,
       round_started_at = $4,
       round_ends_at = $5,
       timer_seconds = $6
     where code = $1`,
    [
      room.code,
      productIndex,
      options,
      started.toISOString(),
      ends.toISOString(),
      timerSeconds,
    ],
  );
}

async function scoreRound(room: RoomRow): Promise<void> {
  const product = currentProduct(room);
  if (!product) return;

  const players = await listPlayers(room.code);
  const guesses = await listGuesses(room.code, product.id);
  if (guesses.length === 0) return;

  const startedMs = room.round_started_at
    ? new Date(room.round_started_at).getTime()
    : Date.now();
  const endsMs = room.round_ends_at
    ? new Date(room.round_ends_at).getTime()
    : startedMs + room.timer_seconds * 1000;
  const durationMs = Math.max(1000, endsMs - startedMs);

  for (const guess of guesses) {
    const answeredMs = new Date(guess.answered_at).getTime();
    const elapsed = Math.max(0, answeredMs - startedMs);
    const correct = guess.amount === product.precio;
    const points = speedPoints(correct, elapsed, durationMs);
    await sql(
      "update guesses set points_awarded = $1 where room_code = $2 and player_id = $3 and product_id = $4",
      [points, room.code, guess.player_id, product.id],
    );
    if (points > 0) {
      await sql("update players set score = score + $1 where id = $2", [
        points,
        guess.player_id,
      ]);
    }
  }

  // silence unused — winners derived in buildRoomView
  void players;
}

async function closeRound(room: RoomRow): Promise<void> {
  if (room.phase !== "guessing") return;
  await scoreRound(room);
  await sql(
    `update rooms set phase = 'revealed', round_ends_at = coalesce(round_ends_at, now())
     where code = $1 and phase = 'guessing'`,
    [room.code],
  );
}

/** Auto-close when the countdown has elapsed. */
export async function maybeExpireRound(room: RoomRow): Promise<RoomRow> {
  if (room.phase !== "guessing" || !room.round_ends_at) return room;
  const ends = new Date(room.round_ends_at).getTime();
  if (Date.now() < ends) return room;
  await closeRound(room);
  const updated = await getRoom(room.code);
  return updated ?? room;
}

export async function submitGuess(
  code: string,
  playerId: string,
  amount: number,
): Promise<void> {
  let room = await getRoom(code);
  if (!room) throw new Error("Sala no encontrada");
  room = await maybeExpireRound(room);
  if (room.phase !== "guessing") throw new Error("No hay apuestas abiertas");

  if (room.round_ends_at && Date.now() >= new Date(room.round_ends_at).getTime()) {
    await closeRound(room);
    throw new Error("Se acabó el tiempo");
  }

  const players = await listPlayers(code);
  if (!players.some((p) => p.id === playerId)) {
    throw new Error("Jugador no encontrado");
  }

  const product = currentProduct(room);
  if (!product) throw new Error("Producto no válido");

  const rounded = Math.round(amount);
  if (!room.options.includes(rounded)) {
    throw new Error("Opción inválida");
  }

  const existing = await sql<{ player_id: string }>(
    "select player_id from guesses where room_code = $1 and player_id = $2 and product_id = $3",
    [room.code, playerId, product.id],
  );
  if (existing.length > 0) {
    throw new Error("Ya enviaste tu respuesta");
  }

  await sql(
    `insert into guesses (room_code, player_id, product_id, amount, answered_at, points_awarded)
     values ($1, $2, $3, $4, now(), 0)`,
    [room.code, playerId, product.id, rounded],
  );
}

export type HostAction =
  | "start"
  | "close"
  | "reveal"
  | "next"
  | "skip"
  | "restart"
  | "finish"
  | "config";

export async function hostAction(
  code: string,
  hostToken: string,
  action: HostAction,
  opts: { timerSeconds?: number } = {},
): Promise<RoomRow> {
  let room = await getRoom(code);
  if (!room) throw new Error("Sala no encontrada");
  if (room.host_token !== hostToken) throw new Error("No autorizado");
  room = await maybeExpireRound(room);

  switch (action) {
    case "config": {
      if (room.phase !== "lobby") {
        throw new Error("Solo se puede configurar en el lobby");
      }
      const timerSeconds = clampTimer(opts.timerSeconds);
      await sql("update rooms set timer_seconds = $2 where code = $1", [
        room.code,
        timerSeconds,
      ]);
      break;
    }
    case "start": {
      if (room.phase !== "lobby") {
        throw new Error("No se puede iniciar ahora");
      }
      if (opts.timerSeconds != null) {
        room = {
          ...room,
          timer_seconds: clampTimer(opts.timerSeconds),
        };
      }
      await openRound(room, 0);
      break;
    }
    case "close":
    case "reveal": {
      if (room.phase !== "guessing") throw new Error("No hay ronda abierta");
      await closeRound(room);
      break;
    }
    case "next": {
      if (room.phase !== "revealed") {
        throw new Error("Revela primero");
      }
      await advanceAfterRound(room);
      break;
    }
    case "skip": {
      if (room.phase === "finished") throw new Error("La partida ya terminó");
      // Skipping mid-guess without scoring
      if (room.phase === "guessing") {
        await sql(
          "update rooms set phase = 'revealed', round_ends_at = coalesce(round_ends_at, now()) where code = $1",
          [room.code],
        );
      }
      const refreshed = (await getRoom(room.code)) ?? room;
      await advanceAfterRound(refreshed);
      break;
    }
    case "finish": {
      await finishRoom(room.code);
      break;
    }
    case "restart": {
      const order = shuffleProductIds();
      await sql("delete from guesses where room_code = $1", [room.code]);
      await sql("update players set score = 0 where room_code = $1", [
        room.code,
      ]);
      await sql(
        `update rooms set
           phase = 'lobby',
           product_index = 0,
           product_order = $2,
           options = '{}',
           round_started_at = null,
           round_ends_at = null
         where code = $1`,
        [room.code, order],
      );
      break;
    }
    default:
      throw new Error("Acción inválida");
  }

  const updated = await getRoom(code);
  if (!updated) throw new Error("Sala no encontrada");
  return updated;
}

export async function buildRoomView(
  code: string,
  opts: { hostToken?: string; playerId?: string } = {},
): Promise<RoomView | null> {
  let room = await getRoom(code);
  if (!room) return null;
  room = await maybeExpireRound(room);

  const isHost = Boolean(opts.hostToken && opts.hostToken === room.host_token);
  const players = await listPlayers(room.code);
  const product = currentProduct(room);
  const order = productOrderFor(room);
  const tiebreaker = isTiebreakerIndex(order, room.product_index);
  const mainCount = mainRoundCount(order);
  const productCount = tiebreaker ? order.length : mainCount;
  const revealed = room.phase === "revealed" || room.phase === "finished";

  let guesses: GuessRow[] = [];
  if (product) {
    guesses = await listGuesses(room.code, product.id);
  }
  const guessed = new Set(guesses.map((g) => g.player_id));

  let results: GuessResult[] | null = null;
  let winners: string[] | null = null;

  if (room.phase === "revealed" && product) {
    const byPlayer = new Map(guesses.map((g) => [g.player_id, g]));
    const rows: GuessResult[] = players
      .filter((p) => byPlayer.has(p.id))
      .map((p) => {
        const g = byPlayer.get(p.id)!;
        const correct = g.amount === product.precio;
        return {
          playerId: p.id,
          name: p.name,
          amount: g.amount,
          correct,
          points: Number(g.points_awarded) || 0,
          diff: correct ? 0 : Math.abs(g.amount - product.precio),
          winner: false,
        };
      })
      .sort((a, b) => b.points - a.points || a.diff - b.diff);

    if (rows.length > 0) {
      const best = rows[0]!.points;
      if (best > 0) {
        for (const row of rows) {
          row.winner = row.correct && row.points === best;
        }
        winners = rows.filter((r) => r.winner).map((r) => r.name);
      } else {
        winners = [];
      }
    }
    results = rows;
  }

  const showOptions =
    room.phase === "guessing" || room.phase === "revealed"
      ? room.options.length > 0
        ? room.options
        : null
      : null;

  return {
    code: room.code,
    phase: room.phase,
    productIndex: room.product_index,
    productCount,
    isTiebreaker: tiebreaker,
    product: product
      ? toPublicProducto(product, revealed && room.phase === "revealed")
      : null,
    options: showOptions,
    timerSeconds: room.timer_seconds,
    roundEndsAt: toIso(room.round_ends_at),
    roundStartedAt: toIso(room.round_started_at),
    serverNow: new Date().toISOString(),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      hasGuessed: guessed.has(p.id),
    })),
    results,
    winners,
    isHost: isHost || undefined,
  };
}
