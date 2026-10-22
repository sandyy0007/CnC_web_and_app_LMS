import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { simulationSessions, simulationAttempts, users } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/rbac";
import type { Session } from "@/lib/auth/session";

/**
 * Org-wide session visibility for trainers (spec §27 "review session").
 * Score override, weight configuration, assignment and question-bank
 * authoring are Phase 6 — this is the read-only slice that's honest to
 * ship now: every session, who it belongs to, and a link into the same
 * report a student sees.
 */
export async function listAllSessionsForTrainer(session: Session, limit = 100) {
  requireRole(session, "trainer");

  const rows = await db
    .select({
      sessionId: simulationSessions.id,
      title: simulationSessions.title,
      type: simulationSessions.type,
      status: simulationSessions.status,
      evaluationMode: simulationSessions.evaluationMode,
      createdAt: simulationSessions.createdAt,
      studentName: users.name,
      studentEmail: users.email,
    })
    .from(simulationSessions)
    .innerJoin(users, eq(simulationSessions.userId, users.id))
    .orderBy(desc(simulationSessions.createdAt))
    .limit(limit);

  const withAttempts = await Promise.all(
    rows.map(async (r) => {
      const latest = await db.query.simulationAttempts.findFirst({
        where: eq(simulationAttempts.sessionId, r.sessionId),
        orderBy: (t, { desc: d }) => [d(t.attemptNumber)],
      });
      return { ...r, latestAttemptId: latest?.id ?? null, durationSeconds: latest?.durationSeconds ?? null };
    }),
  );

  return withAttempts;
}

export async function getTrainerOverview(session: Session) {
  requireRole(session, "trainer");
  const distinctStudents = await db.selectDistinct({ userId: simulationSessions.userId }).from(simulationSessions);
  const allSessions = await db.select({ id: simulationSessions.id }).from(simulationSessions);
  return { totalStudents: distinctStudents.length, totalSessions: allSessions.length };
}
