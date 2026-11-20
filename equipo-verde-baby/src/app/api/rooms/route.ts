import { NextRequest, NextResponse } from "next/server";
import { createRoom } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let timerSeconds: number | undefined;
    try {
      const body = (await req.json()) as { timerSeconds?: number };
      timerSeconds = body.timerSeconds;
    } catch {
      // empty body is fine
    }
    const room = await createRoom({ timerSeconds });
    return NextResponse.json(room);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al crear sala";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
