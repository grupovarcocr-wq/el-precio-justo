"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatColones } from "@/lib/productos";
import { useRoom } from "@/lib/useRoom";

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
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sentForProduct, setSentForProduct] = useState<number | null>(null);

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
    intervalMs: 1100,
  });

  const myGuessed = useMemo(() => {
    if (!room || !playerId) return false;
    return room.players.some((p) => p.id === playerId && p.hasGuessed);
  }, [room, playerId]);

  useEffect(() => {
    if (room?.phase === "guessing" && room.product) {
      if (sentForProduct !== room.product.id) {
        setGuess("");
        setMsg(null);
      }
    }
  }, [room?.phase, room?.product?.id, sentForProduct]);

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

  async function sendGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !playerId || !room?.product) return;
    const amount = Number(String(guess).replace(/[^\d]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      setMsg("Escribe un precio válido en colones");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rooms/${code}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSentForProduct(room.product.id);
      setMsg("¡Enviado! Esperá la revelación en la TV.");
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
        <p className="chip w-fit">Invitado</p>
        <h1 className="brand mt-3 text-5xl text-[var(--teal-deep)]">
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
          <p className="mt-4 text-center font-800 text-[var(--coral-deep)]">
            {msg}
          </p>
        ) : null}
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="tv-shell grid place-items-center p-6">
        <p className="font-800 text-[var(--coral-deep)]">{error}</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="tv-shell grid place-items-center p-6">
        <p className="brand text-3xl text-[var(--teal-deep)]">Conectando…</p>
      </main>
    );
  }

  return (
    <main className="tv-shell mx-auto w-full max-w-lg px-5 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="brand text-3xl text-[var(--teal-deep)]">
            El Precio Justo
          </p>
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
          <div className="pulse-soft mx-auto mb-4 h-16 w-16 rounded-full bg-[var(--aqua)]" />
          <h2 className="brand text-4xl text-[var(--teal-deep)]">
            Esperando al host…
          </h2>
          <p className="mt-2 font-700 text-[var(--ink-soft)]">
            La ronda empieza cuando el host lo diga en la TV.
          </p>
          <ul className="mt-6 space-y-2 text-left">
            {room.players.map((p) => (
              <li
                key={p.id}
                className="rounded-xl bg-white/75 px-4 py-2 font-800"
              >
                {p.name}
                {p.id === playerId ? " (vos)" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {room.phase === "guessing" && room.product ? (
        <section className="mt-6">
          <div className="overflow-hidden rounded-[1.6rem] shadow-[var(--shadow)]">
            <img
              src={`/productos/${room.product.imagenProducto}`}
              alt={room.product.nombre}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <h2 className="brand mt-4 text-3xl leading-tight text-[var(--teal-deep)]">
            {room.product.nombre}
          </h2>
          <p className="mt-1 font-700 text-[var(--ink-soft)]">
            ¿Cuánto cuesta? Escribí en colones (₡).
          </p>

          {myGuessed ? (
            <div className="mt-6 rounded-[1.4rem] bg-white/80 p-5 text-center">
              <p className="brand text-3xl text-[var(--teal)]">¡Listo!</p>
              <p className="mt-2 font-700 text-[var(--ink-soft)]">
                Esperá la revelación en la TV.
              </p>
            </div>
          ) : (
            <form onSubmit={sendGuess} className="mt-5 space-y-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-900 text-[var(--teal)]">
                  ₡
                </span>
                <input
                  className="field pl-12 text-3xl tracking-wide"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={guess}
                  onChange={(e) =>
                    setGuess(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="0"
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-coral w-full text-xl"
                disabled={busy}
              >
                Enviar apuesta
              </button>
            </form>
          )}
        </section>
      ) : null}

      {room.phase === "revealed" && room.product ? (
        <section className="mt-6">
          <div className="overflow-hidden rounded-[1.6rem] shadow-[var(--shadow)]">
            <img
              src={`/productos/${room.product.imagenPrecio ?? room.product.imagenProducto}`}
              alt="Precio revelado"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <p className="brand mt-4 text-5xl text-[var(--coral)]">
            {formatColones(room.product.precio ?? 0)}
          </p>
          <h2 className="mt-2 text-2xl font-900 text-[var(--teal-deep)]">
            {room.winners && room.winners.length > 0
              ? room.winners.length === 1
                ? `Gana ${room.winners[0]}`
                : `Empate: ${room.winners.join(", ")}`
              : "Sin ganadores"}
          </h2>
          <ol className="mt-4 space-y-2">
            {(room.results ?? []).map((r) => (
              <li
                key={r.playerId}
                className={`flex justify-between rounded-xl px-3 py-2 font-800 ${
                  r.winner ? "bg-[var(--sun)]/70" : "bg-white/75"
                }`}
              >
                <span>
                  {r.name}
                  {r.playerId === playerId ? " (vos)" : ""}
                </span>
                <span>
                  {formatColones(r.amount)} · Δ {formatColones(r.diff)}
                </span>
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
          <h2 className="brand text-4xl text-[var(--coral)]">Ranking final</h2>
          <ol className="mt-5 space-y-2">
            {[...room.players]
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <li
                  key={p.id}
                  className="flex justify-between rounded-xl bg-white/80 px-4 py-3 text-lg font-900"
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
        <p className="mt-5 text-center font-800 text-[var(--teal-deep)]">
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
          <p className="brand text-3xl text-[var(--teal-deep)]">Cargando…</p>
        </main>
      }
    >
      <JugarInner />
    </Suspense>
  );
}
