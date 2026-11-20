"use client";

import { QRCodeSVG } from "qrcode.react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CountdownRing, OPTION_STYLES, useCountdown } from "@/lib/Countdown";
import { formatColones, TIMER_CHOICES } from "@/lib/productos";
import { ROOM_GONE, useRoom } from "@/lib/useRoom";
import type { RoomView } from "@/lib/game";

function HostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const codeParam = params.get("code")?.toUpperCase() ?? null;
  const [code, setCode] = useState<string | null>(codeParam);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(20);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    async function ensureRoom() {
      if (codeParam) {
        const stored = sessionStorage.getItem(`host:${codeParam}`);
        if (stored) {
          setHostToken(stored);
          setCode(codeParam);
          return;
        }
      }
      setBusy(true);
      try {
        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timerSeconds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error");
        sessionStorage.setItem(`host:${data.code}`, data.hostToken);
        setCode(data.code);
        setHostToken(data.hostToken);
        router.replace(`/host?code=${data.code}`);
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : "No se pudo crear la sala",
        );
      } finally {
        setBusy(false);
      }
    }
    void ensureRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once on mount / code param
  }, [codeParam, router]);

  const { room, error, setRoom, refresh } = useRoom(code, {
    hostToken,
    intervalMs: 800,
  });

  useEffect(() => {
    if (room?.timerSeconds) setTimerSeconds(room.timerSeconds);
  }, [room?.timerSeconds]);

  const remainingMs = useCountdown(room?.roundEndsAt, room?.serverNow);

  useEffect(() => {
    if (room?.phase === "guessing" && remainingMs === 0 && room.roundEndsAt) {
      void refresh();
    }
  }, [remainingMs, room?.phase, room?.roundEndsAt, refresh]);

  const joinUrl = useMemo(() => {
    if (!origin || !code) return "";
    return `${origin}/jugar?code=${code}`;
  }, [origin, code]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    const roomCode = code ?? codeParam;
    const token =
      hostToken ??
      (roomCode ? sessionStorage.getItem(`host:${roomCode}`) : null);
    if (!roomCode || !token) {
      setActionError("Falta el token del host. Recargá /host para crear sala.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostToken: token, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      if (data?.cancelled) {
        sessionStorage.removeItem(`host:${roomCode}`);
        router.replace("/");
        return;
      }
      setRoom(data as RoomView);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Acción falló");
    } finally {
      setBusy(false);
    }
  }

  async function cancelGame() {
    const ok = window.confirm(
      "¿Eliminar esta partida? Los jugadores saldrán y todos volverán al inicio.",
    );
    if (!ok) return;
    await act("cancel");
  }

  useEffect(() => {
    if (error === ROOM_GONE) {
      const roomCode = code ?? codeParam;
      if (roomCode) sessionStorage.removeItem(`host:${roomCode}`);
      router.replace("/");
    }
  }, [error, code, codeParam, router]);

  if (!room && (busy || !error || error === ROOM_GONE)) {
    return (
      <main className="tv-shell grid place-items-center p-8">
        <p className="brand text-4xl text-[var(--navy)]">
          {error === ROOM_GONE ? "Volviendo al inicio…" : "Preparando sala…"}
        </p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="tv-shell grid place-items-center p-8">
        <p className="text-xl font-800 text-[var(--brown)]">{error}</p>
      </main>
    );
  }

  if (!room) return null;

  const guessedCount = room.players.filter((p) => p.hasGuessed).length;

  return (
    <main className="tv-shell">
      <button
        type="button"
        className="fixed right-4 top-4 z-30 rounded-full border border-[var(--brown)]/25 bg-[var(--cream)]/95 px-4 py-2 text-sm font-900 text-[var(--brown)] shadow hover:bg-white disabled:opacity-60"
        onClick={() => void cancelGame()}
        disabled={busy}
      >
        Cancelar partida
      </button>

      {room.phase === "lobby" ? (
        <LobbyTV
          room={room}
          joinUrl={joinUrl}
          timerSeconds={timerSeconds}
          onTimerChange={(s) => {
            setTimerSeconds(s);
            void act("config", { timerSeconds: s });
          }}
          onStart={() => void act("start", { timerSeconds })}
          busy={busy}
        />
      ) : null}

      {room.phase === "guessing" ? (
        <GuessingTV
          room={room}
          guessedCount={guessedCount}
          remainingMs={remainingMs}
          onReveal={() => void act("reveal")}
          onSkip={() => void act("skip")}
          busy={busy}
        />
      ) : null}

      {room.phase === "revealed" ? (
        <RevealTV
          room={room}
          onNext={() => void act("next")}
          onFinish={() => void act("finish")}
          busy={busy}
        />
      ) : null}

      {room.phase === "finished" ? (
        <FinishedTV room={room} onRestart={() => void act("restart")} busy={busy} />
      ) : null}

      {actionError ? (
        <p className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--cream)] px-4 py-2 font-800 text-[var(--brown)] shadow">
          {actionError}
        </p>
      ) : null}
    </main>
  );
}

function LobbyTV({
  room,
  joinUrl,
  timerSeconds,
  onTimerChange,
  onStart,
  busy,
}: {
  room: RoomView;
  joinUrl: string;
  timerSeconds: number;
  onTimerChange: (s: number) => void;
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative min-h-[48vh] overflow-hidden lg:min-h-dvh">
        <div
          className="absolute inset-0 bg-cover bg-[center_30%] opacity-50 sm:bg-center"
          style={{ backgroundImage: "url(/branding/leandro-eco.jpg)" }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#141f38] via-[#1b2a4a]/70 to-[#f5f0e6]/25"
          aria-hidden
        />
        <img
          src="/branding/leon-bebe.png"
          alt=""
          className="pointer-events-none absolute right-4 top-6 z-[5] w-28 drop-shadow-md sm:w-36 lg:right-8 lg:top-10"
          aria-hidden
        />
        <div className="relative z-10 flex h-full min-h-[48vh] flex-col justify-end px-8 py-10 sm:px-14 lg:min-h-dvh">
          <h1 className="brand text-[clamp(2.2rem,5.5vw,3.8rem)] leading-[0.95] text-white">
            Té de{" "}
            <span className="script text-[1.12em] text-[var(--sun)]">
              Leandro Vargas Corao
            </span>
          </h1>
          <p className="brand mt-2 text-[clamp(1.5rem,3.5vw,2.4rem)] text-[var(--kraft)]">
            El Precio Justo
          </p>
          <p className="mt-3 max-w-xl text-lg font-700 text-white/85">
            Escaneá el código o entrá a <strong>/jugar</strong>. Elegí entre 4
            precios — más rápido, más puntos.
          </p>
          <div className="mt-8 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-sm font-800 uppercase tracking-[0.2em] text-white/70">
                Código
              </p>
              <p className="brand glow-sun text-[clamp(4rem,14vw,8rem)] text-[var(--sun)]">
                {room.code}
              </p>
            </div>
            {joinUrl ? (
              <div className="rounded-[1.5rem] bg-[var(--cream)] p-4 shadow-[var(--shadow)]">
                <QRCodeSVG value={joinUrl} size={180} level="M" includeMargin />
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="text-sm font-800 uppercase tracking-wide text-white/75">
              Tiempo por ronda
            </span>
            {TIMER_CHOICES.map((s) => (
              <button
                key={s}
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm font-900 ${
                  timerSeconds === s
                    ? "bg-[var(--sun)] text-[var(--navy)]"
                    : "bg-white/20 text-white"
                }`}
                onClick={() => onTimerChange(s)}
                disabled={busy}
              >
                {s}s
              </button>
            ))}
          </div>

          <button
            type="button"
            id="host-start-round"
            className="btn btn-sun mt-8 w-fit text-xl"
            onClick={onStart}
            disabled={busy || room.players.length === 0}
          >
            {room.players.length === 0
              ? "Esperando jugadores…"
              : "¡Empezar primera ronda!"}
          </button>
        </div>
      </section>

      <aside className="flex flex-col justify-center bg-[rgba(196,165,116,0.18)] px-8 py-10 sm:px-12">
        <h2 className="brand text-4xl text-[var(--navy)]">Jugadores</h2>
        <ul className="mt-6 space-y-3">
          {room.players.length === 0 ? (
            <li className="pulse-soft text-lg font-700 text-[var(--ink-soft)]">
              Nadie se ha unido todavía…
            </li>
          ) : (
            room.players.map((p, i) => (
              <li
                key={p.id}
                className="slide-up paper-panel px-4 py-3 text-xl font-800"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {p.name}
              </li>
            ))
          )}
        </ul>
      </aside>
    </div>
  );
}

function GuessingTV({
  room,
  guessedCount,
  remainingMs,
  onReveal,
  onSkip,
  busy,
}: {
  room: RoomView;
  guessedCount: number;
  remainingMs: number;
  onReveal: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const product = room.product;
  if (!product) return null;

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(20,31,56,0.86), rgba(27,42,74,0.45)), url(/productos/${product.imagenProducto})`,
        }}
      />
      <div className="relative z-10 flex min-h-dvh flex-col px-6 py-6 sm:px-12 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="brand text-3xl text-white/90 sm:text-4xl">
              El Precio Justo
            </p>
            <p className="mt-1 font-800 text-[var(--sun)]">
              {room.isTiebreaker
                ? "Desempate"
                : `Ronda ${room.productIndex + 1} / ${room.productCount}`}{" "}
              · Código {room.code}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <CountdownRing
              remainingMs={remainingMs}
              totalSeconds={room.timerSeconds}
              size="lg"
            />
            <div className="rounded-2xl bg-[var(--cream)]/95 px-4 py-3 text-right shadow">
              <p className="text-sm font-800 uppercase tracking-wide text-[var(--ink-soft)]">
                Respuestas
              </p>
              <p className="brand text-3xl text-[var(--navy)]">
                {guessedCount}/{room.players.length}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-auto max-w-4xl pb-4">
          <h2 className="brand pop-in text-[clamp(2.2rem,6.5vw,5rem)] leading-[1.05] text-white drop-shadow">
            {product.nombre}
          </h2>
          <p className="mt-3 text-xl font-800 text-white/90">
            ¿Cuál es el precio? · 4 opciones en el celular
          </p>

          {room.options && room.options.length === 4 ? (
            <div className="mt-5 grid grid-cols-2 gap-3 max-w-2xl">
              {room.options.map((opt, i) => (
                <div
                  key={opt}
                  className={`option-btn text-center ${OPTION_STYLES[i % 4]}`}
                >
                  {formatColones(opt)}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-sun text-lg"
              onClick={onReveal}
              disabled={busy}
            >
              Cerrar y revelar
            </button>
            <button
              type="button"
              className="btn btn-ghost text-lg"
              onClick={onSkip}
              disabled={busy}
            >
              Saltar producto
            </button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-2">
            {room.players.map((p) => (
              <li
                key={p.id}
                className={`rounded-full px-3 py-1.5 text-sm font-800 ${
                  p.hasGuessed
                    ? "bg-[var(--sun)] text-[var(--navy)]"
                    : "bg-white/25 text-white"
                }`}
              >
                {p.name}
                {p.hasGuessed ? " ✓" : " …"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RevealTV({
  room,
  onNext,
  onFinish,
  busy,
}: {
  room: RoomView;
  onNext: () => void;
  onFinish: () => void;
  busy: boolean;
}) {
  const product = room.product;
  if (!product || product.precio == null) return null;
  const top = Math.max(0, ...room.players.map((p) => p.score));
  const leadersTied =
    room.players.length >= 2 &&
    room.players.filter((p) => p.score === top).length >= 2;
  const onLastMain =
    !room.isTiebreaker && room.productIndex >= room.productCount - 1;
  const needsTiebreaker = onLastMain && leadersTied;
  const isFinal = room.isTiebreaker || (onLastMain && !leadersTied);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative min-h-[42vh] overflow-hidden bg-[var(--navy)] lg:min-h-dvh">
        <img
          src={`/productos/${product.imagenPrecio ?? product.imagenProducto}`}
          alt={`Precio de ${product.nombre}`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              `/productos/${product.imagenProducto}`;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(20,31,56,0.92)] via-[rgba(27,42,74,0.28)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <p className="brand text-xl text-white/80 sm:text-2xl">
            El Precio Justo
            {room.isTiebreaker ? " · Desempate" : ""}
          </p>
          <p className="brand glow-sun mt-2 text-[clamp(3.2rem,9vw,6.5rem)] leading-none text-[var(--sun)]">
            {formatColones(product.precio)}
          </p>
          <p className="mt-3 max-w-xl text-base font-700 leading-snug text-white/90 sm:text-lg">
            {product.nombre}
          </p>
        </div>
      </section>

      <section className="relative z-10 flex flex-col bg-[rgba(245,240,230,0.96)] px-6 py-8 sm:px-10">
        <h2 className="brand text-4xl text-[var(--navy)] sm:text-5xl">
          {room.winners && room.winners.length > 0
            ? room.winners.length === 1
              ? `¡Más puntos: ${room.winners[0]}!`
              : `¡Empate: ${room.winners.join(", ")}!`
            : "Nadie acertó"}
        </h2>
        <p className="mt-2 font-700 text-[var(--ink-soft)]">
          Correcto + velocidad = más puntos. Incorrecto = 0.
        </p>

        <ol className="mt-6 space-y-3">
          {(room.results ?? []).map((r, i) => (
            <li
              key={r.playerId}
              className={`slide-up flex items-center justify-between rounded-2xl px-4 py-3 ${
                r.winner
                  ? "bg-[var(--sun)]/85 font-900"
                  : "bg-white/80 font-800"
              }`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span>
                {i + 1}. {r.name} — {formatColones(r.amount)}
                {r.correct ? " ✓" : ""}
              </span>
              <span className="text-[var(--ink-soft)]">+{r.points} pts</span>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          <h3 className="brand text-2xl text-[var(--navy)]">Marcador</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {[...room.players]
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <li key={p.id} className="chip">
                  {p.name}: {p.score}
                </li>
              ))}
          </ul>
        </div>

        <div className="mt-auto flex flex-wrap gap-3 pt-8">
          {isFinal ? (
            <button
              type="button"
              className="btn btn-coral text-lg"
              onClick={onFinish}
              disabled={busy}
            >
              Ver ranking final
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-teal text-lg"
              onClick={onNext}
              disabled={busy}
            >
              {needsTiebreaker ? "Ronda de desempate" : "Siguiente producto"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function FinishedTV({
  room,
  onRestart,
  busy,
}: {
  room: RoomView;
  onRestart: () => void;
  busy: boolean;
}) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  const champs = ranked.filter((p) => p.score === top && top > 0);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center px-6 py-10">
      <img
        src="/branding/leon-bebe.png"
        alt=""
        className="mb-4 w-28 self-center drop-shadow"
        aria-hidden
      />
      <p className="brand text-3xl text-[var(--kraft)]">El Precio Justo</p>
      <h1 className="brand mt-2 text-[clamp(2.6rem,9vw,5.2rem)] text-[var(--brown)]">
        {champs.length === 0
          ? "Fin del juego"
          : champs.length === 1
            ? `¡Campeón: ${champs[0]!.name}!`
            : `¡Campeones: ${champs.map((c) => c.name).join(", ")}!`}
      </h1>
      <ol className="mt-8 space-y-3">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className="slide-up paper-panel flex justify-between px-5 py-4 text-2xl font-900"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span>
              {i + 1}. {p.name}
            </span>
            <span>
              {p.score} {p.score === 1 ? "punto" : "puntos"}
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-sun mt-10 w-fit text-lg"
        onClick={onRestart}
        disabled={busy}
      >
        Reiniciar partida
      </button>
    </div>
  );
}

export default function HostPage() {
  return (
    <Suspense
      fallback={
        <main className="tv-shell grid place-items-center p-8">
          <p className="brand text-4xl text-[var(--navy)]">Cargando…</p>
        </main>
      }
    >
      <HostInner />
    </Suspense>
  );
}
