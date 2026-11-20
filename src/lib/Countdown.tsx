"use client";

import { useEffect, useState } from "react";

/** Live countdown synced to server `roundEndsAt` / `serverNow`. */
export function useCountdown(
  roundEndsAt: string | null | undefined,
  serverNow: string | null | undefined,
) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!roundEndsAt) {
      setRemainingMs(0);
      return;
    }
    const ends = new Date(roundEndsAt).getTime();
    const server = serverNow ? new Date(serverNow).getTime() : Date.now();
    const skew = server - Date.now();

    function tick() {
      const now = Date.now() + skew;
      setRemainingMs(Math.max(0, ends - now));
    }
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [roundEndsAt, serverNow]);

  return remainingMs;
}

export function CountdownRing({
  remainingMs,
  totalSeconds,
  size = "lg",
  tone = "dark",
}: {
  remainingMs: number;
  totalSeconds: number;
  size?: "sm" | "lg";
  tone?: "dark" | "light";
}) {
  const total = Math.max(1, totalSeconds) * 1000;
  const pct = Math.min(1, remainingMs / total);
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = seconds <= 5;
  const dim = size === "lg" ? 140 : 72;
  const stroke = size === "lg" ? 10 : 6;
  const r = (dim - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const track =
    tone === "dark" ? "rgba(255,255,255,0.25)" : "rgba(27,42,74,0.15)";
  const active = urgent
    ? "var(--sun)"
    : tone === "dark"
      ? "var(--kraft)"
      : "var(--navy)";
  const label = urgent
    ? "text-[var(--brown)]"
    : tone === "dark"
      ? "text-white"
      : "text-[var(--navy)]";

  return (
    <div
      className={`relative grid place-items-center ${urgent ? "pulse-soft" : ""}`}
      style={{ width: dim, height: dim }}
      aria-live="polite"
      aria-label={`${seconds} segundos`}
    >
      <svg width={dim} height={dim} className="-rotate-90">
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          stroke={active}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.2s linear" }}
        />
      </svg>
      <span
        className={`absolute brand leading-none ${
          size === "lg" ? "text-5xl" : "text-2xl"
        } ${label}`}
      >
        {seconds}
      </span>
    </div>
  );
}

export const OPTION_STYLES = [
  "bg-[#1b2a4a] text-[#f5f0e6]",
  "bg-[#6b4a2e] text-[#f5f0e6]",
  "bg-[#3d5a7a] text-[#f5f0e6]",
  "bg-[#e0c04a] text-[#1b2a4a]",
] as const;
