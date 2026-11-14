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
      const res = await fetch("/api/rooms", { method: "POST" });
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
    <main className="tv-shell px-5 py-8 sm:px-10 sm:py-12">
      <header className="mx-auto w-full max-w-5xl text-center">
        <p className="chip mx-auto mb-4 slide-up">Té de canastilla · Costa Rica</p>
        <h1 className="brand pop-in text-[clamp(3rem,12vw,6.5rem)] text-[var(--teal-deep)]">
          El Precio Justo
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg font-700 text-[var(--ink-soft)] slide-up">
          El host proyecta en la TV. Los invitados adivinan desde el celular.
          Gana quien se acerque más al precio en colones.
        </p>
      </header>

      <section className="mx-auto mt-10 grid w-full max-w-4xl gap-5 sm:grid-cols-2">
        <button
          type="button"
          className="btn btn-coral pop-in min-h-[180px] rounded-[2rem] px-6 py-8 text-left shadow-[var(--shadow)]"
          style={{ borderRadius: "2rem" }}
          onClick={() => void createHost()}
          disabled={busy}
        >
          <span className="brand block text-4xl sm:text-5xl">Soy el host</span>
          <span className="mt-3 block text-base font-700 opacity-95">
            Pantalla grande / TV. Crea la sala y muestra el código QR.
          </span>
        </button>

        <form
          onSubmit={goPlay}
          className="pop-in flex min-h-[180px] flex-col justify-between rounded-[2rem] bg-[rgba(255,255,255,0.75)] p-6 shadow-[var(--shadow)] backdrop-blur"
          style={{ animationDelay: "80ms" }}
        >
          <div>
            <h2 className="brand text-4xl text-[var(--teal-deep)] sm:text-5xl">
              Quiero jugar
            </h2>
            <p className="mt-2 font-700 text-[var(--ink-soft)]">
              Entrá con el código de la TV.
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
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
        <p className="mx-auto mt-6 text-center font-800 text-[var(--coral-deep)]">
          {error}
        </p>
      ) : null}

      <footer className="mx-auto mt-auto pt-10 text-center text-sm font-700 text-[var(--ink-soft)]">
        <Link href="/jugar" className="underline-offset-4 hover:underline">
          Ir a jugar sin código
        </Link>
      </footer>
    </main>
  );
}
