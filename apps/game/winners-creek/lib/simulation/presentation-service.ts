import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  simulationSessions,
  presentationSessions,
  presentationSlides,
  simulationAttempts,
  presentationSlideEvents,
  speechMetrics,
  recordingAssets,
  presentationEvaluations,
  simulationScoreHistory,
} from "@/lib/db/schema";
import { refreshProgressRollup } from "@/lib/simulation/dashboard-service";
import { Errors } from "@/lib/errors";
import { requireOwnerOrTrainer } from "@/lib/auth/rbac";
import type { Session } from "@/lib/auth/session";
import { parsePresentation } from "@/lib/slides";
import { validateSlideFile } from "@/lib/upload/validate";
import { putObject, getObject, storageKeyToServeUrl } from "@/lib/storage";
import { computeBasicSpeechMetrics } from "@/lib/analysis/speech";
import { runPresentationEvaluationPipeline } from "@/lib/ai/orchestrator";
import { getAIProvider } from "@/lib/ai/factory";
import type { QAEvaluationItem } from "@/lib/ai/types";
import {
  estimateSpeakingSeconds,
  type PresentationType,
  type Audience,
  type EvaluationMode,
} from "@/lib/domain/types";

export interface CreatePresentationInput {
  title: string;
  presentationType: PresentationType | string;
  audience: Audience | string;
  targetDurationSeconds: number;
  evaluationMode: EvaluationMode;
  file: { filename: string; mimeType: string; bytes: Uint8Array };
}

export async function createPresentationSession(session: Session, input: CreatePresentationInput) {
  validateSlideFile(input.file.filename, input.file.mimeType, input.file.bytes.byteLength);

  const parsed = await parsePresentation(input.file.filename, input.file.bytes);
  if (parsed.slides.length === 0) {
    throw Errors.unprocessable(
      "No slides could be read from that file. It may be corrupted or empty.",
      "NO_SLIDES_FOUND",
    );
  }

  const ext = input.file.filename.toLowerCase().split(".").pop() ?? "bin";
  const sourceKey = await putObject(input.file.bytes, { prefix: "slide-sources", ext });

  const sessionId = randomUUID();
  const presentationSessionId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(simulationSessions).values({
      id: sessionId,
      userId: session.userId,
      type: "presentation",
      title: input.title,
      evaluationMode: input.evaluationMode,
      status: "ready",
    });

    const [sourceAsset] = await tx
      .insert(recordingAssets)
      .values({
        ownerUserId: session.userId,
        kind: "slide_source",
        storageKey: sourceKey,
        mimeType: input.file.mimeType || "application/octet-stream",
        sizeBytes: input.file.bytes.byteLength,
      })
      .returning();

    await tx.insert(presentationSessions).values({
      id: presentationSessionId,
      sessionId,
      presentationType: input.presentationType,
      audience: input.audience,
      targetDurationSeconds: input.targetDurationSeconds,
      scriptMode: "none",
      sourceAssetId: sourceAsset.id,
      slideCount: parsed.slides.length,
    });

    // Writing image files to disk is safe to parallelize (no shared
    // resource), but the DB inserts below run on the transaction's single
    // connection — pg does not support overlapping queries on one client,
    // so those must stay sequential (a for-of, not Promise.all).
    const storedImages = await Promise.all(
      parsed.slides.map(async (slide) => {
        const imageBytes = parsed.slideImages?.[slide.index];
        if (!imageBytes) return null;
        const imageKey = await putObject(imageBytes, { prefix: "slide-images", ext: "png" });
        return { imageKey, sizeBytes: imageBytes.byteLength };
      }),
    );

    const slideRows: (typeof presentationSlides.$inferInsert)[] = [];
    for (const slide of parsed.slides) {
      const stored = storedImages[slide.index];
      let imageAssetId: string | null = null;
      if (stored) {
        const assetId = randomUUID();
        await tx.insert(recordingAssets).values({
          id: assetId,
          ownerUserId: session.userId,
          kind: "slide_image",
          storageKey: stored.imageKey,
          mimeType: "image/png",
          sizeBytes: stored.sizeBytes,
        });
        imageAssetId = assetId;
      }
      slideRows.push({
        presentationSessionId,
        slideIndex: slide.index,
        textContent: slide.textContent,
        notes: slide.notes,
        imageAssetId,
      });
    }

    if (slideRows.length > 0) {
      await tx.insert(presentationSlides).values(slideRows);
    }
  });

  return { sessionId, slideCount: parsed.slides.length, renderWarning: parsed.renderWarning };
}

export async function getPresentationDetail(session: Session, sessionId: string) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  const presentation = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.sessionId, sessionId),
  });
  if (!presentation) throw Errors.notFound("Presentation configuration not found");

  let slides = await db.query.presentationSlides.findMany({
    where: eq(presentationSlides.presentationSessionId, presentation.id),
    orderBy: (t, { asc }) => [asc(t.slideIndex)],
  });

  // If any slides are missing imageAssetId, auto-heal from the sourceAsset
  if (slides.some((s) => !s.imageAssetId)) {
    try {
      let sourceAsset = presentation.sourceAssetId
        ? await db.query.recordingAssets.findFirst({ where: eq(recordingAssets.id, presentation.sourceAssetId) })
        : null;
      if (!sourceAsset) {
        sourceAsset = await db.query.recordingAssets.findFirst({
          where: and(eq(recordingAssets.ownerUserId, simSession.userId), eq(recordingAssets.kind, "slide_source")),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });
      }
      if (sourceAsset) {
        const fileBytes = await getObject(sourceAsset.storageKey);
        const filename = sourceAsset.storageKey.split("/").pop() ?? "slides.pptx";
        const parsed = await parsePresentation(filename, fileBytes);
        for (const slide of slides) {
          if (!slide.imageAssetId && parsed.slideImages[slide.slideIndex]) {
            const imgBytes = parsed.slideImages[slide.slideIndex];
            const imageKey = await putObject(imgBytes, { prefix: "slide-images", ext: parsed.isSvg ? "svg" : "png" });
            const [asset] = await db
              .insert(recordingAssets)
              .values({
                ownerUserId: simSession.userId,
                kind: "slide_image",
                storageKey: imageKey,
                mimeType: parsed.isSvg ? "image/svg+xml" : "image/png",
                sizeBytes: imgBytes.length,
              })
              .returning();
            await db
              .update(presentationSlides)
              .set({ imageAssetId: asset.id })
              .where(eq(presentationSlides.id, slide.id));
            slide.imageAssetId = asset.id;
          }
        }
        slides = await db.query.presentationSlides.findMany({
          where: eq(presentationSlides.presentationSessionId, presentation.id),
          orderBy: (t, { asc }) => [asc(t.slideIndex)],
        });
      }
    } catch (e) {
      console.error("[getPresentationDetail] Auto-healing slide images failed:", e);
    }
  }

  const slideImageAssetIds = slides.map((s) => s.imageAssetId).filter((id): id is string => Boolean(id));
  const imageAssets =
    slideImageAssetIds.length > 0
      ? await db.query.recordingAssets.findMany({
          where: (t, { inArray }) => inArray(t.id, slideImageAssetIds),
        })
      : [];
  const imageUrlById = new Map(imageAssets.map((a) => [a.id, storageKeyToServeUrl(a.storageKey)]));

  const attempts = await db.query.simulationAttempts.findMany({
    where: eq(simulationAttempts.sessionId, sessionId),
    orderBy: (t, { desc: d }) => [d(t.attemptNumber)],
  });

  const estimatedSpeakingSeconds = estimateSpeakingSeconds(
    slides.map((s) => ({ index: s.slideIndex, textContent: s.textContent, notes: s.notes })),
  );

  return {
    session: simSession,
    presentation,
    slides: slides.map((s) => ({
      ...s,
      imageUrl: s.imageAssetId ? imageUrlById.get(s.imageAssetId) ?? null : null,
    })),
    attempts,
    estimatedSpeakingSeconds,
  };
}

export async function updateScript(
  session: Session,
  sessionId: string,
  input: { scriptMode: "ai_script" | "own_notes" | "none"; scriptContent: string | null },
) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  await db
    .update(presentationSessions)
    .set({ scriptMode: input.scriptMode, scriptContent: input.scriptContent })
    .where(eq(presentationSessions.sessionId, sessionId));
}

export async function generateAIScript(session: Session, sessionId: string) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  const presentation = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.sessionId, sessionId),
  });
  if (!presentation) throw Errors.notFound("Presentation configuration not found");

  const slides = await db.query.presentationSlides.findMany({
    where: eq(presentationSlides.presentationSessionId, presentation.id),
    orderBy: (t, { asc }) => [asc(t.slideIndex)],
  });

  const prompt = `You are an elite executive speechwriter and presentation coach.
Create an engaging, professional, slide-by-slide spoken script for this presentation.

Presentation Context:
- Title: "${simSession.title}"
- Audience: "${presentation.audience}"
- Type: "${presentation.presentationType}"
- Target Duration: ${presentation.targetDurationSeconds} seconds (${Math.round(presentation.targetDurationSeconds / 60)} minutes)
- Total Slides: ${slides.length}

Slides Content:
${slides.map((s) => `[Slide ${s.slideIndex + 1}]
Content: ${s.textContent || "(Visual slide content)"}
Notes: ${s.notes || "(None)"}`).join("\n\n")}

Instructions:
1. Provide a natural, persuasive spoken rehearsal script formatted cleanly by slide: [Slide 1], [Slide 2], etc.
2. Include vocal transition phrases and timing recommendations.
3. Tailor tone specifically to the "${presentation.audience}" audience.`;

  const provider = getAIProvider();
  let script: string;
  try {
    script = await provider.generateText({
      systemPrompt: "You are a professional executive communications coach.",
      userPrompt: prompt,
    });
  } catch (err) {
    console.warn("AI Provider failed for script generation, generating structured script:", err);
    script = slides
      .map((s, idx) => {
        const bulletPoints = s.textContent.split("\n").filter((l) => l.trim().length > 0).slice(0, 3);
        return `[Slide ${idx + 1} - ${idx === 0 ? "Opening & Overview" : idx === slides.length - 1 ? "Conclusion & Next Steps" : "Core Analysis"}]
${s.notes ? `Key focus: ${s.notes}\n` : ""}"Welcome everyone. Moving to slide ${idx + 1}, our focus here is straightforward: ${bulletPoints.join(". ")}. Let's explore what this means for our objectives."`;
      })
      .join("\n\n");
  }

  await db
    .update(presentationSessions)
    .set({ scriptMode: "ai_script", scriptContent: script })
    .where(eq(presentationSessions.sessionId, sessionId));

  return { script };
}

export async function startAttempt(session: Session, sessionId: string) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  const existing = await db.query.simulationAttempts.findMany({
    where: eq(simulationAttempts.sessionId, sessionId),
  });
  const attemptNumber = existing.length + 1;

  const [attempt] = await db
    .insert(simulationAttempts)
    .values({
      sessionId,
      attemptNumber,
      status: "in_progress",
      startedAt: new Date(),
    })
    .returning();

  await db
    .update(simulationSessions)
    .set({ status: "in_progress", updatedAt: new Date() })
    .where(eq(simulationSessions.id, sessionId));

  return attempt;
}

export const createAttempt = startAttempt;

export interface EndAttemptInput {
  durationSeconds: number;
  tabVisibilityChanges: number;
  transcript: string;
  slideEvents: { slideIndex: number; enteredAtMs: number; leftAtMs: number | null; transcriptSegment: string | null }[];
  qaItems?: QAEvaluationItem[];
}

export async function endAttempt(
  session: Session,
  sessionId: string,
  attemptId: string,
  input: EndAttemptInput,
) {
  const attempt = await db.query.simulationAttempts.findFirst({
    where: and(eq(simulationAttempts.id, attemptId), eq(simulationAttempts.sessionId, sessionId)),
  });
  if (!attempt) throw Errors.notFound("Attempt not found");

  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  const presentation = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.sessionId, sessionId),
  });
  if (!presentation) throw Errors.notFound("Presentation configuration not found");

  const slides = await db.query.presentationSlides.findMany({
    where: eq(presentationSlides.presentationSessionId, presentation.id),
    orderBy: (t, { asc }) => [asc(t.slideIndex)],
  });

  const metrics = computeBasicSpeechMetrics(input.transcript, input.durationSeconds);

  // Run AI evaluation pipeline
  const evaluation = await runPresentationEvaluationPipeline({
    slides: slides.map((s) => ({
      index: s.slideIndex,
      textContent: s.textContent ?? "",
      notes: s.notes,
    })),
    transcript: input.transcript,
    durationSeconds: input.durationSeconds,
    targetDurationSeconds: presentation.targetDurationSeconds,
    presentationType: presentation.presentationType,
    audience: presentation.audience,
    evaluationMode: simSession.evaluationMode,
    slideEvents: input.slideEvents,
    qaItems: input.qaItems,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(simulationAttempts)
      .set({
        status: "completed",
        endedAt: new Date(),
        durationSeconds: Math.round(input.durationSeconds),
        tabVisibilityChanges: input.tabVisibilityChanges,
      })
      .where(eq(simulationAttempts.id, attemptId));

    await tx.insert(speechMetrics).values({
      attemptId,
      wpm: metrics.wpm,
      fillerCount: metrics.fillerCount,
      fillerFrequencyPerMin: metrics.fillerFrequencyPerMin,
      repeatedWordCount: metrics.repeatedWordCount,
      averageSentenceLength: metrics.averageSentenceLength,
      transcript: input.transcript,
      rawMetrics: { wordCount: metrics.wordCount, source: "web-speech-api", layer: 1 },
    });

    if (input.slideEvents.length > 0) {
      await tx.insert(presentationSlideEvents).values(
        input.slideEvents.map((e) => ({
          attemptId,
          slideIndex: e.slideIndex,
          enteredAtMs: e.enteredAtMs,
          leftAtMs: e.leftAtMs,
          transcriptSegment: e.transcriptSegment,
        })),
      );
    }

    await tx.insert(presentationEvaluations).values({
      attemptId,
      contentScore: evaluation.categories.content.score,
      structureScore: evaluation.categories.structure.score,
      communicationScore: evaluation.categories.communication.score,
      deliveryScore: evaluation.categories.delivery.score,
      timeManagementScore: evaluation.categories.timeManagement.score,
      slideHandlingScore: evaluation.categories.slideHandling.score,
      qaScore: evaluation.categories.qa.score,
      overallScore: evaluation.overallScore,
      weightsUsed: evaluation.weightsUsed,
      aiFindings: {
        executiveSummary: evaluation.executiveSummary,
        categories: evaluation.categories,
        slideFindings: evaluation.slideFindings,
        practicePlan: evaluation.practicePlan,
        aiProviderUsed: evaluation.aiProviderUsed,
      },
      evaluationVersion: evaluation.evaluationVersion,
    });

    await tx.insert(simulationScoreHistory).values({
      userId: session.userId,
      attemptId,
      type: "presentation",
      score: evaluation.overallScore,
    });

    await tx
      .update(simulationSessions)
      .set({ status: "completed", updatedAt: new Date(), completedAt: new Date() })
      .where(eq(simulationSessions.id, sessionId));
  });

  await refreshProgressRollup(session.userId);

  return { attemptId, metrics, evaluation };
}

export async function attachRecording(
  session: Session,
  sessionId: string,
  attemptId: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "bin";
  const key = await putObject(bytes, { prefix: "recordings", ext });

  const [asset] = await db
    .insert(recordingAssets)
    .values({
      ownerUserId: session.userId,
      attemptId,
      kind: "video_recording",
      storageKey: key,
      mimeType,
      sizeBytes: bytes.byteLength,
    })
    .returning();

  return { assetId: asset.id, url: storageKeyToServeUrl(asset.storageKey) };
}

export async function getAttemptDetail(session: Session, sessionId: string, attemptId: string) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  const attempt = await db.query.simulationAttempts.findFirst({
    where: and(eq(simulationAttempts.id, attemptId), eq(simulationAttempts.sessionId, sessionId)),
  });
  if (!attempt) throw Errors.notFound("Attempt not found");

  const metrics = await db.query.speechMetrics.findFirst({
    where: eq(speechMetrics.attemptId, attemptId),
  });
  const slideEvents = await db.query.presentationSlideEvents.findMany({
    where: eq(presentationSlideEvents.attemptId, attemptId),
    orderBy: (t, { asc }) => [asc(t.enteredAtMs)],
  });
  const recording = await db.query.recordingAssets.findFirst({
    where: and(eq(recordingAssets.attemptId, attemptId), eq(recordingAssets.kind, "video_recording")),
  });
  const evaluation = await db.query.presentationEvaluations.findFirst({
    where: eq(presentationEvaluations.attemptId, attemptId),
  });

  return {
    session: simSession,
    attempt,
    metrics: metrics ?? null,
    slideEvents,
    recordingUrl: recording ? storageKeyToServeUrl(recording.storageKey) : null,
    evaluation: evaluation ?? null,
  };
}

export async function evaluateAttempt(session: Session, sessionId: string, attemptId: string) {
  const detail = await getAttemptDetail(session, sessionId, attemptId);
  const presentation = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.sessionId, sessionId),
  });
  if (!presentation) throw Errors.notFound("Presentation not found");

  const slides = await db.query.presentationSlides.findMany({
    where: eq(presentationSlides.presentationSessionId, presentation.id),
    orderBy: (t, { asc }) => [asc(t.slideIndex)],
  });

  const evaluation = await runPresentationEvaluationPipeline({
    slides: slides.map((s) => ({
      index: s.slideIndex,
      textContent: s.textContent ?? "",
      notes: s.notes,
    })),
    transcript: detail.metrics?.transcript ?? "",
    durationSeconds: detail.attempt.durationSeconds ?? 0,
    targetDurationSeconds: presentation.targetDurationSeconds,
    presentationType: presentation.presentationType,
    audience: presentation.audience,
    evaluationMode: detail.session.evaluationMode,
    slideEvents: detail.slideEvents,
  });

  const [saved] = await db
    .insert(presentationEvaluations)
    .values({
      attemptId,
      contentScore: evaluation.categories.content.score,
      structureScore: evaluation.categories.structure.score,
      communicationScore: evaluation.categories.communication.score,
      deliveryScore: evaluation.categories.delivery.score,
      timeManagementScore: evaluation.categories.timeManagement.score,
      slideHandlingScore: evaluation.categories.slideHandling.score,
      qaScore: evaluation.categories.qa.score,
      overallScore: evaluation.overallScore,
      weightsUsed: evaluation.weightsUsed,
      aiFindings: {
        executiveSummary: evaluation.executiveSummary,
        categories: evaluation.categories,
        slideFindings: evaluation.slideFindings,
        practicePlan: evaluation.practicePlan,
        aiProviderUsed: evaluation.aiProviderUsed,
      },
      evaluationVersion: evaluation.evaluationVersion,
    })
    .onConflictDoUpdate({
      target: presentationEvaluations.attemptId,
      set: {
        contentScore: evaluation.categories.content.score,
        structureScore: evaluation.categories.structure.score,
        communicationScore: evaluation.categories.communication.score,
        deliveryScore: evaluation.categories.delivery.score,
        timeManagementScore: evaluation.categories.timeManagement.score,
        slideHandlingScore: evaluation.categories.slideHandling.score,
        qaScore: evaluation.categories.qa.score,
        overallScore: evaluation.overallScore,
        weightsUsed: evaluation.weightsUsed,
        aiFindings: {
          executiveSummary: evaluation.executiveSummary,
          categories: evaluation.categories,
          slideFindings: evaluation.slideFindings,
          practicePlan: evaluation.practicePlan,
          aiProviderUsed: evaluation.aiProviderUsed,
        },
        evaluationVersion: evaluation.evaluationVersion,
      },
    })
    .returning();

  return saved;
}

/** Looks the attempt up directly by id (results pages link by attempt, not session — a
 *  session can have many attempts via the re-practice loop). */
export async function getAttemptDetailById(session: Session, attemptId: string) {
  const attempt = await db.query.simulationAttempts.findFirst({
    where: eq(simulationAttempts.id, attemptId),
  });
  if (!attempt) throw Errors.notFound("Attempt not found");
  return getAttemptDetail(session, attempt.sessionId, attemptId);
}

export async function listAttemptsForSession(session: Session, sessionId: string) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  return db.query.simulationAttempts.findMany({
    where: eq(simulationAttempts.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.attemptNumber)],
  });
}

