import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { createPresentationSession } from "@/lib/simulation/presentation-service";
import { toApiError, Errors } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const form = await req.formData();

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw Errors.badRequest("No file was uploaded.", "MISSING_FILE");
    }
    const title = String(form.get("title") ?? "").trim();
    if (!title) throw Errors.badRequest("Presentation title is required.", "MISSING_TITLE");

    const presentationType = String(form.get("presentationType") ?? "Other");
    const audience = String(form.get("audience") ?? "General Audience");
    const targetDurationSeconds = Number(form.get("targetDurationSeconds") ?? 300);
    const evaluationMode = String(form.get("evaluationMode") ?? "practice") as
      | "practice"
      | "assessment"
      | "placement_simulation";

    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = await createPresentationSession(session, {
      title,
      presentationType,
      audience,
      targetDurationSeconds,
      evaluationMode,
      file: { filename: file.name, mimeType: file.type, bytes },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
