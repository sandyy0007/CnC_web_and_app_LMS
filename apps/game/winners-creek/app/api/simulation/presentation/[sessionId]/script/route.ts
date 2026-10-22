import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { updateScript } from "@/lib/simulation/presentation-service";
import { toApiError } from "@/lib/errors";

const Schema = z.object({
  scriptMode: z.enum(["ai_script", "own_notes", "none"]),
  scriptContent: z.string().nullable(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const session = await requireSession();
    const { sessionId } = await ctx.params;
    const body = Schema.parse(await req.json());
    await updateScript(session, sessionId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
