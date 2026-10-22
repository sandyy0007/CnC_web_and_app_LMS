import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { createInterviewSession } from "@/lib/simulation/interview-service";
import { toApiError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const { role, seniority, track, targetDurationSeconds, evaluationMode, candidateNotes } = body;

    const result = await createInterviewSession(session, {
      role: role ?? "Software Engineer",
      seniority: seniority ?? "Mid-level",
      track: track ?? "Engineering",
      targetDurationSeconds: Number(targetDurationSeconds) || 900,
      evaluationMode: evaluationMode ?? "practice",
      candidateNotes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
