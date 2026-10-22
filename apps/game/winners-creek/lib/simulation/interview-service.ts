import { randomUUID } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  simulationSessions,
  interviewSessions,
  interviewQuestions,
  interviewAnswers,
  interviewEvaluations,
  simulationScoreHistory,
} from "@/lib/db/schema";
import { refreshProgressRollup } from "@/lib/simulation/dashboard-service";
import { Errors } from "@/lib/errors";
import { requireOwnerOrTrainer } from "@/lib/auth/rbac";
import type { Session } from "@/lib/auth/session";
import {
  evaluateInterviewAnswer,
  synthesizeInterviewSession,
} from "@/lib/ai/evaluators/interview-evaluator";
import type { InterviewQuestionItem } from "@/lib/ai/types";

export interface CreateInterviewInput {
  role: string;
  seniority: string;
  track: string;
  targetDurationSeconds: number;
  evaluationMode: "practice" | "assessment" | "placement_simulation";
  candidateNotes?: string;
}

const DEFAULT_QUESTIONS_BY_TRACK: Record<string, { category: string; text: string }[]> = {
  Engineering: [
    { category: "introduction", text: "Walk me through your background and the most architecturally challenging system you have designed." },
    { category: "technical", text: "How would you design a distributed rate limiter that handles 100,000 requests per second with strict SLAs?" },
    { category: "behavioral", text: "Tell me about a time you had a fundamental technical disagreement with a team member. How did you resolve it?" },
    { category: "behavioral", text: "Describe a major production outage you resolved under pressure. What was your triage methodology and what was the outcome?" },
  ],
  "Product & Strategy": [
    { category: "introduction", text: "Tell me about yourself and your approach to product prioritization when resources are constrained." },
    { category: "technical", text: "How would you define and measure the success of an AI-driven search feature for an e-commerce platform?" },
    { category: "behavioral", text: "Tell me about a time you had to sunset a feature that a vocal minority of power users loved." },
  ],
  "Analytics & ML": [
    { category: "introduction", text: "Walk me through your end-to-end process for deploying a machine learning model into high-throughput production." },
    { category: "technical", text: "How do you detect and mitigate data drift and concept drift in continuous real-time inference pipelines?" },
    { category: "behavioral", text: "Tell me about a project where the data contradicted stakeholder intuition. How did you present your findings?" },
  ],
};

export async function createInterviewSession(session: Session, input: CreateInterviewInput) {
  const sessionId = randomUUID();
  const interviewSessionId = randomUUID();

  const questionsTemplate = DEFAULT_QUESTIONS_BY_TRACK[input.track] ?? DEFAULT_QUESTIONS_BY_TRACK.Engineering;

  await db.transaction(async (tx) => {
    await tx.insert(simulationSessions).values({
      id: sessionId,
      userId: session.userId,
      type: "interview",
      title: `${input.seniority} ${input.role} Simulation`,
      evaluationMode: input.evaluationMode,
      status: "in_progress",
    });

    await tx.insert(interviewSessions).values({
      id: interviewSessionId,
      sessionId,
      role: input.role,
      interviewType: input.track,
      difficulty: input.seniority,
      targetDurationSeconds: input.targetDurationSeconds,
      candidateContext: input.candidateNotes ? { notes: input.candidateNotes } : {},
    });

    for (let i = 0; i < questionsTemplate.length; i++) {
      const q = questionsTemplate[i];
      await tx.insert(interviewQuestions).values({
        id: randomUUID(),
        interviewSessionId,
        orderIndex: i,
        questionText: q.text,
        category: q.category,
        isFollowUp: false,
      });
    }
  });

  return { sessionId };
}

export async function getInterviewDetail(session: Session, sessionId: string) {
  const simSession = await db.query.simulationSessions.findFirst({
    where: eq(simulationSessions.id, sessionId),
  });
  if (!simSession) throw Errors.notFound("Simulation session not found");
  requireOwnerOrTrainer(session, simSession.userId);

  const interview = await db.query.interviewSessions.findFirst({
    where: eq(interviewSessions.sessionId, sessionId),
  });
  if (!interview) throw Errors.notFound("Interview configuration not found");

  const questions = await db.query.interviewQuestions.findMany({
    where: eq(interviewQuestions.interviewSessionId, interview.id),
    orderBy: [asc(interviewQuestions.orderIndex)],
  });

  const questionIds = questions.map((q) => q.id);
  const answers = questionIds.length > 0
    ? await db.query.interviewAnswers.findMany({
        where: (t, { inArray }) => inArray(t.questionId, questionIds),
      })
    : [];

  const answerIds = answers.map((a) => a.id);
  const evaluations = answerIds.length > 0
    ? await db.query.interviewEvaluations.findMany({
        where: (t, { inArray }) => inArray(t.answerId, answerIds),
      })
    : [];

  return {
    session: simSession,
    interview: {
      ...interview,
      seniority: interview.difficulty,
      track: interview.interviewType,
    },
    questions: questions.map((q) => ({
      ...q,
      contextNotes: (q.context as { notes?: string } | null)?.notes,
    })),
    answers,
    evaluations,
  };
}

export async function submitInterviewAnswer(
  session: Session,
  sessionId: string,
  questionId: string,
  answerTranscript: string,
) {
  const detail = await getInterviewDetail(session, sessionId);
  const question = detail.questions.find((q) => q.id === questionId);
  if (!question) throw Errors.notFound("Question not found");

  const answerId = randomUUID();

  const qItem: InterviewQuestionItem = {
    id: question.id,
    orderIndex: question.orderIndex,
    questionText: question.questionText,
    category: question.category,
    isFollowUp: question.isFollowUp,
  };

  const evaluation = await evaluateInterviewAnswer(
    qItem,
    answerTranscript,
    detail.interview.role,
    detail.interview.seniority,
  );

  await db.transaction(async (tx) => {
    await tx.insert(interviewAnswers).values({
      id: answerId,
      questionId,
      transcript: answerTranscript,
      answeredAt: new Date(),
    });

    await tx.insert(interviewEvaluations).values({
      answerId,
      relevanceScore: evaluation.relevanceScore,
      specificityScore: evaluation.specificityScore,
      completenessScore: evaluation.completenessScore,
      communicationScore: evaluation.communicationScore,
      technicalScore: evaluation.technicalScore,
      starStructureDetected: evaluation.starAnalysis?.isCompleteStar ?? false,
      whatWasGood: evaluation.whatWasGood,
      whatWasMissing: evaluation.whatWasMissing,
      betterAnswerStructure: evaluation.betterAnswerStructure,
      evaluationVersion: "v1.2",
    });

    // If adaptive follow-up is generated, append it to questions
    if (evaluation.adaptiveFollowUpQuestion) {
      const highestOrder = Math.max(...detail.questions.map((q) => q.orderIndex));
      await tx.insert(interviewQuestions).values({
        id: randomUUID(),
        interviewSessionId: detail.interview.id,
        orderIndex: highestOrder + 1,
        questionText: evaluation.adaptiveFollowUpQuestion,
        category: "follow_up",
        isFollowUp: true,
      });
    }
  });

  return { answerId, evaluation };
}

export async function completeInterviewSession(session: Session, sessionId: string) {
  const detail = await getInterviewDetail(session, sessionId);

  const synthesis = synthesizeInterviewSession(
    detail.evaluations.map((e) => ({
      questionId: "",
      answerTranscript: "",
      relevanceScore: e.relevanceScore ?? 0,
      specificityScore: e.specificityScore ?? 0,
      completenessScore: e.completenessScore ?? 0,
      communicationScore: e.communicationScore ?? 0,
      technicalScore: e.technicalScore ?? 0,
      overallAnswerScore: Math.round(
        ((e.relevanceScore ?? 80) * 0.25) +
        ((e.specificityScore ?? 80) * 0.20) +
        ((e.completenessScore ?? 80) * 0.20) +
        ((e.communicationScore ?? 80) * 0.15) +
        ((e.technicalScore ?? 80) * 0.20)
      ),
      whatWasGood: (e.whatWasGood as string[]) ?? [],
      whatWasMissing: (e.whatWasMissing as string[]) ?? [],
    })),
  );

  await db.transaction(async (tx) => {
    await tx
      .update(simulationSessions)
      .set({
        status: "completed",
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(simulationSessions.id, sessionId));

    await tx
      .update(interviewSessions)
      .set({
        overallScore: synthesis.compositeScore,
      })
      .where(eq(interviewSessions.id, detail.interview.id));

    await tx.insert(simulationScoreHistory).values({
      userId: session.userId,
      interviewSessionId: detail.interview.id,
      type: "interview",
      score: synthesis.compositeScore,
    });
  });

  await refreshProgressRollup(session.userId);

  return { synthesis };
}
