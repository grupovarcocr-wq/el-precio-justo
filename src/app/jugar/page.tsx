"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CountdownRing, OPTION_STYLES, useCountdown } from "@/lib/Countdown";
import { formatColones } from "@/lib/productos";
import {
  submitGuessWithRetry,
  type GuessSubmitReason,
} from "@/lib/submitGuess";
import { ROOM_GONE, useRoom } from "@/lib/useRoom";

type GuessUiStatus = "idle" | "pending" | "accepted" | "rejected" | "error";

function rejectCopy(reason: GuessSubmitReason): string {
  switch (reason) {
    case "too_late":
      return "Llegó tarde — la ronda ya cerró.";
    case "closed":
      return "La ronda ya cerró. Tu respuesta no contó.";
    case "already":
      return "Ya enviaste tu respuesta.";
    case "network":
      return "Sin conexión con el servidor. Tocá de nuevo.";
    default:
      return "No se pudo enviar la respuesta.";
  }
}

function JugarInner() {
  const params = useSearchParams();
  const router = useRouter();
  const initialCode = (params.get("code") ?? "").toUpperCase();
  const [codeInput, setCodeInput] = useState(initialCode);
  const [code, setCode] = useState<string | null>(
    initialCode.length >= 3 ? initialCode : null,
  );
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [guessStatus, setGuessStatus] = useState<GuessUiStatus>("idle");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [guessMsg, setGuessMsg] = useState<string | null>(null);
  const [sentForProduct, setSentForProduct] = useState<number | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!code) return;
    const stored = sessionStorage.getItem(`player:${code}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          playerId: string;
          name: string;
        };
        setPlayerId(parsed.playerId);
        setPlayerName(parsed.name);
      } catch {
        /* ignore */
      }
    }
  }, [code]);

  const { room, error, refresh } = useRoom(code, {
    playerId,
    intervalMs: 800,
  });

  useEffect(() => {
    if (error !== ROOM_GONE) return;
    if (code) sessionStorage.removeItem(`player:${code}`);
    router.replace("/");
  }, [error, code, router]);

  const remainingMs = useCountdown(room?.roundEndsAt, room?.serverNow);

  useEffect(() => {
    if (room?.phase === "guessing" && remainingMs === 0 && room.roundEndsAt) {
      void refresh();
    }
  }, [remainingMs, room?.phase, room?.roundEndsAt, refresh]);

  const myGuessed = useMemo(() => {
    if (!room || !playerId) return false;
    return room.players.some((p) => p.id === playerId && p.hasGuessed);
  }, [room, playerId]);

  const guessAccepted =
    guessStatus === "accepted" ||
    (Boolean(room?.product) && sentForProduct === room?.product?.id) ||
    myGuessed;

  // Reset local submit UI only when the product / round identity changes.
  const productKey = room?.product?.id ?? null;
  const prevProductKey = useRef<number | null>(null);
  useEffect(() => {
    if (room?.phase !== "guessing" || productKey == null) return;
    if (prevProductKey.current === productKey) return;
    prevProductKey.current = productKey;
    setMsg(null);
    setGuessStatus("idle");
    setSelectedAmount(null);
    setGuessMsg(null);
    submitLock.current = false;
  }, [room?.phase, productKey]);

  // Host board / poll confirmed the guess even if our POST response was lost.
  useEffect(() => {
    if (!room?.product || !myGuessed) return;
    if (sentForProduct === room.product.id && guessStatus === "accepted") return;
    setSentForProduct(room.product.id);
    setGuessStatus("accepted");
    setGuessMsg("¡Aceptada! El servidor ya tiene tu respuesta.");
    submitLock.current = false;
  }, [myGuessed, room?.product?.id, sentForProduct, guessStatus]);

  // Round flipped while we never got an ack → make that obvious.
  useEffect(() => {
    if (room?.phase !== "revealed" && room?.phase !== "finished") return;
    if (guessStatus !== "pending") return;
    if (myGuessed) return;
    setGuessStatus("rejected");
    setGuessMsg("La ronda cerró antes de confirmar tu respuesta.");
    submitLock.current = false;
  }, [room?.phase, guessStatus, myGuessed]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = (code ?? codeInput).trim().toUpperCase();
    if (c.length < 3) {
      setMsg("Escribe el código de la sala");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rooms/${c}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      sessionStorage.setItem(
        `player:${c}`,
        JSON.stringify({ playerId: data.playerId, name: data.name }),
      );
      setCode(c);
      setPlayerId(data.playerId);
      setPlayerName(data.name);
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo unir");
    } finally {
      setBusy(false);
    }
  }

  async function sendChoice(amount: number) {
    if (!code || !playerId || !room?.product) return;
    if (room.phase !== "guessing") {
      setGuessStatus("rejected");
      setGuessMsg("La ronda ya cerró.");
      return;
    }
    if (guessAccepted || submitLock.current) return;

    // Do not gate on local remainingMs — phone clocks / 200ms ticks can show
    // 0 while the server still accepts within the grace window.
    submitLock.current = true;
    setSelectedAmount(amount);
    setGuessStatus("pending");
    setGuessMsg("Enviando al servidor…");
    setMsg(null);

    const result = await submitGuessWithRetry({
      code,
      playerId,
      amount,
    });

    if (result.ok) {
      setSentForProduct(room.product.id);
      setGuessStatus("accepted");
      setGuessMsg("¡Aceptada! El servidor ya tiene tu respuesta.");
      await refresh();
      submitLock.current = false;
      return;
    }

    setGuessStatus(result.reason === "network" ? "error" : "rejected");
    setGuessMsg(rejectCopy(result.reason));
    submitLock.current = false;
  }

  if (!playerId || !code) {
    return (
      <main className="tv-shell mx-auto flex w-full max-w-md flex-col justify-center px-5 py-10">
        <img
          src="/branding/leon-bebe.png"
          alt=""
          className="mb-3 w-24 self-center"
          aria-hidden
        />
        <p className="chip w-fit">Té de Leandro Vargas Corao</p>
        <h1 className="brand mt-3 text-5xl text-[var(--navy)]">
          El Precio Justo
        </h1>
        <p className="mt-2 font-700 text-[var(--ink-soft)]">
          Unite con el código de la TV y tu nombre.
        </p>
        <form onSubmit={join} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-800 uppercase tracking-wide">
              Código
            </span>
            <input
              className="field uppercase tracking-[0.25em]"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              maxLength={6}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-800 uppercase tracking-wide">
              Tu nombre
            </span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              required
              placeholder="Ej. María"
            />
          </label>
          <button type="submit" className="btn btn-coral w-full text-lg" disabled={busy}>
            Entrar a la sala
          </button>
        </form>
        {msg ? (
          <p className="mt-4 text-center font-800 text-[var(--brown)]">{msg}</p>
        ) : null}
      </main>
    );
  }

  if (error === ROOM_GONE) {
    return (
      <main className="tv-shell grid place-items-center p-6">
        <p className="brand text-3xl text-[var(--navy)]">Volviendo al inicio…</p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="tv-shell grid place-items-center p-6">
        <p className="font-800 text-[var(--brown)]">{error}</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="tv-shell grid place-items-center p-6">
        <p className="brand text-3xl text-[var(--navy)]">Conectando…</p>
      </main>
    );
  }

  const myResult = room.results?.find((r) => r.playerId === playerId);

  return (
    <main className="tv-shell mx-auto w-full max-w-lg px-5 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="brand text-3xl text-[var(--navy)]">El Precio Justo</p>
          <p className="font-800 text-[var(--ink-soft)]">
            Hola {playerName} · Sala {room.code}
          </p>
        </div>
        <div className="chip">
          {room.players.find((p) => p.id === playerId)?.score ?? 0} pts
        </div>
      </header>

      {room.phase === "lobby" ? (
        <section className="mt-10 text-center">
          <img
            src="/branding/leon-bebe.png"
            alt=""
            className="mx-auto mb-3 w-24 pulse-soft"
            aria-hidden
          />
          <h2 className="brand text-4xl text-[var(--navy)]">
            Esperando al host…
          </h2>
          <p className="mt-2 font-700 text-[var(--ink-soft)]">
            Cuando empiece, vas a ver 4 precios. Tocá el correcto — más rápido,
            más puntos.
          </p>
          <ul className="mt-6 space-y-2 text-left">
            {room.players.map((p) => (
              <li key={p.id} className="paper-panel px-4 py-2 font-800">
                {p.name}
                {p.id === playerId ? " (vos)" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {room.phase === "guessing" && room.product ? (
        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-800 text-[var(--ink-soft)]">
              {room.isTiebreaker
                ? "Desempate"
                : `Ronda ${room.productIndex + 1}/${room.productCount}`}
            </p>
            <CountdownRing
              remainingMs={remainingMs}
              totalSeconds={room.timerSeconds}
              size="sm"
              tone="light"
            />
          </div>
          <div className="flex max-h-72 items-center justify-center overflow-hidden rounded-[1.6rem] bg-[var(--mist)] shadow-[var(--shadow)]">
            <img
              src={`/productos/${room.product.imagenProducto}`}
              alt={room.product.nombre}
              className="max-h-72 w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <h2 className="brand mt-4 text-3xl leading-tight text-[var(--navy)]">
            {room.product.nombre}
          </h2>
          <p className="mt-1 font-700 text-[var(--ink-soft)]">
            Tocá el precio correcto (₡).
          </p>

          {guessAccepted ? (
            <div className="mt-6 paper-panel p-5 text-center">
              <p className="brand text-3xl text-[var(--navy)]">¡Listo!</p>
              <p className="mt-2 font-700 text-[var(--ink-soft)]">
                {guessMsg ?? "Esperá la revelación en la TV."}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {(room.options ?? []).map((opt, i) => {
                  const selected = selectedAmount === opt;
                  const pending = guessStatus === "pending" && selected;
                  const dimmed =
                    selectedAmount != null &&
                    !selected &&
                    (guessStatus === "pending" || guessStatus === "error");
                  const locked = guessStatus === "pending";
                  return (
                    <button
                      key={opt}
                      type="button"
                      className={`option-btn ${OPTION_STYLES[i % 4]} ${
                        selected ? "is-selected" : ""
                      } ${pending ? "is-pending" : ""} ${
                        dimmed ? "is-dimmed" : ""
                      }`}
                      disabled={locked}
                      aria-pressed={selected}
                      aria-busy={pending}
                      onClick={() => void sendChoice(opt)}
                    >
                      {formatColones(opt)}
                    </button>
                  );
                })}
              </div>
              {guessStatus === "pending" ||
              guessStatus === "rejected" ||
              guessStatus === "error" ? (
                <p
                  className={`guess-status is-${guessStatus}`}
                  role="status"
                  aria-live="polite"
                >
                  {guessMsg}
                  {guessStatus === "error" ? " Tocá otra vez para reintentar." : ""}
                </p>
              ) : remainingMs <= 0 ? (
                <p className="guess-status is-pending" role="status">
                  Tiempo en pantalla agotado — si tocás ahora, aún puede llegar.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {room.phase === "revealed" && room.product ? (
        <section className="mt-6">
          <div className="flex max-h-72 items-center justify-center overflow-hidden rounded-[1.6rem] bg-[var(--mist)] shadow-[var(--shadow)]">
            <img
              src={`/productos/${room.product.imagenPrecio ?? room.product.imagenProducto}`}
              alt="Precio revelado"
              className="max-h-72 w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  `/productos/${room.product!.imagenProducto}`;
              }}
            />
          </div>
          <p className="brand mt-4 text-5xl text-[var(--brown)]">
            {formatColones(room.product.precio ?? 0)}
          </p>
          {myResult ? (
            <p
              className={`mt-2 text-xl font-900 ${
                myResult.correct ? "text-[var(--navy)]" : "text-[var(--ink-soft)]"
              }`}
            >
              {myResult.correct
                ? `¡Correcto! +${myResult.points} pts`
                : `Incorrecto · 0 pts (elegiste ${formatColones(myResult.amount)})`}
            </p>
          ) : (
            <p className="mt-2 font-700 text-[var(--ink-soft)]">
              No enviaste respuesta esta ronda.
            </p>
          )}
          <h2 className="mt-3 text-2xl font-900 text-[var(--navy)]">
            {room.winners && room.winners.length > 0
              ? room.winners.length === 1
                ? `Más puntos: ${room.winners[0]}`
                : `Empate: ${room.winners.join(", ")}`
              : "Sin aciertos"}
          </h2>
          <ol className="mt-4 space-y-2">
            {(room.results ?? []).map((r) => (
              <li
                key={r.playerId}
                className={`flex justify-between rounded-xl px-3 py-2 font-800 ${
                  r.winner ? "bg-[var(--sun)]/70" : "bg-white/80"
                }`}
              >
                <span>
                  {r.name}
                  {r.playerId === playerId ? " (vos)" : ""}
                  {r.correct ? " ✓" : ""}
                </span>
                <span>+{r.points}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center font-700 text-[var(--ink-soft)]">
            Esperá el siguiente producto en la TV…
          </p>
        </section>
      ) : null}

      {room.phase === "finished" ? (
        <section className="mt-8">
          <h2 className="brand text-4xl text-[var(--brown)]">Ranking final</h2>
          <ol className="mt-5 space-y-2">
            {[...room.players]
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <li
                  key={p.id}
                  className="paper-panel flex justify-between px-4 py-3 text-lg font-900"
                >
                  <span>
                    {i + 1}. {p.name}
                    {p.id === playerId ? " (vos)" : ""}
                  </span>
                  <span>{p.score} pts</span>
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      {msg ? (
        <p className="mt-5 text-center font-800 text-[var(--navy)]">{msg}</p>
      ) : null}
    </main>
  );
}

export default function JugarPage() {
  return (
    <Suspense
      fallback={
        <main className="tv-shell grid place-items-center p-6">
          <p className="brand text-3xl text-[var(--navy)]">Cargando…</p>
        </main>
      }
    >
      <JugarInner />
    </Suspense>
  );
}
