/* Seed a demo student + trainer account for local development. */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { users, simulationProgress, evaluationConfigs } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";

async function upsertUser(email: string, name: string, role: "student" | "trainer" | "admin", password: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing;
  const passwordHash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ id: randomUUID(), email, name, role, passwordHash })
    .returning();
  return row;
}

async function main() {
  const student = await upsertUser("student@winnerscreek.dev", "Asha Verma", "student", "student123");
  await upsertUser("trainer@winnerscreek.dev", "Rohan Mehta", "trainer", "trainer123");

  const existingProgress = await db.query.simulationProgress.findFirst({
    where: eq(simulationProgress.userId, student.id),
  });
  if (!existingProgress) {
    await db.insert(simulationProgress).values({
      userId: student.id,
      totalSimulations: 0,
      presentationsCompleted: 0,
      interviewsCompleted: 0,
      practiceStreakDays: 0,
    });
  }

  const activeConfig = await db.query.evaluationConfigs.findFirst({
    where: eq(evaluationConfigs.isActive, true),
  });
  if (!activeConfig) {
    await db.insert(evaluationConfigs).values({
      name: "Default weighting",
      scope: "global",
      isActive: true,
      weights: {
        content: 20,
        structure: 15,
        communication: 20,
        delivery: 20,
        timeManagement: 10,
        slideHandling: 10,
        qa: 5,
      },
    });
  }

  console.log("Seeded:");
  console.log("  student@winnerscreek.dev / student123");
  console.log("  trainer@winnerscreek.dev / trainer123");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
