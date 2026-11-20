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
        body: JSON.stringify({ timerSeconds: 20 }),
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
        className="absolute inset-0 scale-105 bg-cover bg-[center_28%] opacity-40 sm:bg-center"
        style={{ backgroundImage: "url(/branding/leandro-eco.jpg)" }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-[#1b2a4a] via-[#1b2a4a]/75 to-[#f5f0e6]/35"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#141f38] via-[#1b2a4a]/90 to-transparent"
        aria-hidden
      />

      <img
        src="/branding/leon-bebe.png"
        alt=""
        className="pointer-events-none absolute right-[-6%] top-[6%] z-[5] w-[42%] max-w-[220px] rotate-6 drop-shadow-lg sm:right-[6%] sm:top-[8%] sm:w-[180px]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-end px-5 pb-8 pt-16 sm:px-10 sm:pb-12">
        <header className="slide-up text-left">
          <p className="chip w-fit border-white/30 bg-white/15 text-white/90">
            Scrapbook · colones ₡
          </p>
          <h1 className="brand pop-in mt-3 text-[clamp(2.4rem,8vw,4.6rem)] leading-[0.92] text-white">
            Té de{" "}
            <span className="script text-[1.15em] text-[var(--sun)]">
              Leandro Vargas Corao
            </span>
          </h1>
          <p className="brand mt-3 text-[clamp(1.7rem,4.5vw,2.7rem)] text-[var(--kraft)]">
            El Precio Justo
          </p>
          <p className="mt-3 max-w-xl text-base font-700 text-white/85 sm:text-lg">
            El host proyecta en la TV. Los invitados eligen entre 4 precios en
            el celular — más rápido, más puntos.
          </p>
        </header>

        <section className="mt-8 grid w-full gap-4 sm:grid-cols-2">
          <button
            type="button"
            className="btn btn-coral pop-in min-h-[120px] rounded-[1.6rem] px-6 py-6 text-left shadow-[var(--shadow)]"
            style={{ borderRadius: "1.6rem" }}
            onClick={() => void createHost()}
            disabled={busy}
          >
            <span className="brand block text-3xl sm:text-4xl">Soy el host</span>
            <span className="mt-2 block text-sm font-700 opacity-95 sm:text-base">
              Pantalla grande / TV. Crea la sala y muestra el QR.
            </span>
          </button>

          <form
            onSubmit={goPlay}
            className="pop-in paper-panel flex min-h-[120px] flex-col justify-between p-5"
            style={{ animationDelay: "80ms" }}
          >
            <div>
              <h2 className="brand text-3xl text-[var(--navy)] sm:text-4xl">
                Quiero jugar
              </h2>
              <p className="mt-1 text-sm font-700 text-[var(--ink-soft)]">
                Entrá con el código de la TV.
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
              <button type="submit" className="btn btn-teal whitespace-nowrap">
                Unirme
              </button>
            </div>
          </form>
        </section>

        {error ? (
          <p className="mt-4 text-center font-800 text-[var(--sun)]">{error}</p>
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
