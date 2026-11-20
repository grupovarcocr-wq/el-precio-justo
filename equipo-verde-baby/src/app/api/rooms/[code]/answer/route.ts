import { NextRequest, NextResponse } from "next/server";
import { submitAnswer } from "@/lib/game";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const body = (await req.json()) as {
      playerId?: string;
      answer?: string;
    };
    if (!body.playerId) {
      return NextResponse.json({ error: "Falta jugador" }, { status: 400 });
    }
    await submitAnswer(code, body.playerId, body.answer ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo enviar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
