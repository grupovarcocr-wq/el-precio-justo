"use client";

import { QRCodeSVG } from "qrcode.react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TIMER_CHOICES } from "@/lib/cartas";
import { CountdownRing, useCountdown } from "@/lib/Countdown";
import { useRoom } from "@/lib/useRoom";
import type { AnswerBucket, RoomView, Team } from "@/lib/game";

function HostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const codeParam = params.get("code")?.toUpperCase() ?? null;
  const [code, setCode] = useState<string | null>(codeParam);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(25);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once
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
    if (room?.phase === "answering" && remainingMs === 0 && room.roundEndsAt) {
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
      setRoom(data as RoomView);
      if (action === "merge") setMergeFrom(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Acción falló");
    } finally {
      setBusy(false);
    }
  }

  function onBucketTap(key: string) {
    if (!mergeFrom) {
      setMergeFrom(key);
      return;
    }
    if (mergeFrom === key) {
      setMergeFrom(null);
      return;
    }
    void act("merge", { fromKey: mergeFrom, intoKey: key });
  }

  if (!room && (busy || !error)) {
    return (
      <main className="tv-shell grid place-items-center p-8">
        <p className="brand text-4xl text-[var(--ink)]">Preparando sala…</p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="tv-shell grid place-items-center p-8">
        <p className="text-xl font-800 text-[var(--orange-deep)]">{error}</p>
      </main>
    );
  }

  if (!room) return null;

  const answeredCount = room.players.filter((p) => p.hasAnswered).length;

  return (
    <main className="tv-shell">
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

      {room.phase === "answering" ? (
        <AnsweringTV
          room={room}
          answeredCount={answeredCount}
          remainingMs={remainingMs}
          onClose={() => void act("close")}
          onSkip={() => void act("skip")}
          busy={busy}
        />
      ) : null}

      {room.phase === "reviewing" ? (
        <ReviewTV
          room={room}
          mergeFrom={mergeFrom}
          onBucketTap={onBucketTap}
          onScore={() => void act("score")}
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
        <FinishedTV
          room={room}
          onRestart={() => void act("restart")}
          busy={busy}
        />
      ) : null}

      {actionError ? (
        <p className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-4 py-2 font-800 text-[var(--orange-deep)] shadow">
          {actionError}
        </p>
      ) : null}
    </main>
  );
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <span className={`team-pill ${team}`}>
      {team === "green" ? "Verde" : "Naranja"}
    </span>
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
  const canStart = room.players.length >= room.minPlayers;
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative min-h-[46vh] overflow-hidden lg:min-h-dvh">
        <div
          className="absolute inset-0 bg-cover bg-[center_30%] opacity-45"
          style={{ backgroundImage: "url(/branding/leandro-eco.jpg)" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a3a2a]/90 via-[#1a3a2a]/75 to-[var(--leaf)]/50" />
        <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-10">
          <div>
            <p className="chip w-fit border-white/30 bg-white/15 text-white">
              Host · TV
            </p>
            <h1 className="brand mt-4 text-[clamp(2.4rem,6vw,4.2rem)] text-white">
              Equipo Verde
            </h1>
            <p className="script text-3xl text-[#ffb86b]">Baby Edition</p>
            <p className="mt-3 max-w-md font-700 text-white/85">
              15 rondas · mayoría gana · verde o naranja
            </p>
          </div>
          <div className="mt-8">
            <p className="text-sm font-800 uppercase tracking-widest text-white/70">
              Código de sala
            </p>
            <p className="brand mt-1 text-[clamp(3.5rem,12vw,6rem)] tracking-[0.12em] text-white">
              {room.code}
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="paper-panel flex flex-col items-center gap-3 p-5">
          {joinUrl ? (
            <QRCodeSVG value={joinUrl} size={168} bgColor="#ffffff" fgColor="#1a3a2a" />
          ) : null}
          <p className="text-center text-sm font-700 text-[var(--ink-soft)]">
            Escaneá o entrá a /jugar con el código
          </p>
        </div>

        <div className="paper-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="brand text-2xl">
              Jugadores ({room.players.length}/{room.maxPlayers})
            </h2>
            <span className="text-sm font-800 text-[var(--ink-soft)]">
              mín. {room.minPlayers}
            </span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {room.players.length === 0 ? (
              <li className="font-700 text-[var(--ink-soft)]">Esperando…</li>
            ) : (
              room.players.map((p) => (
                <li key={p.id} className="chip">
                  {p.name} <TeamBadge team={p.team} />
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="paper-panel p-5">
          <p className="mb-2 text-sm font-800 uppercase tracking-wide">
            Tiempo por ronda
          </p>
          <div className="flex flex-wrap gap-2">
            {TIMER_CHOICES.map((s) => (
              <button
                key={s}
                type="button"
                className={`btn ${timerSeconds === s ? "btn-green" : "btn-ghost"}`}
                onClick={() => onTimerChange(s)}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-orange text-xl"
          disabled={busy || !canStart}
          onClick={onStart}
        >
          {canStart
            ? "Empezar partida"
            : `Faltan jugadores (${room.players.length}/${room.minPlayers})`}
        </button>
      </section>
    </div>
  );
}

function AnsweringTV({
  room,
  answeredCount,
  remainingMs,
  onClose,
  onSkip,
  busy,
}: {
  room: RoomView;
  answeredCount: number;
  remainingMs: number;
  onClose: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const card = room.card!;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 bg-[var(--ink)] px-5 py-4 text-white sm:px-8">
        <div>
          <p className="text-sm font-800 uppercase tracking-wide text-white/70">
            Ronda {room.cardIndex + 1} / {room.cardCount}
          </p>
          <p className="brand text-2xl sm:text-3xl">{card.typeLabel}</p>
        </div>
        <CountdownRing
          remainingMs={remainingMs}
          totalSeconds={room.timerSeconds}
          size="sm"
        />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
        <p className="chip">{room.code}</p>
        <h2 className="brand mt-4 max-w-3xl text-[clamp(1.8rem,5vw,3.4rem)] text-[var(--ink)]">
          {card.prompt}
        </h2>
        {card.type === "estoOAquello" ? (
          <div className="mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[var(--leaf)] px-4 py-5 text-left text-white shadow">
              <p className="text-sm font-800 opacity-80">A</p>
              <p className="brand mt-1 text-2xl">{card.optionA}</p>
            </div>
            <div className="rounded-2xl bg-[var(--orange)] px-4 py-5 text-left text-white shadow">
              <p className="text-sm font-800 opacity-80">B</p>
              <p className="brand mt-1 text-2xl">{card.optionB}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 font-700 text-[var(--ink-soft)]">
            Respuestas secretas en el celular
          </p>
        )}
        <p className="mt-8 brand text-4xl text-[var(--leaf-deep)]">
          {answeredCount}/{room.players.length}
        </p>
        <p className="font-700 text-[var(--ink-soft)]">respondieron</p>
      </section>

      <footer className="flex flex-wrap justify-center gap-3 px-5 pb-8">
        <button
          type="button"
          className="btn btn-green"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar ronda
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onSkip}
        >
          Saltar
        </button>
      </footer>
    </div>
  );
}

function ReviewTV({
  room,
  mergeFrom,
  onBucketTap,
  onScore,
  onSkip,
  busy,
}: {
  room: RoomView;
  mergeFrom: string | null;
  onBucketTap: (key: string) => void;
  onScore: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const buckets = room.buckets ?? [];
  const isChoice = room.card?.type === "estoOAquello";
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-8">
      <header className="mb-4">
        <p className="text-sm font-800 uppercase tracking-wide text-[var(--ink-soft)]">
          Ronda {room.cardIndex + 1} · Revisar respuestas
        </p>
        <h2 className="brand mt-1 text-3xl sm:text-4xl">{room.card?.prompt}</h2>
        {!isChoice ? (
          <p className="mt-2 font-700 text-[var(--ink-soft)]">
            Tocá dos grupos para fusionar sinónimos, luego puntuá.
            {mergeFrom ? " Elegí el grupo destino…" : ""}
          </p>
        ) : (
          <p className="mt-2 font-700 text-[var(--ink-soft)]">
            Contá votos A/B y puntuá la mayoría.
          </p>
        )}
      </header>

      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {buckets.map((b) => (
          <BucketCard
            key={b.key}
            bucket={b}
            winning={room.winningKeys?.includes(b.key) ?? false}
            selected={mergeFrom === b.key}
            onClick={() => (!isChoice ? onBucketTap(b.key) : undefined)}
            clickable={!isChoice}
          />
        ))}
        {buckets.length === 0 ? (
          <p className="font-700 text-[var(--ink-soft)]">Nadie respondió.</p>
        ) : null}
      </div>

      <footer className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          className="btn btn-orange text-lg"
          disabled={busy}
          onClick={onScore}
        >
          Puntuar ronda
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onSkip}
        >
          Saltar sin puntuar
        </button>
      </footer>
    </div>
  );
}

function BucketCard({
  bucket,
  winning,
  selected,
  onClick,
  clickable,
}: {
  bucket: AnswerBucket;
  winning: boolean;
  selected: boolean;
  onClick?: () => void;
  clickable: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={`paper-panel p-4 text-left transition ${
        selected ? "ring-4 ring-[var(--orange)]" : ""
      } ${winning ? "ring-2 ring-[var(--leaf)]" : ""} ${
        clickable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="brand text-2xl text-[var(--ink)]">{bucket.label}</p>
        <span className="brand text-3xl text-[var(--leaf-deep)]">
          {bucket.count}
        </span>
      </div>
      <p className="mt-2 text-sm font-700 text-[var(--ink-soft)]">
        {bucket.answers.map((a) => a.name).join(", ")}
      </p>
      {winning ? (
        <p className="mt-2 text-sm font-800 text-[var(--leaf-deep)]">
          Mayoría
        </p>
      ) : null}
    </button>
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
  const last = room.cardIndex + 1 >= room.cardCount;
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-8">
      <header className="mb-4 text-center">
        <p className="text-sm font-800 uppercase tracking-wide text-[var(--ink-soft)]">
          Resultado · ronda {room.cardIndex + 1}
        </p>
        <h2 className="brand mt-1 text-3xl sm:text-4xl">
          {room.card?.prompt}
        </h2>
        {room.agilityWinnerName ? (
          <p className="mt-2 font-800 text-[var(--orange-deep)]">
            +1 agilidad: {room.agilityWinnerName}
          </p>
        ) : null}
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-3">
        {(room.results ?? []).map((r) => (
          <div
            key={r.playerId}
            className={`paper-panel flex items-center justify-between gap-3 p-4 ${
              r.matched ? "team-glow-green" : ""
            }`}
          >
            <div>
              <p className="brand text-2xl">{r.name}</p>
              <p className="font-700 text-[var(--ink-soft)]">{r.answer}</p>
            </div>
            <div className="text-right">
              <TeamBadge team={r.teamAfter} />
              <p className="brand mt-1 text-2xl text-[var(--leaf-deep)]">
                +{r.points}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-6 w-full max-w-md paper-panel p-4">
        <p className="brand text-xl">Marcador</p>
        <ol className="mt-2 space-y-1">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center justify-between font-800"
            >
              <span>
                {i + 1}. {p.name}{" "}
                <TeamBadge team={p.team} />
              </span>
              <span>{p.score}</span>
            </li>
          ))}
        </ol>
      </div>

      <footer className="mt-6 flex flex-wrap justify-center gap-3">
        {last ? (
          <button
            type="button"
            className="btn btn-orange text-lg"
            disabled={busy}
            onClick={onFinish}
          >
            Ver ganadores
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-green text-lg"
            disabled={busy}
            onClick={onNext}
          >
            Siguiente ronda
          </button>
        )}
      </footer>
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
  const top = ranked[0];
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10 text-center">
      <img
        src="/branding/leon-bebe.png"
        alt=""
        className="mb-4 w-28 team-glow-green"
        aria-hidden
      />
      <p className="chip">Partida terminada</p>
      <h1 className="brand mt-3 text-[clamp(2.4rem,8vw,4rem)] text-[var(--ink)]">
        ¡Equipo Verde!
      </h1>
      {top ? (
        <p className="script mt-2 text-4xl text-[var(--orange)]">
          Gana {top.name} con {top.score} pts
        </p>
      ) : null}
      <ol className="mx-auto mt-8 w-full max-w-md space-y-2 text-left">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className="paper-panel flex items-center justify-between p-3 font-800"
          >
            <span>
              {i + 1}. {p.name} <TeamBadge team={p.team} />
            </span>
            <span className="brand text-2xl">{p.score}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-green mt-8 text-lg"
        disabled={busy}
        onClick={onRestart}
      >
        Jugar de nuevo
      </button>
    </div>
  );
}

export default function HostPage() {
  return (
    <Suspense
      fallback={
        <main className="tv-shell grid place-items-center p-8">
          <p className="brand text-3xl">Cargando…</p>
        </main>
      }
    >
      <HostInner />
    </Suspense>
  );
}
