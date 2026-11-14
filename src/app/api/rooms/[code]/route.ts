import { NextRequest, NextResponse } from "next/server";
import { buildRoomView } from "@/lib/game";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const hostToken = req.nextUrl.searchParams.get("hostToken") ?? undefined;
  const playerId = req.nextUrl.searchParams.get("playerId") ?? undefined;

  try {
    const view = await buildRoomView(code, { hostToken, playerId });
    if (!view) {
      return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    }
    return NextResponse.json(view);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al leer sala";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
