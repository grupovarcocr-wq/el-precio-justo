import { NextRequest, NextResponse } from "next/server";
import { buildRoomView, hostAction } from "@/lib/game";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

const ACTIONS = new Set([
  "start",
  "close",
  "reveal",
  "next",
  "skip",
  "restart",
  "finish",
]);

export async function POST(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const body = (await req.json()) as {
      hostToken?: string;
      action?: string;
    };
    if (!body.hostToken || !body.action || !ACTIONS.has(body.action)) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    }
    await hostAction(
      code,
      body.hostToken,
      body.action as
        | "start"
        | "close"
        | "reveal"
        | "next"
        | "skip"
        | "restart"
        | "finish",
    );
    const view = await buildRoomView(code, { hostToken: body.hostToken });
    return NextResponse.json(view);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Acción falló";
    const status = message.includes("autorizado") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
