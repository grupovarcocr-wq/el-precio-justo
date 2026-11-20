"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CountdownRing, useCountdown } from "@/lib/Countdown";
import { useRoom } from "@/lib/useRoom";
import type { Team } from "@/lib/game";

function TeamBadge({ team }: { team: Team }) {
  return (
    <span className={`team-pill ${team}`}>
      {team === "green" ? "Verde" : "Naranja"}
    </span>
  );
}

function JugarInner() {
  const params = useSearchParams();
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
  const [textAnswer, setTextAnswer] = useState("");
  const [sentForCard, setSentForCard] = useState<string | null>(null);

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

  const remainingMs = useCountdown(room?.roundEndsAt, room?.serverNow);

  useEffect(() => {
    if (room?.phase === "answering" && remainingMs === 0 && room.roundEndsAt) {
      void refresh();
    }
  }, [remainingMs, room?.phase, room?.roundEndsAt, refresh]);

  const me = useMemo(() => {
    if (!room || !playerId) return null;
    return room.players.find((p) => p.id === playerId) ?? null;
  }, [room, playerId]);

  const myAnswered = Boolean(me?.hasAnswered) || sentForCard === room?.card?.id;

  useEffect(() => {
    if (room?.phase === "answering" && room.card) {
      if (sentForCard !== room.card.id) {
        setMsg(null);
        setTextAnswer("");
      }
    }
  }, [room?.phase, room?.card?.id, sentForCard]);

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

  async function sendAnswer(answer: string) {
    if (!code || !playerId || !room?.card) return;
    if (remainingMs <= 0) {
      setMsg("Se acabó el tiempo");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rooms/${code}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSentForCard(room.card.id);
      setMsg("¡Enviado! Esperá el resultado.");
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo enviar");
    } finally {
      setBusy(false);
    }
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
        <p className="chip w-fit">Baby shower</p>
        <h1 className="brand mt-3 text-5xl text-[var(--ink)]">
          Equipo Verde
        </h1>
        <p className="script text-3xl text-[var(--orange)]">Baby Edition</p>
        <p className="mt-2 font-700 text-[var(--ink-soft)]">
          Unite con el código de la pantalla y tu nombre.
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
          <button
            type="submit"
            className="btn btn-green w-full text-lg"
            disabled={busy}
          >
            Entrar a la sala
          </button>
        </form>
        {msg ? (
          <p className="mt-4 text-center font-800 text-[var(--orange-deep)]">
            {msg}
          </p>
        ) : null}
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="tv-shell grid place-items-center p-6">
        <p className="font-800 text-[var(--orange-deep)]">{error}</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="tv-shell grid place-items-center p-6">
        <p className="brand text-3xl text-[var(--ink)]">Conectando…</p>
      </main>
    );
  }

  const myResult = room.results?.find((r) => r.playerId === playerId);
  const ranked = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <main className="tv-shell mx-auto w-full max-w-lg px-5 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="brand text-3xl text-[var(--ink)]">Equipo Verde</p>
          <p className="font-800 text-[var(--ink-soft)]">
            {playerName} · sala {room.code}
          </p>
        </div>
        <div className="text-right">
          {me ? <TeamBadge team={me.team} /> : null}
          <p className="brand mt-1 text-2xl text-[var(--leaf-deep)]">
            {me?.score ?? 0} pts
          </p>
        </div>
      </header>

      {room.phase === "lobby" ? (
        <section className="mt-8 paper-panel p-5 text-center">
          <p className="brand text-3xl">En el lobby</p>
          <p className="mt-2 font-700 text-[var(--ink-soft)]">
            Esperá a que el host empiece. Mínimo {room.minPlayers} jugadores.
          </p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {room.players.map((p) => (
              <li key={p.id} className="chip">
                {p.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {room.phase === "answering" && room.card ? (
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-800 uppercase text-[var(--ink-soft)]">
                Ronda {room.cardIndex + 1}/{room.cardCount}
              </p>
              <p className="font-800 text-[var(--leaf-deep)]">
                {room.card.typeLabel}
              </p>
            </div>
            <CountdownRing
              remainingMs={remainingMs}
              totalSeconds={room.timerSeconds}
              size="sm"
            />
          </div>
          <h2 className="brand mt-4 text-3xl text-[var(--ink)]">
            {room.card.prompt}
          </h2>

          {myAnswered ? (
            <p className="mt-6 paper-panel p-4 text-center font-800 text-[var(--leaf-deep)]">
              Respuesta enviada. Esperá la revelación…
            </p>
          ) : room.card.type === "estoOAquello" ? (
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                className="option-btn bg-[var(--leaf)] text-white"
                disabled={busy || remainingMs <= 0}
                onClick={() => void sendAnswer("A")}
              >
                <span className="block text-sm opacity-80">A</span>
                {room.card.optionA}
              </button>
              <button
                type="button"
                className="option-btn bg-[var(--orange)] text-white"
                disabled={busy || remainingMs <= 0}
                onClick={() => void sendAnswer("B")}
              >
                <span className="block text-sm opacity-80">B</span>
                {room.card.optionB}
              </button>
            </div>
          ) : (
            <form
              className="mt-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void sendAnswer(textAnswer);
              }}
            >
              <input
                className="field"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                maxLength={80}
                placeholder="Tu respuesta…"
                autoComplete="off"
                disabled={busy || remainingMs <= 0}
              />
              <button
                type="submit"
                className="btn btn-green w-full text-lg"
                disabled={busy || remainingMs <= 0 || !textAnswer.trim()}
              >
                Enviar
              </button>
            </form>
          )}
        </section>
      ) : null}

      {room.phase === "reviewing" ? (
        <section className="mt-8 paper-panel p-5 text-center">
          <p className="brand text-3xl">El host revisa…</p>
          <p className="mt-2 font-700 text-[var(--ink-soft)]">
            Agrupando respuestas parecidas antes de puntuar.
          </p>
        </section>
      ) : null}

      {room.phase === "revealed" ? (
        <section className="mt-6 space-y-4">
          {myResult ? (
            <div
              className={`paper-panel p-5 text-center ${
                myResult.matched ? "team-glow-green" : "team-glow-orange"
              }`}
            >
              <p className="brand text-3xl">
                {myResult.matched ? "¡Mayoría!" : "Sin mayoría"}
              </p>
              <p className="mt-2 font-700">Tu respuesta: {myResult.answer}</p>
              <div className="mt-3 flex items-center justify-center gap-3">
                <TeamBadge team={myResult.teamAfter} />
                <span className="brand text-3xl text-[var(--leaf-deep)]">
                  +{myResult.points}
                </span>
              </div>
              {myResult.fastest ? (
                <p className="mt-2 font-800 text-[var(--orange-deep)]">
                  +1 agilidad (el más rápido)
                </p>
              ) : null}
            </div>
          ) : (
            <p className="paper-panel p-4 text-center font-700">
              No enviaste respuesta esta ronda.
            </p>
          )}
          <div className="paper-panel p-4">
            <p className="brand text-xl">Marcador</p>
            <ol className="mt-2 space-y-1">
              {ranked.slice(0, 8).map((p, i) => (
                <li
                  key={p.id}
                  className={`flex justify-between font-800 ${
                    p.id === playerId ? "text-[var(--leaf-deep)]" : ""
                  }`}
                >
                  <span>
                    {i + 1}. {p.name}
                  </span>
                  <span>{p.score}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {room.phase === "finished" ? (
        <section className="mt-8 text-center">
          <img
            src="/branding/leon-bebe.png"
            alt=""
            className="mx-auto mb-3 w-24"
            aria-hidden
          />
          <p className="brand text-4xl">¡Fin!</p>
          <ol className="mt-4 space-y-2 text-left">
            {ranked.map((p, i) => (
              <li
                key={p.id}
                className="paper-panel flex justify-between p-3 font-800"
              >
                <span>
                  {i + 1}. {p.name} <TeamBadge team={p.team} />
                </span>
                <span className="brand text-2xl">{p.score}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {msg ? (
        <p className="mt-4 text-center font-800 text-[var(--orange-deep)]">
          {msg}
        </p>
      ) : null}
    </main>
  );
}

export default function JugarPage() {
  return (
    <Suspense
      fallback={
        <main className="tv-shell grid place-items-center p-6">
          <p className="brand text-3xl">Cargando…</p>
        </main>
      }
    >
      <JugarInner />
    </Suspense>
  );
}
