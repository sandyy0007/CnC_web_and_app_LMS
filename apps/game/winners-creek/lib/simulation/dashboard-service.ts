import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { simulationSessions, simulationAttempts, simulationProgress, simulationScoreHistory } from "@/lib/db/schema";

/** Type-agnostic reads/rollups shared by the landing page and (later) the interview flow. */

export async function listRecentSessions(userId: string, limit = 8) {
  const sessions = await db.query.simulationSessions.findMany({
    where: eq(simulationSessions.userId, userId),
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
    limit,
  });

  return Promise.all(
    sessions.map(async (s) => {
      const attempts = await db.query.simulationAttempts.findMany({
        where: eq(simulationAttempts.sessionId, s.id),
        orderBy: (t, { desc: d }) => [d(t.attemptNumber)],
        limit: 1,
      });
      return { session: s, latestAttempt: attempts[0] ?? null };
    }),
  );
}

export async function refreshProgressRollup(userId: string) {
  const sessions = await db.query.simulationSessions.findMany({
    where: and(eq(simulationSessions.userId, userId), eq(simulationSessions.status, "completed")),
  });

  const presentationsCompleted = sessions.filter((s) => s.type === "presentation").length;
  const interviewsCompleted = sessions.filter((s) => s.type === "interview").length;

  const existing = await db.query.simulationProgress.findFirst({
    where: eq(simulationProgress.userId, userId),
  });

  const today = new Date();
  const lastPractice = existing?.lastPracticeDate ? new Date(existing.lastPracticeDate) : null;
  const isNewDay = !lastPractice || lastPractice.toDateString() !== today.toDateString();
  const isConsecutiveDay = lastPractice ? (today.getTime() - lastPractice.getTime()) / 86_400_000 <= 1.5 : false;
  const streak = isNewDay ? (isConsecutiveDay ? (existing?.practiceStreakDays ?? 0) + 1 : 1) : existing?.practiceStreakDays ?? 1;

  const values = {
    totalSimulations: presentationsCompleted + interviewsCompleted,
    presentationsCompleted,
    interviewsCompleted,
    practiceStreakDays: streak,
    lastPracticeDate: today,
    updatedAt: today,
  };

  if (existing) {
    await db.update(simulationProgress).set(values).where(eq(simulationProgress.userId, userId));
  } else {
    await db.insert(simulationProgress).values({ userId, ...values });
  }
}

export async function getProgress(userId: string) {
  const progress = await db.query.simulationProgress.findFirst({
    where: eq(simulationProgress.userId, userId),
  });
  const history = await db.query.simulationScoreHistory.findMany({
    where: eq(simulationScoreHistory.userId, userId),
    orderBy: (t, { desc: d }) => [d(t.recordedAt)],
    limit: 10,
  });
  return { progress: progress ?? null, history };
}
