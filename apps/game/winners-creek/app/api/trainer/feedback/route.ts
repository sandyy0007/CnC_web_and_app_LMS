import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { trainerFeedback } from "@/lib/db/schema";
import { toApiError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, "trainer");
    const body = await req.json();

    const { targetType, targetId, comment, scoreOverride } = body;
    if (!targetType || !targetId || !comment) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const [feedback] = await db
      .insert(trainerFeedback)
      .values({
        targetType: targetType === "presentation_attempt" ? "presentation_attempt" : "interview_session",
        targetId,
        trainerUserId: session.userId,
        comment,
        scoreOverride: scoreOverride ?? null,
      })
      .returning();

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
