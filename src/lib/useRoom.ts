"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "./game";

/** Poll result when the host deleted the room. */
export const ROOM_GONE = "ROOM_GONE";

export function useRoom(
  code: string | null,
  opts: { hostToken?: string | null; playerId?: string | null; intervalMs?: number } = {},
) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const refresh = useCallback(async () => {
    if (!code) return;
    const { hostToken, playerId } = optsRef.current;
    const params = new URLSearchParams();
    if (hostToken) params.set("hostToken", hostToken);
    if (playerId) params.set("playerId", playerId);
    const qs = params.toString();
    const res = await fetch(`/api/rooms/${code}${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 404) {
        setRoom(null);
        setError(ROOM_GONE);
      } else {
        setError(data.error ?? "Error de conexión");
      }
      setLoading(false);
      return;
    }
    setRoom(data as RoomView);
    setError(null);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    if (!code) return;
    void refresh();
    const id = window.setInterval(
      () => void refresh(),
      opts.intervalMs ?? 1200,
    );
    return () => window.clearInterval(id);
  }, [code, refresh, opts.intervalMs]);

  return { room, error, loading, refresh, setRoom };
}
