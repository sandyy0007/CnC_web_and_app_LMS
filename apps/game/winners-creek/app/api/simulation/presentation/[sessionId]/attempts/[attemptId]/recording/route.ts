import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { attachRecording } from "@/lib/simulation/presentation-service";
import { validateRecordingBlob } from "@/lib/upload/validate";
import { toApiError, Errors } from "@/lib/errors";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string; attemptId: string }> },
) {
  try {
    const session = await requireSession();
    const { sessionId, attemptId } = await ctx.params;
    const form = await req.formData();
    const file = form.get("recording");
    if (!(file instanceof File)) throw Errors.badRequest("No recording uploaded.", "MISSING_RECORDING");

    validateRecordingBlob(file.type || "video/webm", file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await attachRecording(session, sessionId, attemptId, bytes, file.type || "video/webm");
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
