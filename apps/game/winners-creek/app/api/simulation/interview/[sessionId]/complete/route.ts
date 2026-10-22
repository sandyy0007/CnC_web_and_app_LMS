import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { completeInterviewSession } from "@/lib/simulation/interview-service";
import { toApiError } from "@/lib/errors";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireSession();
    const { sessionId } = await ctx.params;

    const result = await completeInterviewSession(session, sessionId);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
