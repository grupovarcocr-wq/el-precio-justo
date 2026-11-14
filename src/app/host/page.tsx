"use client";

import { QRCodeSVG } from "qrcode.react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatColones } from "@/lib/productos";
import { useRoom } from "@/lib/useRoom";
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
        const res = await fetch("/api/rooms", { method: "POST" });
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
  }, [codeParam, router]);

  const { room, error, setRoom } = useRoom(code, {
    hostToken,
    intervalMs: 1000,
  });

  const joinUrl = useMemo(() => {
    if (!origin || !code) return "";
    return `${origin}/jugar?code=${code}`;
  }, [origin, code]);

  async function act(action: string) {
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
        body: JSON.stringify({ hostToken: token, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setRoom(data as RoomView);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Acción falló");
    } finally {
      setBusy(false);
    }
  }

  if (!room && (busy || !error)) {
    return (
      <main className="tv-shell grid place-items-center p-8">
        <p className="brand text-4xl text-[var(--teal-deep)]">Preparando sala…</p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="tv-shell grid place-items-center p-8">
        <p className="text-xl font-800 text-[var(--coral-deep)]">{error}</p>
      </main>
    );
  }

  if (!room) return null;

  const guessedCount = room.players.filter((p) => p.hasGuessed).length;

  return (
    <main className="tv-shell">
      {room.phase === "lobby" ? (
        <LobbyTV room={room} joinUrl={joinUrl} onStart={() => void act("start")} busy={busy} />
      ) : null}

      {room.phase === "guessing" ? (
        <GuessingTV
          room={room}
          guessedCount={guessedCount}
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
        <p className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-4 py-2 font-800 text-[var(--coral-deep)] shadow">
          {actionError}
        </p>
      ) : null}
    </main>
  );
}

function LobbyTV({
  room,
  joinUrl,
  onStart,
  busy,
}: {
  room: RoomView;
  joinUrl: string;
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex flex-col justify-center px-8 py-10 sm:px-14">
        <p className="chip w-fit">Sala lista</p>
        <h1 className="brand mt-4 text-[clamp(3.5rem,10vw,7rem)] text-[var(--teal-deep)]">
          El Precio Justo
        </h1>
        <p className="mt-3 max-w-xl text-xl font-700 text-[var(--ink-soft)]">
          Escaneá el código o entrá a <strong>/jugar</strong> con el código de
          la sala.
        </p>
        <div className="mt-8 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-sm font-800 uppercase tracking-[0.2em] text-[var(--ink-soft)]">
              Código
            </p>
            <p className="brand glow-sun text-[clamp(4rem,14vw,8rem)] text-[var(--coral)]">
              {room.code}
            </p>
          </div>
          {joinUrl ? (
            <div className="rounded-[1.5rem] bg-white p-4 shadow-[var(--shadow)]">
              <QRCodeSVG value={joinUrl} size={180} level="M" includeMargin />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          id="host-start-round"
          className="btn btn-coral mt-10 w-fit text-xl"
          onClick={onStart}
          disabled={busy || room.players.length === 0}
        >
          {room.players.length === 0
            ? "Esperando jugadores…"
            : "¡Empezar primera ronda!"}
        </button>
      </section>

      <aside className="flex flex-col justify-center bg-[rgba(15,122,114,0.12)] px-8 py-10 sm:px-12">
        <h2 className="brand text-4xl text-[var(--teal-deep)]">Jugadores</h2>
        <ul className="mt-6 space-y-3">
          {room.players.length === 0 ? (
            <li className="pulse-soft text-lg font-700 text-[var(--ink-soft)]">
              Nadie se ha unido todavía…
            </li>
          ) : (
            room.players.map((p, i) => (
              <li
                key={p.id}
                className="slide-up rounded-2xl bg-white/80 px-4 py-3 text-xl font-800"
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
  onReveal,
  onSkip,
  busy,
}: {
  room: RoomView;
  guessedCount: number;
  onReveal: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const product = room.product;
  if (!product) return null;

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Full-bleed product plane */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(8,40,45,0.72), rgba(8,40,45,0.35)), url(/productos/${product.imagenProducto})`,
        }}
      />
      <div className="relative z-10 flex min-h-dvh flex-col px-6 py-6 sm:px-12 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="brand text-3xl text-white/90 sm:text-4xl">
              El Precio Justo
            </p>
            <p className="mt-1 font-800 text-[var(--sun)]">
              Ronda {room.productIndex + 1} / {room.productCount} · Código{" "}
              {room.code}
            </p>
          </div>
          <div className="rounded-2xl bg-white/90 px-4 py-3 text-right shadow">
            <p className="text-sm font-800 uppercase tracking-wide text-[var(--ink-soft)]">
              Apuestas
            </p>
            <p className="brand text-3xl text-[var(--teal-deep)]">
              {guessedCount}/{room.players.length}
            </p>
          </div>
        </div>

        <div className="mt-auto max-w-4xl pb-4">
          <h2 className="brand pop-in text-[clamp(2.4rem,7vw,5.5rem)] leading-[1.05] text-white drop-shadow">
            {product.nombre}
          </h2>
          <p className="mt-3 text-xl font-800 text-white/90">
            ¿Cuánto cuesta en colones?
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-sun text-lg"
              onClick={onReveal}
              disabled={busy}
            >
              Cerrar apuestas y revelar
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
                    ? "bg-[var(--aqua)] text-[var(--teal-deep)]"
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
  const isLast = room.productIndex >= room.productCount - 1;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative min-h-[42vh] overflow-hidden bg-[var(--teal-deep)] lg:min-h-dvh">
        <img
          src={`/productos/${product.imagenPrecio ?? product.imagenProducto}`}
          alt={`Precio de ${product.nombre}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,40,45,0.92)] via-[rgba(8,40,45,0.25)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <p className="brand text-xl text-white/80 sm:text-2xl">
            El Precio Justo
          </p>
          <p className="brand glow-sun mt-2 text-[clamp(3.2rem,9vw,6.5rem)] leading-none text-[var(--sun)]">
            {formatColones(product.precio)}
          </p>
          <p className="mt-3 max-w-xl text-base font-700 leading-snug text-white/90 sm:text-lg">
            {product.nombre}
          </p>
        </div>
      </section>

      <section className="relative z-10 flex flex-col bg-[rgba(244,252,250,0.96)] px-6 py-8 sm:px-10">
        <h2 className="brand text-4xl text-[var(--teal-deep)] sm:text-5xl">
          {room.winners && room.winners.length > 0
            ? room.winners.length === 1
              ? `¡Gana ${room.winners[0]}!`
              : `¡Empate: ${room.winners.join(", ")}!`
            : "Sin apuestas"}
        </h2>
        <p className="mt-2 font-700 text-[var(--ink-soft)]">
          Diferencia absoluta más pequeña gana la ronda.
        </p>

        <ol className="mt-6 space-y-3">
          {(room.results ?? []).map((r, i) => (
            <li
              key={r.playerId}
              className={`slide-up flex items-center justify-between rounded-2xl px-4 py-3 ${
                r.winner
                  ? "bg-[var(--sun)]/80 font-900"
                  : "bg-white/75 font-800"
              }`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span>
                {i + 1}. {r.name} — {formatColones(r.amount)}
              </span>
              <span className="text-[var(--ink-soft)]">
                Δ {formatColones(r.diff)}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          <h3 className="brand text-2xl text-[var(--teal-deep)]">
            Marcador
          </h3>
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
          {isLast ? (
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
              Siguiente producto
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
      <p className="brand text-3xl text-[var(--teal)]">El Precio Justo</p>
      <h1 className="brand mt-2 text-[clamp(3rem,10vw,6rem)] text-[var(--coral)]">
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
            className="slide-up flex justify-between rounded-2xl bg-white/80 px-5 py-4 text-2xl font-900"
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
          <p className="brand text-4xl text-[var(--teal-deep)]">Cargando…</p>
        </main>
      }
    >
      <HostInner />
    </Suspense>
  );
}
