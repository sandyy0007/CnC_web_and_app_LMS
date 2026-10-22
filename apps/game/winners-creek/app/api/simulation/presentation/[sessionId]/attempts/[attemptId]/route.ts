import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { endAttempt, getAttemptDetail } from "@/lib/simulation/presentation-service";
import { toApiError } from "@/lib/errors";

const SlideEventSchema = z.object({
  slideIndex: z.number().int().min(0),
  enteredAtMs: z.number().int().min(0),
  leftAtMs: z.number().int().min(0).nullable(),
  transcriptSegment: z.string().nullable(),
});

const EndAttemptSchema = z.object({
  durationSeconds: z.number().min(0),
  tabVisibilityChanges: z.number().int().min(0).default(0),
  transcript: z.string().default(""),
  slideEvents: z.array(SlideEventSchema).default([]),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ sessionId: string; attemptId: string }> }) {
  try {
    const session = await requireSession();
    const { sessionId, attemptId } = await ctx.params;
    const body = EndAttemptSchema.parse(await req.json());
    const result = await endAttempt(session, sessionId, attemptId, body);
    return NextResponse.json(result);
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string; attemptId: string }> }) {
  try {
    const session = await requireSession();
    const { sessionId, attemptId } = await ctx.params;
    const detail = await getAttemptDetail(session, sessionId, attemptId);
    return NextResponse.json(detail);
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
