import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Winners Creek — Simulation Lab schema (spec section 28).
 *
 * Design notes (documented once here rather than scattered in comments):
 * - `simulation_sessions` is the type-agnostic envelope (what was started,
 *   by whom, under what evaluation mode). `simulation_attempts` is one run
 *   of it — this is what makes the re-practice loop (section 18) a plain
 *   query ("attempts for this session, ordered") instead of special-cased
 *   tables per retry.
 * - `presentation_sessions` / `interview_sessions` hold the type-specific
 *   setup and hang off `simulation_sessions` 1:1. Slide/question data hangs
 *   off those, not off the attempt, because slides don't change between
 *   re-practice attempts — attempt-scoped tables (slide_events, speech-
 *   metrics, visual_metrics, evaluations) hold what changed *this* run.
 * - `interview_evaluations` is per-answer (question-by-question analysis,
 *   section 24); the session-level rollup lives as columns on
 *   `interview_sessions` since it's derived, not independently authored.
 * - `evaluation_version` + `evaluation_configs.weights` make scoring
 *   reproducible: given the same stored metrics + AI findings + weight
 *   set, the final score recomputes identically (section 13).
 */

// ---------- enums ----------

export const userRoleEnum = pgEnum("user_role", ["student", "trainer", "admin"]);
export const simulationTypeEnum = pgEnum("simulation_type", ["presentation", "interview"]);
export const evaluationModeEnum = pgEnum("evaluation_mode", [
  "practice",
  "assessment",
  "placement_simulation",
]);
export const sessionStatusEnum = pgEnum("session_status", [
  "draft",
  "ready",
  "in_progress",
  "completed",
  "abandoned",
]);
export const attemptStatusEnum = pgEnum("attempt_status", [
  "not_started",
  "in_progress",
  "paused",
  "completed",
  "abandoned",
  "failed",
]);
export const scriptModeEnum = pgEnum("script_mode", ["ai_script", "own_notes", "none"]);
export const assetKindEnum = pgEnum("asset_kind", [
  "slide_source",
  "slide_image",
  "video_recording",
  "audio_recording",
  "resume",
  "other",
]);
export const feedbackKindEnum = pgEnum("feedback_kind", [
  "coaching",
  "practice_plan",
  "qa_followup",
  "final_report",
]);
export const trainerTargetEnum = pgEnum("trainer_target", [
  "presentation_attempt",
  "interview_session",
]);

// ---------- users (minimal — real Winners Creek auth should replace this) ----------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("student"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- envelope ----------

export const simulationSessions = pgTable(
  "simulation_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: simulationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    evaluationMode: evaluationModeEnum("evaluation_mode").notNull().default("practice"),
    status: sessionStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("simulation_sessions_user_idx").on(t.userId, t.createdAt)],
);

export const simulationAttempts = pgTable(
  "simulation_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => simulationSessions.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: attemptStatusEnum("status").notNull().default("not_started"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    tabVisibilityChanges: integer("tab_visibility_changes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("simulation_attempts_session_number_idx").on(t.sessionId, t.attemptNumber),
  ],
);

// ---------- presentation ----------

export const presentationSessions = pgTable("presentation_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => simulationSessions.id, { onDelete: "cascade" }),
  presentationType: text("presentation_type").notNull(),
  audience: text("audience").notNull(),
  targetDurationSeconds: integer("target_duration_seconds").notNull(),
  scriptMode: scriptModeEnum("script_mode").notNull().default("none"),
  scriptContent: text("script_content"),
  sourceAssetId: uuid("source_asset_id"),
  slideCount: integer("slide_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const presentationSlides = pgTable(
  "presentation_slides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    presentationSessionId: uuid("presentation_session_id")
      .notNull()
      .references(() => presentationSessions.id, { onDelete: "cascade" }),
    slideIndex: integer("slide_index").notNull(),
    textContent: text("text_content").notNull().default(""),
    notes: text("notes"),
    imageAssetId: uuid("image_asset_id"),
    objective: text("objective"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("presentation_slides_session_index_idx").on(
      t.presentationSessionId,
      t.slideIndex,
    ),
  ],
);

export const presentationSlideEvents = pgTable(
  "presentation_slide_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => simulationAttempts.id, { onDelete: "cascade" }),
    slideIndex: integer("slide_index").notNull(),
    enteredAtMs: integer("entered_at_ms").notNull(),
    leftAtMs: integer("left_at_ms"),
    transcriptSegment: text("transcript_segment"),
    flags: jsonb("flags").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("presentation_slide_events_attempt_idx").on(t.attemptId, t.enteredAtMs)],
);

export const speechMetrics = pgTable("speech_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id")
    .notNull()
    .unique()
    .references(() => simulationAttempts.id, { onDelete: "cascade" }),
  wpm: real("wpm"),
  speechDurationSeconds: real("speech_duration_seconds"),
  silenceDurationSeconds: real("silence_duration_seconds"),
  averagePauseSeconds: real("average_pause_seconds"),
  longPauseCount: integer("long_pause_count"),
  fillerCount: integer("filler_count"),
  fillerFrequencyPerMin: real("filler_frequency_per_min"),
  repeatedWordCount: integer("repeated_word_count"),
  averageSentenceLength: real("average_sentence_length"),
  rawMetrics: jsonb("raw_metrics").$type<Record<string, unknown>>(),
  transcript: text("transcript"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visualMetrics = pgTable("visual_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id")
    .notNull()
    .unique()
    .references(() => simulationAttempts.id, { onDelete: "cascade" }),
  postureStablePct: real("posture_stable_pct"),
  downwardGazeEvents: integer("downward_gaze_events"),
  movementIndex: real("movement_index"),
  cameraFacingPct: real("camera_facing_pct"),
  rawMetrics: jsonb("raw_metrics").$type<Record<string, unknown>>(),
  processedClientSide: boolean("processed_client_side").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const presentationEvaluations = pgTable("presentation_evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id")
    .notNull()
    .unique()
    .references(() => simulationAttempts.id, { onDelete: "cascade" }),
  contentScore: integer("content_score"),
  structureScore: integer("structure_score"),
  communicationScore: integer("communication_score"),
  deliveryScore: integer("delivery_score"),
  timeManagementScore: integer("time_management_score"),
  slideHandlingScore: integer("slide_handling_score"),
  qaScore: integer("qa_score"),
  overallScore: integer("overall_score"),
  weightsUsed: jsonb("weights_used").$type<Record<string, number>>(),
  aiFindings: jsonb("ai_findings").$type<Record<string, unknown>>(),
  evaluationVersion: text("evaluation_version").notNull().default("v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- interview ----------

export const interviewSessions = pgTable("interview_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => simulationSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  interviewType: text("interview_type").notNull(),
  difficulty: text("difficulty").notNull(),
  targetDurationSeconds: integer("target_duration_seconds").notNull(),
  resumeAssetId: uuid("resume_asset_id"),
  candidateContext: jsonb("candidate_context").$type<Record<string, unknown>>(),
  overallScore: integer("overall_score"),
  categoryScores: jsonb("category_scores").$type<Record<string, number>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const interviewQuestions = pgTable(
  "interview_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    interviewSessionId: uuid("interview_session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    questionText: text("question_text").notNull(),
    category: text("category").notNull(),
    isFollowUp: boolean("is_follow_up").notNull().default(false),
    context: jsonb("context").$type<Record<string, unknown>>(),
    askedAt: timestamp("asked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("interview_questions_session_order_idx").on(t.interviewSessionId, t.orderIndex),
  ],
);

export const interviewAnswers = pgTable("interview_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id")
    .notNull()
    .unique()
    .references(() => interviewQuestions.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull().default(""),
  responseTimeSeconds: real("response_time_seconds"),
  speakingTimeSeconds: real("speaking_time_seconds"),
  wpm: real("wpm"),
  fillerCount: integer("filler_count"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
});

export const interviewEvaluations = pgTable("interview_evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  answerId: uuid("answer_id")
    .notNull()
    .unique()
    .references(() => interviewAnswers.id, { onDelete: "cascade" }),
  relevanceScore: integer("relevance_score"),
  specificityScore: integer("specificity_score"),
  completenessScore: integer("completeness_score"),
  communicationScore: integer("communication_score"),
  technicalScore: integer("technical_score"),
  starStructureDetected: boolean("star_structure_detected"),
  whatWasGood: jsonb("what_was_good").$type<string[]>(),
  whatWasMissing: jsonb("what_was_missing").$type<string[]>(),
  betterAnswerStructure: text("better_answer_structure"),
  evaluationVersion: text("evaluation_version").notNull().default("v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- feedback / trainer / progress ----------

export const aiFeedback = pgTable("ai_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id").references(() => simulationAttempts.id, { onDelete: "cascade" }),
  interviewSessionId: uuid("interview_session_id").references(() => interviewSessions.id, {
    onDelete: "cascade",
  }),
  kind: feedbackKindEnum("kind").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  generatedBy: text("generated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainerFeedback = pgTable("trainer_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  targetType: trainerTargetEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  trainerUserId: uuid("trainer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  comment: text("comment").notNull(),
  scoreOverride: jsonb("score_override").$type<Record<string, number>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationProgress = pgTable("simulation_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  totalSimulations: integer("total_simulations").notNull().default(0),
  presentationsCompleted: integer("presentations_completed").notNull().default(0),
  interviewsCompleted: integer("interviews_completed").notNull().default(0),
  averageScore: real("average_score"),
  bestScore: integer("best_score"),
  practiceStreakDays: integer("practice_streak_days").notNull().default(0),
  lastPracticeDate: timestamp("last_practice_date", { withTimezone: true }),
  improvementPct: real("improvement_pct"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationScoreHistory = pgTable(
  "simulation_score_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => simulationAttempts.id, {
      onDelete: "cascade",
    }),
    interviewSessionId: uuid("interview_session_id").references(() => interviewSessions.id, {
      onDelete: "cascade",
    }),
    type: simulationTypeEnum("type").notNull(),
    score: integer("score").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("simulation_score_history_user_idx").on(t.userId, t.recordedAt)],
);

export const recordingAssets = pgTable("recording_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").references(() => simulationAttempts.id, { onDelete: "cascade" }),
  interviewSessionId: uuid("interview_session_id").references(() => interviewSessions.id, {
    onDelete: "cascade",
  }),
  kind: assetKindEnum("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationSeconds: real("duration_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationConfigs = pgTable("evaluation_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("global"),
  weights: jsonb("weights")
    .$type<{
      content: number;
      structure: number;
      communication: number;
      delivery: number;
      timeManagement: number;
      slideHandling: number;
      qa: number;
    }>()
    .notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- relations (for ergonomic query API) ----------

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(simulationSessions),
  progress: one(simulationProgress, {
    fields: [users.id],
    references: [simulationProgress.userId],
  }),
}));

export const simulationSessionsRelations = relations(simulationSessions, ({ one, many }) => ({
  user: one(users, { fields: [simulationSessions.userId], references: [users.id] }),
  attempts: many(simulationAttempts),
  presentation: one(presentationSessions, {
    fields: [simulationSessions.id],
    references: [presentationSessions.sessionId],
  }),
  interview: one(interviewSessions, {
    fields: [simulationSessions.id],
    references: [interviewSessions.sessionId],
  }),
}));

export const simulationAttemptsRelations = relations(simulationAttempts, ({ one, many }) => ({
  session: one(simulationSessions, {
    fields: [simulationAttempts.sessionId],
    references: [simulationSessions.id],
  }),
  slideEvents: many(presentationSlideEvents),
  speechMetrics: one(speechMetrics, {
    fields: [simulationAttempts.id],
    references: [speechMetrics.attemptId],
  }),
  visualMetrics: one(visualMetrics, {
    fields: [simulationAttempts.id],
    references: [visualMetrics.attemptId],
  }),
  evaluation: one(presentationEvaluations, {
    fields: [simulationAttempts.id],
    references: [presentationEvaluations.attemptId],
  }),
}));

export const presentationSessionsRelations = relations(presentationSessions, ({ one, many }) => ({
  session: one(simulationSessions, {
    fields: [presentationSessions.sessionId],
    references: [simulationSessions.id],
  }),
  slides: many(presentationSlides),
}));

export const interviewSessionsRelations = relations(interviewSessions, ({ one, many }) => ({
  session: one(simulationSessions, {
    fields: [interviewSessions.sessionId],
    references: [simulationSessions.id],
  }),
  questions: many(interviewQuestions),
}));

export const interviewQuestionsRelations = relations(interviewQuestions, ({ one }) => ({
  interviewSession: one(interviewSessions, {
    fields: [interviewQuestions.interviewSessionId],
    references: [interviewSessions.id],
  }),
  answer: one(interviewAnswers, {
    fields: [interviewQuestions.id],
    references: [interviewAnswers.questionId],
  }),
}));

export const interviewAnswersRelations = relations(interviewAnswers, ({ one }) => ({
  question: one(interviewQuestions, {
    fields: [interviewAnswers.questionId],
    references: [interviewQuestions.id],
  }),
  evaluation: one(interviewEvaluations, {
    fields: [interviewAnswers.id],
    references: [interviewEvaluations.answerId],
  }),
}));
