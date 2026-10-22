import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { evaluateAttempt } from "@/lib/simulation/presentation-service";
import { toApiError } from "@/lib/errors";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireSession();
    const { sessionId } = await ctx.params;
    const body = await req.json();
    const { attemptId } = body;

    if (!attemptId) {
      return NextResponse.json({ error: "Missing attemptId" }, { status: 400 });
    }

    const evaluation = await evaluateAttempt(session, sessionId, attemptId);
    return NextResponse.json({ evaluation }, { status: 200 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
