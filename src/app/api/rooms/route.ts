import { NextRequest, NextResponse } from "next/server";
import { createRoom, type PlayMode } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let timerSeconds: number | undefined;
    let playMode: PlayMode | undefined;
    try {
      const body = (await req.json()) as {
        timerSeconds?: number;
        playMode?: PlayMode;
      };
      timerSeconds = body.timerSeconds;
      playMode = body.playMode;
    } catch {
      // empty body is fine
    }
    const room = await createRoom({ timerSeconds, playMode });
    return NextResponse.json(room);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al crear sala";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
