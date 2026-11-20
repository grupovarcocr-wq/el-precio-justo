"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createHost() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timerSeconds: 25 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      sessionStorage.setItem(`host:${data.code}`, data.hostToken);
      router.push(`/host?code=${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la sala");
      setBusy(false);
    }
  }

  function goPlay(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 3) {
      setError("Escribe el código de la sala");
      return;
    }
    router.push(`/jugar?code=${c}`);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-[center_28%] opacity-35 sm:bg-center"
        style={{ backgroundImage: "url(/branding/leandro-eco.jpg)" }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-[#1a3a2a] via-[#1a3a2a]/80 to-[#eef6f0]/30"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#12281c] via-[#1a3a2a]/92 to-transparent"
        aria-hidden
      />

      <img
        src="/branding/leon-bebe.png"
        alt=""
        className="pointer-events-none absolute right-[-6%] top-[5%] z-[5] w-[40%] max-w-[210px] rotate-6 drop-shadow-lg sm:right-[6%] sm:top-[7%] sm:w-[170px]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-end px-5 pb-8 pt-16 sm:px-10 sm:pb-12">
        <header className="slide-up text-left">
          <p className="chip w-fit border-white/25 bg-white/15 text-white/90">
            Baby shower · Costa Rica
          </p>
          <h1 className="brand pop-in mt-3 text-[clamp(2.6rem,9vw,5rem)] leading-[0.9] text-white">
            Equipo{" "}
            <span className="text-[var(--leaf)]" style={{ color: "#5fd68a" }}>
              Verde
            </span>
          </h1>
          <p className="script mt-2 text-[clamp(1.8rem,5vw,2.8rem)] text-[var(--orange)]">
            Baby Edition
          </p>
          <p className="mt-3 max-w-xl text-base font-700 text-white/85 sm:text-lg">
            Respondé igual que la mayoría, pasá al verde y sumá puntos. El más
            rápido entre los verdes gana +1 de agilidad.
          </p>
        </header>

        <section className="mt-8 grid w-full gap-4 sm:grid-cols-2">
          <button
            type="button"
            className="btn btn-green pop-in min-h-[120px] rounded-[1.6rem] px-6 py-6 text-left shadow-[var(--shadow)]"
            style={{ borderRadius: "1.6rem" }}
            onClick={() => void createHost()}
            disabled={busy}
          >
            <span className="brand block text-3xl sm:text-4xl">Soy el host</span>
            <span className="mt-2 block text-sm font-700 opacity-95 sm:text-base">
              Creá la sala, proyectá el código y dirigí las 15 rondas.
            </span>
          </button>

          <form
            onSubmit={goPlay}
            className="pop-in paper-panel flex min-h-[120px] flex-col justify-between p-5"
            style={{ animationDelay: "80ms" }}
          >
            <div>
              <h2 className="brand text-3xl text-[var(--ink)] sm:text-4xl">
                Quiero jugar
              </h2>
              <p className="mt-1 text-sm font-700 text-[var(--ink-soft)]">
                Entrá con el código de la pantalla.
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                className="field uppercase tracking-[0.2em]"
                placeholder="CÓDIGO"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
              />
              <button type="submit" className="btn btn-orange whitespace-nowrap">
                Unirme
              </button>
            </div>
          </form>
        </section>

        {error ? (
          <p className="mt-4 text-center font-800 text-[#ffc078]">{error}</p>
        ) : null}

        <footer className="mt-6 text-center text-sm font-700 text-white/70">
          <Link href="/jugar" className="underline-offset-4 hover:underline">
            Ir a jugar sin código
          </Link>
        </footer>
      </div>
    </main>
  );
}
