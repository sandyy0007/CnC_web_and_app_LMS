import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getPresentationDetail } from "@/lib/simulation/presentation-service";
import { toApiError } from "@/lib/errors";

export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const session = await requireSession();
    const { sessionId } = await ctx.params;
    const detail = await getPresentationDetail(session, sessionId);
    return NextResponse.json(detail);
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
