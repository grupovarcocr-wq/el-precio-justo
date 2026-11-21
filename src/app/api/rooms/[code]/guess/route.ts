import { NextRequest, NextResponse } from "next/server";
import { GuessError, submitGuess } from "@/lib/game";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

function statusForReason(reason: string): number {
  switch (reason) {
    case "not_found":
    case "player":
      return 404;
    case "closed":
    case "too_late":
    case "already":
      return 409;
    default:
      return 400;
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const body = (await req.json()) as { playerId?: string; amount?: number };
    if (!body.playerId) {
      return NextResponse.json(
        { ok: false, reason: "invalid", error: "Falta jugador" },
        { status: 400 },
      );
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount)) {
      return NextResponse.json(
        { ok: false, reason: "invalid", error: "Opción inválida" },
        { status: 400 },
      );
    }
    const ack = await submitGuess(code, body.playerId, amount);
    return NextResponse.json({ ok: true, ...ack });
  } catch (error) {
    if (error instanceof GuessError) {
      return NextResponse.json(
        { ok: false, reason: error.reason, error: error.message },
        { status: statusForReason(error.reason) },
      );
    }
    const message =
      error instanceof Error ? error.message : "No se pudo enviar";
    return NextResponse.json(
      { ok: false, reason: "invalid", error: message },
      { status: 400 },
    );
  }
}
