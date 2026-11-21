"use client";

export type GuessSubmitReason =
  | "not_found"
  | "closed"
  | "too_late"
  | "already"
  | "invalid"
  | "player"
  | "network";

export type GuessSubmitResult =
  | { ok: true; productId: number }
  | { ok: false; reason: GuessSubmitReason; error: string };

type GuessPayload = {
  code: string;
  playerId: string;
  amount: number;
};

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function postOnce(payload: GuessPayload): Promise<GuessSubmitResult> {
  let res: Response;
  try {
    res = await fetch(`/api/rooms/${payload.code}/guess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: payload.playerId,
        amount: payload.amount,
      }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      reason: "network",
      error: "Sin conexión. Reintentá.",
    };
  }

  let data: {
    ok?: boolean;
    accepted?: boolean;
    productId?: number;
    reason?: GuessSubmitReason;
    error?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    if (!res.ok) {
      return {
        ok: false,
        reason: "network",
        error: "No se pudo confirmar con el servidor",
      };
    }
  }

  if (res.ok && data.ok !== false) {
    return {
      ok: true,
      productId: Number(data.productId) || 0,
    };
  }

  // Lost-response retry: server may have already stored the guess.
  if (res.status === 409 && data.reason === "already") {
    return { ok: true, productId: Number(data.productId) || 0 };
  }

  const reason = data.reason ?? (RETRYABLE.has(res.status) ? "network" : "invalid");
  return {
    ok: false,
    reason,
    error: data.error ?? "No se pudo enviar",
  };
}

/**
 * Deliver a guess with short retries on network / 5xx so a tap near the
 * timer edge still reaches the server during the accept-grace window.
 */
export async function submitGuessWithRetry(
  payload: GuessPayload,
  opts: { attempts?: number; signal?: { cancelled: boolean } } = {},
): Promise<GuessSubmitResult> {
  const attempts = opts.attempts ?? 3;
  let last: GuessSubmitResult = {
    ok: false,
    reason: "network",
    error: "No se pudo enviar",
  };

  for (let i = 0; i < attempts; i++) {
    if (opts.signal?.cancelled) {
      return last;
    }
    last = await postOnce(payload);
    if (last.ok) return last;
    if (last.reason !== "network") return last;
    if (i < attempts - 1) {
      await sleep(350 * (i + 1));
    }
  }
  return last;
}
