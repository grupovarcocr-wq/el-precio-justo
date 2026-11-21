import { randomBytes } from "node:crypto";
import {
  ANSWER_GRACE_MS,
  buildDeck,
  DEFAULT_TIMER_SECONDS,
  getCardById,
  isChoiceCard,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizeAnswer,
  TIMER_CHOICES,
  toPublicCard,
  type PublicCard,
} from "./cartas";
import { sql } from "./db";

export type Phase =
  | "lobby"
  | "answering"
  | "showing"
  | "reviewing"
  | "revealed"
  | "finished";

export type PlayMode = "digital" | "paper";

export type Team = "orange" | "green";

export { ANSWER_GRACE_MS };

export type PlayerRow = {
  id: string;
  room_code: string;
  name: string;
  score: number;
  team: Team;
};

export type AnswerRow = {
  room_code: string;
  player_id: string;
  card_id: string;
  answer_text: string;
  answer_norm: string;
  answered_at: string | Date;
  points_awarded: number;
  matched: boolean;
  agility_bonus: number;
  team_before: Team;
  team_after: Team;
};

export type RoomRow = {
  code: string;
  host_token: string;
  phase: Phase;
  card_index: number;
  card_order: string[];
  timer_seconds: number;
  round_started_at: string | Date | null;
  round_ends_at: string | Date | null;
  answer_buckets: Record<string, string>;
  play_mode: PlayMode;
};

export type AnswerBucket = {
  key: string;
  label: string;
  count: number;
  playerIds: string[];
  answers: { playerId: string; name: string; text: string }[];
};

export type RoundResult = {
  playerId: string;
  name: string;
  answer: string;
  matched: boolean;
  points: number;
  agilityBonus: number;
  teamBefore: Team;
  teamAfter: Team;
  fastest: boolean;
};

export type RoomView = {
  code: string;
  phase: Phase;
  cardIndex: number;
  cardCount: number;
  card: PublicCard | null;
  timerSeconds: number;
  roundEndsAt: string | null;
  roundStartedAt: string | null;
  /** Nominal timer end + grace; submits accepted until this (digital). */
  submitClosesAt: string | null;
  answerGraceMs: number;
  serverNow: string;
  playMode: PlayMode;
  players: {
    id: string;
    name: string;
    score: number;
    team: Team;
    hasAnswered: boolean;
  }[];
  buckets: AnswerBucket[] | null;
  winningKeys: string[] | null;
  results: RoundResult[] | null;
  agilityWinnerName: string | null;
  isHost?: boolean;
  minPlayers: number;
  maxPlayers: number;
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

function asPlayMode(value: unknown): PlayMode {
  return value === "paper" ? "paper" : "digital";
}

function submitClosesAtIso(
  roundEndsAt: string | Date | null | undefined,
): string | null {
  if (!roundEndsAt) return null;
  const ends = new Date(roundEndsAt).getTime();
  if (Number.isNaN(ends)) return null;
  return new Date(ends + ANSWER_GRACE_MS).toISOString();
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  if (typeof value === "string") {
    const inner = value.replace(/^\{/, "").replace(/\}$/, "").trim();
    if (!inner) return [];
    return inner.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  }
  return [];
}

function asBuckets(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, string>;
    } catch {
      return {};
    }
  }
  if (typeof value === "object") {
    return value as Record<string, string>;
  }
  return {};
}

function cardOrderFor(room: RoomRow): string[] {
  if (Array.isArray(room.card_order) && room.card_order.length > 0) {
    return room.card_order;
  }
  return [];
}

export function currentCard(room: RoomRow) {
  const order = cardOrderFor(room);
  const id = order[room.card_index];
  if (id == null) return null;
  return getCardById(id) ?? null;
}

export async function createRoom(opts: {
  timerSeconds?: number;
  playMode?: PlayMode;
} = {}): Promise<{ code: string; hostToken: string }> {
  const timerSeconds = clampTimer(opts.timerSeconds);
  const playMode = asPlayMode(opts.playMode);
  const order = buildDeck();

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    const hostToken = makeId();
    try {
      await sql(
        `insert into rooms
          (code, host_token, phase, card_index, card_order, timer_seconds, answer_buckets, play_mode)
         values ($1, $2, 'lobby', 0, $3, $4, '{}'::jsonb, $5)`,
        [code, hostToken, order, timerSeconds, playMode],
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
    `select code, host_token, phase, card_index,
            coalesce(card_order, '{}') as card_order,
            coalesce(timer_seconds, ${DEFAULT_TIMER_SECONDS}) as timer_seconds,
            round_started_at, round_ends_at,
            coalesce(answer_buckets, '{}'::jsonb) as answer_buckets,
            coalesce(play_mode, 'digital') as play_mode
     from rooms where code = $1`,
    [code.toUpperCase()],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    card_order: asTextArray(row.card_order),
    answer_buckets: asBuckets(row.answer_buckets),
    timer_seconds: Number(row.timer_seconds),
    card_index: Number(row.card_index) || 0,
    play_mode: asPlayMode(row.play_mode),
  };
}

export async function listPlayers(code: string): Promise<PlayerRow[]> {
  const rows = await sql<PlayerRow>(
    `select id, room_code, name, score, coalesce(team, 'orange') as team
     from players where room_code = $1 order by joined_at asc`,
    [code.toUpperCase()],
  );
  return rows.map((p) => ({
    ...p,
    score: Number(p.score) || 0,
    team: p.team === "green" ? "green" : "orange",
  }));
}

export async function listAnswers(
  code: string,
  cardId: string,
): Promise<AnswerRow[]> {
  const rows = await sql<AnswerRow>(
    `select room_code, player_id, card_id, answer_text, answer_norm,
            coalesce(answered_at, now()) as answered_at,
            coalesce(points_awarded, 0) as points_awarded,
            coalesce(matched, false) as matched,
            coalesce(agility_bonus, 0) as agility_bonus,
            coalesce(team_before, 'orange') as team_before,
            coalesce(team_after, 'orange') as team_after
     from answers where room_code = $1 and card_id = $2`,
    [code.toUpperCase(), cardId],
  );
  return rows.map((a) => ({
    ...a,
    team_before: a.team_before === "green" ? "green" : "orange",
    team_after: a.team_after === "green" ? "green" : "orange",
  }));
}

export async function joinRoom(
  code: string,
  name: string,
): Promise<{ playerId: string; name: string }> {
  const room = await getRoom(code);
  if (!room) throw new Error("Sala no encontrada");
  if (room.phase === "finished") throw new Error("La partida ya terminó");
  if (room.phase !== "lobby") {
    throw new Error("La partida ya empezó");
  }

  const players = await listPlayers(code);
  if (players.length >= MAX_PLAYERS) {
    throw new Error(`Máximo ${MAX_PLAYERS} jugadores`);
  }

  const clean = name.trim().slice(0, 24);
  if (clean.length < 1) throw new Error("Escribe tu nombre");

  const playerId = makeId();
  await sql(
    `insert into players (id, room_code, name, score, team)
     values ($1, $2, $3, 0, 'orange')`,
    [playerId, room.code, clean],
  );
  return { playerId, name: clean };
}

async function openRound(room: RoomRow, cardIndex: number): Promise<void> {
  const order = cardOrderFor(room);
  const cardId = order[cardIndex];
  if (cardId == null) throw new Error("No hay más cartas");
  const card = getCardById(cardId);
  if (!card) throw new Error("Carta no válida");

  const timerSeconds = clampTimer(room.timer_seconds);
  const started = new Date();
  const ends =
    timerSeconds > 0
      ? new Date(started.getTime() + timerSeconds * 1000)
      : null;
  const phase = room.play_mode === "paper" ? "showing" : "answering";

  await sql(
    `update rooms set
       phase = $6,
       card_index = $2,
       answer_buckets = '{}'::jsonb,
       round_started_at = $3,
       round_ends_at = $4,
       timer_seconds = $5
     where code = $1`,
    [
      room.code,
      cardIndex,
      started.toISOString(),
      ends ? ends.toISOString() : null,
      timerSeconds,
      phase,
    ],
  );
}

/** Resolve effective bucket key for an answer given host merges. */
function effectiveKey(
  answerNorm: string,
  merges: Record<string, string>,
): string {
  let key = answerNorm;
  const seen = new Set<string>();
  while (
    Object.prototype.hasOwnProperty.call(merges, key) &&
    !seen.has(key)
  ) {
    seen.add(key);
    const next = merges[key];
    if (typeof next !== "string" || !next) break;
    key = next;
  }
  return key;
}

function buildBuckets(
  answers: AnswerRow[],
  players: PlayerRow[],
  merges: Record<string, string>,
): AnswerBucket[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const map = new Map<
    string,
    {
      label: string;
      playerIds: string[];
      answers: { playerId: string; name: string; text: string }[];
    }
  >();

  for (const a of answers) {
    const key = effectiveKey(a.answer_norm, merges);
    const player = byId.get(a.player_id);
    const entry = map.get(key) ?? {
      label: a.answer_text.trim() || a.answer_norm,
      playerIds: [],
      answers: [],
    };
    if (!entry.playerIds.includes(a.player_id)) {
      entry.playerIds.push(a.player_id);
    }
    entry.answers.push({
      playerId: a.player_id,
      name: player?.name ?? "?",
      text: a.answer_text,
    });
    // Prefer a nicer label if this answer looks nicer
    if (a.answer_text.trim().length > 0 && entry.label === a.answer_norm) {
      entry.label = a.answer_text.trim();
    }
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      count: v.playerIds.length,
      playerIds: v.playerIds,
      answers: v.answers,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

function winningKeysFromBuckets(buckets: AnswerBucket[]): string[] {
  if (buckets.length === 0) return [];
  const top = buckets[0]!.count;
  if (top <= 0) return [];
  return buckets.filter((b) => b.count === top).map((b) => b.key);
}

async function scoreRound(room: RoomRow): Promise<void> {
  const card = currentCard(room);
  if (!card) return;

  const players = await listPlayers(room.code);
  const answers = await listAnswers(room.code, card.id);
  if (answers.length === 0) return;

  const merges = room.answer_buckets ?? {};
  const buckets = buildBuckets(answers, players, merges);
  const winning = new Set(winningKeysFromBuckets(buckets));

  const matchedAnswers = answers.filter((a) =>
    winning.has(effectiveKey(a.answer_norm, merges)),
  );

  let fastestId: string | null = null;
  if (matchedAnswers.length > 0) {
    matchedAnswers.sort(
      (a, b) =>
        new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime(),
    );
    fastestId = matchedAnswers[0]!.player_id;
  }

  const teamBefore = new Map(players.map((p) => [p.id, p.team]));

  for (const player of players) {
    const answer = answers.find((a) => a.player_id === player.id);
    const matched = answer
      ? winning.has(effectiveKey(answer.answer_norm, merges))
      : false;
    const before = teamBefore.get(player.id) ?? "orange";

    let points = 0;
    let agility = 0;
    let after: Team = "orange";

    if (matched) {
      if (before === "green") {
        points = 2;
        after = "green";
      } else {
        points = 1;
        after = "green";
      }
      if (player.id === fastestId) {
        agility = 1;
        points += 1;
      }
    } else {
      after = "orange";
      points = 0;
    }

    if (answer) {
      await sql(
        `update answers set points_awarded = $1, matched = $2, agility_bonus = $3,
           team_before = $4, team_after = $5
         where room_code = $6 and player_id = $7 and card_id = $8`,
        [points, matched, agility, before, after, room.code, player.id, card.id],
      );
    }

    await sql(
      `update players set score = score + $1, team = $2 where id = $3`,
      [points, after, player.id],
    );
  }
}

async function enterReview(room: RoomRow): Promise<void> {
  if (room.phase !== "answering") return;
  await sql(
    `update rooms set phase = 'reviewing',
       round_ends_at = coalesce(round_ends_at, now())
     where code = $1 and phase = 'answering'`,
    [room.code],
  );
}

async function closeAndScore(room: RoomRow): Promise<void> {
  if (room.phase !== "answering" && room.phase !== "reviewing") return;
  if (room.phase === "answering") {
    await enterReview(room);
  }
  const fresh = (await getRoom(room.code)) ?? room;
  await scoreRound(fresh);
  await sql(
    `update rooms set phase = 'revealed' where code = $1`,
    [room.code],
  );
}

/** Auto-close answering after timer + grace → reviewing. */
export async function maybeExpireRound(room: RoomRow): Promise<RoomRow> {
  if (room.phase !== "answering" || !room.round_ends_at) return room;
  if (room.play_mode === "paper") return room;
  const ends = new Date(room.round_ends_at).getTime();
  if (Date.now() < ends + ANSWER_GRACE_MS) return room;
  await enterReview(room);
  const updated = await getRoom(room.code);
  return updated ?? room;
}

export async function submitAnswer(
  code: string,
  playerId: string,
  answer: string,
): Promise<void> {
  let room = await getRoom(code);
  if (!room) throw new Error("Sala no encontrada");
  if (room.play_mode === "paper") {
    throw new Error("Modo papel: sin respuestas digitales");
  }

  // Accept submits during grace; only expire after grace window.
  if (room.phase === "answering" && room.round_ends_at) {
    const ends = new Date(room.round_ends_at).getTime();
    if (Date.now() >= ends + ANSWER_GRACE_MS) {
      room = await maybeExpireRound(room);
    }
  } else {
    room = await maybeExpireRound(room);
  }

  if (room.phase !== "answering") throw new Error("No hay ronda abierta");

  if (
    room.round_ends_at &&
    Date.now() >= new Date(room.round_ends_at).getTime() + ANSWER_GRACE_MS
  ) {
    await enterReview(room);
    throw new Error("Se acabó el tiempo");
  }

  const players = await listPlayers(code);
  if (!players.some((p) => p.id === playerId)) {
    throw new Error("Jugador no encontrado");
  }

  const card = currentCard(room);
  if (!card) throw new Error("Carta no válida");

  let text = String(answer ?? "").trim().slice(0, 80);
  if (!text) throw new Error("Escribe una respuesta");

  if (isChoiceCard(card)) {
    const upper = text.toUpperCase();
    if (upper === "A" || text === card.optionA) {
      text = "A";
    } else if (upper === "B" || text === card.optionB) {
      text = "B";
    } else {
      throw new Error("Elegí A o B");
    }
  }

  const norm = isChoiceCard(card)
    ? text.toUpperCase()
    : normalizeAnswer(text);
  if (!norm) throw new Error("Escribe una respuesta");

  const existing = await sql<{ player_id: string }>(
    `select player_id from answers
     where room_code = $1 and player_id = $2 and card_id = $3`,
    [room.code, playerId, card.id],
  );
  if (existing.length > 0) {
    throw new Error("Ya enviaste tu respuesta");
  }

  await sql(
    `insert into answers
       (room_code, player_id, card_id, answer_text, answer_norm, answered_at)
     values ($1, $2, $3, $4, $5, now())`,
    [
      room.code,
      playerId,
      card.id,
      isChoiceCard(card) ? text.toUpperCase() : text,
      norm,
    ],
  );
}

export type HostAction =
  | "start"
  | "close"
  | "score"
  | "next"
  | "skip"
  | "restart"
  | "finish"
  | "config"
  | "merge";

export async function hostAction(
  code: string,
  hostToken: string,
  action: HostAction,
  opts: {
    timerSeconds?: number;
    playMode?: PlayMode;
    fromKey?: string;
    intoKey?: string;
  } = {},
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
      const timerSeconds =
        opts.timerSeconds != null
          ? clampTimer(opts.timerSeconds)
          : room.timer_seconds;
      const playMode =
        opts.playMode != null ? asPlayMode(opts.playMode) : room.play_mode;
      await sql(
        `update rooms set timer_seconds = $2, play_mode = $3 where code = $1`,
        [room.code, timerSeconds, playMode],
      );
      break;
    }
    case "start": {
      if (room.phase !== "lobby") {
        throw new Error("No se puede iniciar ahora");
      }
      if (opts.playMode != null) {
        room = { ...room, play_mode: asPlayMode(opts.playMode) };
        await sql(`update rooms set play_mode = $2 where code = $1`, [
          room.code,
          room.play_mode,
        ]);
      }
      if (opts.timerSeconds != null) {
        room = {
          ...room,
          timer_seconds: clampTimer(opts.timerSeconds),
        };
      }
      const players = await listPlayers(room.code);
      if (room.play_mode === "digital" && players.length < MIN_PLAYERS) {
        throw new Error(`Se necesitan al menos ${MIN_PLAYERS} jugadores`);
      }
      await openRound(room, 0);
      break;
    }
    case "close": {
      if (room.phase !== "answering") throw new Error("No hay ronda abierta");
      await enterReview(room);
      break;
    }
    case "merge": {
      if (room.phase !== "reviewing") {
        throw new Error("Solo se agrupa en la revisión");
      }
      const fromKey = opts.fromKey?.trim();
      const intoKey = opts.intoKey?.trim();
      if (!fromKey || !intoKey || fromKey === intoKey) {
        throw new Error("Elegí dos grupos distintos");
      }
      const merges = { ...room.answer_buckets, [fromKey]: intoKey };
      await sql(
        `update rooms set answer_buckets = $2::jsonb where code = $1`,
        [room.code, JSON.stringify(merges)],
      );
      break;
    }
    case "score": {
      if (room.phase !== "reviewing" && room.phase !== "answering") {
        throw new Error("No hay ronda para puntuar");
      }
      await closeAndScore(room);
      break;
    }
    case "next": {
      if (room.play_mode === "paper") {
        if (room.phase !== "showing" && room.phase !== "revealed") {
          throw new Error("No se puede avanzar ahora");
        }
      } else if (room.phase !== "revealed") {
        throw new Error("Revela primero");
      }
      const next = room.card_index + 1;
      const order = cardOrderFor(room);
      if (next >= order.length) {
        await sql(
          `update rooms set phase = 'finished',
             round_started_at = null, round_ends_at = null
           where code = $1`,
          [room.code],
        );
      } else {
        await openRound(room, next);
      }
      break;
    }
    case "skip": {
      if (room.phase === "finished") throw new Error("La partida ya terminó");
      if (room.play_mode === "paper") {
        // same as next in paper
      } else if (room.phase === "answering" || room.phase === "reviewing") {
        await sql(
          `update rooms set phase = 'revealed',
             round_ends_at = coalesce(round_ends_at, now())
           where code = $1`,
          [room.code],
        );
      }
      const refreshed = (await getRoom(room.code)) ?? room;
      const next = refreshed.card_index + 1;
      const order = cardOrderFor(refreshed);
      if (next >= order.length) {
        await sql(
          `update rooms set phase = 'finished',
             round_started_at = null, round_ends_at = null
           where code = $1`,
          [room.code],
        );
      } else {
        await openRound(refreshed, next);
      }
      break;
    }
    case "finish": {
      await sql(
        `update rooms set phase = 'finished',
           round_started_at = null, round_ends_at = null
         where code = $1`,
        [room.code],
      );
      break;
    }
    case "restart": {
      const order = buildDeck();
      await sql("delete from answers where room_code = $1", [room.code]);
      await sql(
        `update players set score = 0, team = 'orange' where room_code = $1`,
        [room.code],
      );
      await sql(
        `update rooms set
           phase = 'lobby',
           card_index = 0,
           card_order = $2,
           answer_buckets = '{}'::jsonb,
           round_started_at = null,
           round_ends_at = null
         where code = $1`,
        [room.code, order],
      );
      break;
    }
    // play_mode preserved on restart via untouched column
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
  const card = currentCard(room);
  const order = cardOrderFor(room);

  let answers: AnswerRow[] = [];
  if (card) {
    answers = await listAnswers(room.code, card.id);
  }
  const answered = new Set(answers.map((a) => a.player_id));

  let buckets: AnswerBucket[] | null = null;
  let winningKeys: string[] | null = null;
  let results: RoundResult[] | null = null;
  let agilityWinnerName: string | null = null;

  const showBuckets =
    room.phase === "reviewing" ||
    room.phase === "revealed" ||
    (room.phase === "answering" && isHost);

  if (card && showBuckets && (isHost || room.phase !== "answering")) {
    buckets = buildBuckets(answers, players, room.answer_buckets ?? {});
    if (room.phase === "revealed") {
      winningKeys = winningKeysFromBuckets(buckets);
    } else if (room.phase === "reviewing") {
      winningKeys = winningKeysFromBuckets(buckets);
    }
  }

  if (room.phase === "revealed" && card) {
    const byPlayer = new Map(answers.map((a) => [a.player_id, a]));

    const rows: RoundResult[] = players
      .filter((p) => byPlayer.has(p.id))
      .map((p) => {
        const a = byPlayer.get(p.id)!;
        const matched = Boolean(a.matched);
        const agility = Number(a.agility_bonus) || 0;
        const points = Number(a.points_awarded) || 0;
        return {
          playerId: p.id,
          name: p.name,
          answer: displayAnswer(a.answer_text, card),
          matched,
          points,
          agilityBonus: agility,
          teamBefore: a.team_before,
          teamAfter: a.team_after || p.team,
          fastest: agility > 0,
        };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "es"));

    results = rows;
    const fastest = rows.find((r) => r.fastest);
    agilityWinnerName = fastest?.name ?? null;
  }

  return {
    code: room.code,
    phase: room.phase,
    cardIndex: room.card_index,
    cardCount: order.length || 15,
    card: card ? toPublicCard(card) : null,
    timerSeconds: room.timer_seconds,
    roundEndsAt: toIso(room.round_ends_at),
    roundStartedAt: toIso(room.round_started_at),
    submitClosesAt: submitClosesAtIso(room.round_ends_at),
    answerGraceMs: ANSWER_GRACE_MS,
    serverNow: new Date().toISOString(),
    playMode: room.play_mode,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      team: p.team,
      hasAnswered: answered.has(p.id),
    })),
    buckets: isHost || room.phase === "revealed" ? buckets : null,
    winningKeys:
      isHost || room.phase === "revealed" ? winningKeys : null,
    results,
    agilityWinnerName,
    isHost: isHost || undefined,
    minPlayers: room.play_mode === "paper" ? 0 : MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  };
}

function displayAnswer(text: string, card: NonNullable<ReturnType<typeof currentCard>>): string {
  if (!isChoiceCard(card)) return text;
  if (text.toUpperCase() === "A") return card.optionA ?? "A";
  if (text.toUpperCase() === "B") return card.optionB ?? "B";
  return text;
}
