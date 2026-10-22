import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOwnerOrTrainer } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { recordingAssets } from "@/lib/db/schema";
import { getObject } from "@/lib/storage";
import { toApiError, Errors } from "@/lib/errors";

/**
 * Every stored file (slide source, slide image, recording) is served
 * through this single authorized endpoint rather than a public URL —
 * "Use authorization checks on every recording endpoint" (spec §31).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  try {
    const session = await requireSession(req);
    const { key } = await ctx.params;
    const storageKey = key.join("/");

    const asset = await db.query.recordingAssets.findFirst({
      where: eq(recordingAssets.storageKey, storageKey),
    });
    if (!asset) throw Errors.notFound("Asset not found");
    requireOwnerOrTrainer(session, asset.ownerUserId);

    const bytes = await getObject(storageKey);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
