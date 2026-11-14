import { randomBytes } from "node:crypto";
import { sql } from "./db";
import {
  PRODUCTOS,
  getProducto,
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
};

export type RoomRow = {
  code: string;
  host_token: string;
  phase: Phase;
  product_index: number;
};

export type GuessResult = {
  playerId: string;
  name: string;
  amount: number;
  diff: number;
  winner: boolean;
};

export type RoomView = {
  code: string;
  phase: Phase;
  productIndex: number;
  productCount: number;
  product: PublicProducto | null;
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

export async function createRoom(): Promise<{
  code: string;
  hostToken: string;
}> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    const hostToken = makeId();
    try {
      await sql(
        "insert into rooms (code, host_token, phase, product_index) values ($1, $2, 'lobby', 0)",
        [code, hostToken],
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
    "select code, host_token, phase, product_index from rooms where code = $1",
    [code.toUpperCase()],
  );
  return rows[0] ?? null;
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
    "select room_code, player_id, product_id, amount from guesses where room_code = $1 and product_id = $2",
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

export async function submitGuess(
  code: string,
  playerId: string,
  amount: number,
): Promise<void> {
  const room = await getRoom(code);
  if (!room) throw new Error("Sala no encontrada");
  if (room.phase !== "guessing") throw new Error("No hay apuestas abiertas");

  const players = await listPlayers(code);
  if (!players.some((p) => p.id === playerId)) {
    throw new Error("Jugador no encontrado");
  }

  const product = getProducto(room.product_index);
  if (!product) throw new Error("Producto no válido");

  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
    throw new Error("Precio inválido");
  }
  const rounded = Math.round(amount);

  await sql(
    `insert into guesses (room_code, player_id, product_id, amount)
     values ($1, $2, $3, $4)
     on conflict (room_code, player_id, product_id)
     do update set amount = excluded.amount`,
    [room.code, playerId, product.id, rounded],
  );
}

async function scoreRound(room: RoomRow): Promise<string[]> {
  const product = getProducto(room.product_index);
  if (!product) return [];

  const players = await listPlayers(room.code);
  const guesses = await listGuesses(room.code, product.id);
  if (guesses.length === 0) return [];

  const byPlayer = new Map(guesses.map((g) => [g.player_id, g.amount]));
  let best = Number.POSITIVE_INFINITY;
  const winners: string[] = [];

  for (const player of players) {
    const amount = byPlayer.get(player.id);
    if (amount === undefined) continue;
    const diff = Math.abs(amount - product.precio);
    if (diff < best) {
      best = diff;
      winners.length = 0;
      winners.push(player.id);
    } else if (diff === best) {
      winners.push(player.id);
    }
  }

  for (const id of winners) {
    await sql("update players set score = score + 1 where id = $1", [id]);
  }
  return winners;
}

export async function hostAction(
  code: string,
  hostToken: string,
  action: "start" | "close" | "reveal" | "next" | "skip" | "restart" | "finish",
): Promise<RoomRow> {
  const room = await getRoom(code);
  if (!room) throw new Error("Sala no encontrada");
  if (room.host_token !== hostToken) throw new Error("No autorizado");

  switch (action) {
    case "start": {
      if (room.phase !== "lobby" && room.phase !== "revealed") {
        throw new Error("No se puede iniciar ahora");
      }
      const product = getProducto(room.product_index);
      if (!product) throw new Error("No hay más productos");
      await sql(
        "update rooms set phase = 'guessing' where code = $1",
        [room.code],
      );
      break;
    }
    case "close":
    case "reveal": {
      if (room.phase !== "guessing") throw new Error("No hay ronda abierta");
      await scoreRound(room);
      await sql(
        "update rooms set phase = 'revealed' where code = $1",
        [room.code],
      );
      break;
    }
    case "next": {
      if (room.phase !== "revealed" && room.phase !== "lobby") {
        throw new Error("Revela primero");
      }
      const next = room.product_index + 1;
      if (next >= PRODUCTOS.length) {
        await sql(
          "update rooms set phase = 'finished' where code = $1",
          [room.code],
        );
      } else {
        await sql(
          "update rooms set phase = 'guessing', product_index = $2 where code = $1",
          [room.code, next],
        );
      }
      break;
    }
    case "skip": {
      if (room.phase === "finished") throw new Error("La partida ya terminó");
      const next = room.product_index + 1;
      if (next >= PRODUCTOS.length) {
        await sql(
          "update rooms set phase = 'finished' where code = $1",
          [room.code],
        );
      } else {
        await sql(
          "update rooms set phase = 'guessing', product_index = $2 where code = $1",
          [room.code, next],
        );
      }
      break;
    }
    case "finish": {
      await sql(
        "update rooms set phase = 'finished' where code = $1",
        [room.code],
      );
      break;
    }
    case "restart": {
      await sql("delete from guesses where room_code = $1", [room.code]);
      await sql("update players set score = 0 where room_code = $1", [
        room.code,
      ]);
      await sql(
        "update rooms set phase = 'lobby', product_index = 0 where code = $1",
        [room.code],
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
  const room = await getRoom(code);
  if (!room) return null;

  const isHost = Boolean(opts.hostToken && opts.hostToken === room.host_token);
  const players = await listPlayers(room.code);
  const product = getProducto(room.product_index);
  const revealed = room.phase === "revealed" || room.phase === "finished";

  let guesses: GuessRow[] = [];
  if (product) {
    guesses = await listGuesses(room.code, product.id);
  }
  const guessed = new Set(guesses.map((g) => g.player_id));

  let results: GuessResult[] | null = null;
  let winners: string[] | null = null;

  if (revealed && product && room.phase === "revealed") {
    const byPlayer = new Map(guesses.map((g) => [g.player_id, g.amount]));
    const rows: GuessResult[] = players
      .filter((p) => byPlayer.has(p.id))
      .map((p) => {
        const amount = byPlayer.get(p.id)!;
        return {
          playerId: p.id,
          name: p.name,
          amount,
          diff: Math.abs(amount - product.precio),
          winner: false,
        };
      })
      .sort((a, b) => a.diff - b.diff || a.amount - b.amount);

    if (rows.length > 0) {
      const best = rows[0]!.diff;
      for (const row of rows) {
        row.winner = row.diff === best;
      }
      winners = rows.filter((r) => r.winner).map((r) => r.name);
    }
    results = rows;
  }

  return {
    code: room.code,
    phase: room.phase,
    productIndex: room.product_index,
    productCount: PRODUCTOS.length,
    product: product ? toPublicProducto(product, revealed && room.phase === "revealed") : null,
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
