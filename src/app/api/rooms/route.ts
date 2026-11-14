import { NextResponse } from "next/server";
import { createRoom } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const room = await createRoom();
    return NextResponse.json(room);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al crear sala";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
