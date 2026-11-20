import { NextRequest, NextResponse } from "next/server";
import { buildRoomView, hostAction, type HostAction } from "@/lib/game";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

const ACTIONS = new Set<HostAction>([
  "start",
  "close",
  "reveal",
  "next",
  "skip",
  "restart",
  "finish",
  "config",
  "cancel",
]);

export async function POST(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const body = (await req.json()) as {
      hostToken?: string;
      action?: string;
      timerSeconds?: number;
    };
    if (!body.hostToken || !body.action || !ACTIONS.has(body.action as HostAction)) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    }
    const updated = await hostAction(code, body.hostToken, body.action as HostAction, {
      timerSeconds: body.timerSeconds,
    });
    if (!updated || body.action === "cancel") {
      return NextResponse.json({ cancelled: true });
    }
    const view = await buildRoomView(code, { hostToken: body.hostToken });
    return NextResponse.json(view);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Acción falló";
    const status = message.includes("autorizado") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
