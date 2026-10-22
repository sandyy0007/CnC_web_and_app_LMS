import fs from "node:fs";
import path from "node:path";
import { db } from "../lib/db/client";
import { simulationSessions, presentationSessions, presentationSlides, recordingAssets } from "../lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { config } from "../lib/config";
import { storageKeyToServeUrl } from "../lib/storage";

async function inspectSession() {
  const targetSessionId = "4840efec-cb28-441b-b950-d1c9ab0a69ba";
  console.log("==================================================");
  console.log(`AUDITING SESSION: ${targetSessionId}`);
  console.log("==================================================");

  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, targetSessionId),
  });

  if (!simSession) {
    console.error(`Session ${targetSessionId} NOT FOUND in simulation_sessions!`);
    return;
  }

  console.log("Found simulation session:", {
    id: simSession.id,
    userId: simSession.userId,
    title: simSession.title,
    status: simSession.status,
  });

  const presSession = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.sessionId, targetSessionId),
  });

  if (!presSession) {
    console.error(`No presentation_sessions record for sessionId ${targetSessionId}`);
    return;
  }

  console.log("Found presentation session:", {
    id: presSession.id,
    sessionId: presSession.sessionId,
    sourceAssetId: presSession.sourceAssetId,
    slideCount: presSession.slideCount,
  });

  const slides = await db.query.presentationSlides.findMany({
    where: eq(presentationSlides.presentationSessionId, presSession.id),
    orderBy: (t, { asc }) => [asc(t.slideIndex)],
  });

  console.log(`Found ${slides.length} slides in presentation_slides`);

  const assetIds = slides.map((s) => s.imageAssetId).filter((id): id is string => Boolean(id));
  const assets =
    assetIds.length > 0
      ? await db.query.recordingAssets.findMany({ where: inArray(recordingAssets.id, assetIds) })
      : [];
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  console.log("\n==================================================");
  console.log("SLIDE DIAGNOSTIC TABLE");
  console.log("==================================================");
  console.log("SESSION\tSLIDE_INDEX\tIMAGE_ASSET_ID\tSTORAGE_KEY\tIMAGE_URL\tFILE_EXISTS\tFILE_SIZE");

  for (const s of slides) {
    const asset = s.imageAssetId ? assetMap.get(s.imageAssetId) : null;
    const storageKey = asset ? asset.storageKey : "NONE";
    const imageUrl = asset ? storageKeyToServeUrl(asset.storageKey) : "NONE";
    let fileExists = false;
    let fileSize = 0;

    if (asset) {
      const absPath = path.resolve(process.cwd(), config.STORAGE_ROOT, asset.storageKey);
      fileExists = fs.existsSync(absPath);
      fileSize = fileExists ? fs.statSync(absPath).size : 0;
    }

    console.log(
      `${targetSessionId}\t${s.slideIndex}\t${s.imageAssetId ?? "NULL"}\t${storageKey}\t${imageUrl}\t${fileExists}\t${fileSize}`,
    );
  }
}

inspectSession().catch(console.error);
