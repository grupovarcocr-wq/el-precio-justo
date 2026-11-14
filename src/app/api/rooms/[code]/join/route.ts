import { NextRequest, NextResponse } from "next/server";
import { joinRoom } from "@/lib/game";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const body = (await req.json()) as { name?: string };
    const result = await joinRoom(code, body.name ?? "");
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo unir";
    const status = message.includes("no encontrada") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
