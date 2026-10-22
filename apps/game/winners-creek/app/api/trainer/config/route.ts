import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/rbac";
import { toApiError } from "@/lib/errors";
import { DEFAULT_RUBRIC_WEIGHTS } from "@/lib/ai/evaluators/presentation-evaluators";

const trainerConfig = {
  rubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS },
  passingThreshold: 75,
  feedbackPresets: [
    "Excellent technical depth and mastery of edge cases.",
    "Recommend adding a slide specifically comparing alternative architectures.",
    "Keep working on reducing filler words and embracing silent pauses.",
    "Great composure during the defense questioning round.",
  ],
};

export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, "trainer");
    return NextResponse.json(trainerConfig, { status: 200 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, "trainer");
    const body = await req.json();

    if (body.rubricWeights) {
      trainerConfig.rubricWeights = { ...trainerConfig.rubricWeights, ...body.rubricWeights };
    }
    if (body.passingThreshold) {
      trainerConfig.passingThreshold = Number(body.passingThreshold);
    }

    return NextResponse.json({ ok: true, config: trainerConfig }, { status: 200 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
