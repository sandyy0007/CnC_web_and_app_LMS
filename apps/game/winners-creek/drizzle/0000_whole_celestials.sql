CREATE TYPE "public"."asset_kind" AS ENUM('slide_source', 'slide_image', 'video_recording', 'audio_recording', 'resume', 'other');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('not_started', 'in_progress', 'paused', 'completed', 'abandoned', 'failed');--> statement-breakpoint
CREATE TYPE "public"."evaluation_mode" AS ENUM('practice', 'assessment', 'placement_simulation');--> statement-breakpoint
CREATE TYPE "public"."feedback_kind" AS ENUM('coaching', 'practice_plan', 'qa_followup', 'final_report');--> statement-breakpoint
CREATE TYPE "public"."script_mode" AS ENUM('ai_script', 'own_notes', 'none');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('draft', 'ready', 'in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."simulation_type" AS ENUM('presentation', 'interview');--> statement-breakpoint
CREATE TYPE "public"."trainer_target" AS ENUM('presentation_attempt', 'interview_session');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'trainer', 'admin');--> statement-breakpoint
CREATE TABLE "ai_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid,
	"interview_session_id" uuid,
	"kind" "feedback_kind" NOT NULL,
	"content" jsonb NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"weights" jsonb NOT NULL,
	"created_by" uuid,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"response_time_seconds" real,
	"speaking_time_seconds" real,
	"wpm" real,
	"filler_count" integer,
	"answered_at" timestamp with time zone,
	CONSTRAINT "interview_answers_question_id_unique" UNIQUE("question_id")
);
--> statement-breakpoint
CREATE TABLE "interview_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_id" uuid NOT NULL,
	"relevance_score" integer,
	"specificity_score" integer,
	"completeness_score" integer,
	"communication_score" integer,
	"technical_score" integer,
	"star_structure_detected" boolean,
	"what_was_good" jsonb,
	"what_was_missing" jsonb,
	"better_answer_structure" text,
	"evaluation_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_evaluations_answer_id_unique" UNIQUE("answer_id")
);
--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_session_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"question_text" text NOT NULL,
	"category" text NOT NULL,
	"is_follow_up" boolean DEFAULT false NOT NULL,
	"context" jsonb,
	"asked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"interview_type" text NOT NULL,
	"difficulty" text NOT NULL,
	"target_duration_seconds" integer NOT NULL,
	"resume_asset_id" uuid,
	"candidate_context" jsonb,
	"overall_score" integer,
	"category_scores" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "presentation_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"content_score" integer,
	"structure_score" integer,
	"communication_score" integer,
	"delivery_score" integer,
	"time_management_score" integer,
	"slide_handling_score" integer,
	"qa_score" integer,
	"overall_score" integer,
	"weights_used" jsonb,
	"ai_findings" jsonb,
	"evaluation_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentation_evaluations_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "presentation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"presentation_type" text NOT NULL,
	"audience" text NOT NULL,
	"target_duration_seconds" integer NOT NULL,
	"script_mode" "script_mode" DEFAULT 'none' NOT NULL,
	"script_content" text,
	"source_asset_id" uuid,
	"slide_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentation_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "presentation_slide_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"slide_index" integer NOT NULL,
	"entered_at_ms" integer NOT NULL,
	"left_at_ms" integer,
	"transcript_segment" text,
	"flags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_session_id" uuid NOT NULL,
	"slide_index" integer NOT NULL,
	"text_content" text DEFAULT '' NOT NULL,
	"notes" text,
	"image_asset_id" uuid,
	"objective" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recording_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"attempt_id" uuid,
	"interview_session_id" uuid,
	"kind" "asset_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_seconds" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "attempt_status" DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"tab_visibility_changes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_simulations" integer DEFAULT 0 NOT NULL,
	"presentations_completed" integer DEFAULT 0 NOT NULL,
	"interviews_completed" integer DEFAULT 0 NOT NULL,
	"average_score" real,
	"best_score" integer,
	"practice_streak_days" integer DEFAULT 0 NOT NULL,
	"last_practice_date" timestamp with time zone,
	"improvement_pct" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulation_progress_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "simulation_score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" uuid,
	"interview_session_id" uuid,
	"type" "simulation_type" NOT NULL,
	"score" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "simulation_type" NOT NULL,
	"title" text NOT NULL,
	"evaluation_mode" "evaluation_mode" DEFAULT 'practice' NOT NULL,
	"status" "session_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "speech_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"wpm" real,
	"speech_duration_seconds" real,
	"silence_duration_seconds" real,
	"average_pause_seconds" real,
	"long_pause_count" integer,
	"filler_count" integer,
	"filler_frequency_per_min" real,
	"repeated_word_count" integer,
	"average_sentence_length" real,
	"raw_metrics" jsonb,
	"transcript" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speech_metrics_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "trainer_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "trainer_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"trainer_user_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"score_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visual_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"posture_stable_pct" real,
	"downward_gaze_events" integer,
	"movement_index" real,
	"camera_facing_pct" real,
	"raw_metrics" jsonb,
	"processed_client_side" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visual_metrics_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_interview_session_id_interview_sessions_id_fk" FOREIGN KEY ("interview_session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_configs" ADD CONSTRAINT "evaluation_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_question_id_interview_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_answer_id_interview_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."interview_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_interview_session_id_interview_sessions_id_fk" FOREIGN KEY ("interview_session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_session_id_simulation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."simulation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_evaluations" ADD CONSTRAINT "presentation_evaluations_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_sessions" ADD CONSTRAINT "presentation_sessions_session_id_simulation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."simulation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_slide_events" ADD CONSTRAINT "presentation_slide_events_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_slides" ADD CONSTRAINT "presentation_slides_presentation_session_id_presentation_sessions_id_fk" FOREIGN KEY ("presentation_session_id") REFERENCES "public"."presentation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_assets" ADD CONSTRAINT "recording_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_assets" ADD CONSTRAINT "recording_assets_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_assets" ADD CONSTRAINT "recording_assets_interview_session_id_interview_sessions_id_fk" FOREIGN KEY ("interview_session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_session_id_simulation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."simulation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_progress" ADD CONSTRAINT "simulation_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_score_history" ADD CONSTRAINT "simulation_score_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_score_history" ADD CONSTRAINT "simulation_score_history_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_score_history" ADD CONSTRAINT "simulation_score_history_interview_session_id_interview_sessions_id_fk" FOREIGN KEY ("interview_session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_sessions" ADD CONSTRAINT "simulation_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_metrics" ADD CONSTRAINT "speech_metrics_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_feedback" ADD CONSTRAINT "trainer_feedback_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_metrics" ADD CONSTRAINT "visual_metrics_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_questions_session_order_idx" ON "interview_questions" USING btree ("interview_session_id","order_index");--> statement-breakpoint
CREATE INDEX "presentation_slide_events_attempt_idx" ON "presentation_slide_events" USING btree ("attempt_id","entered_at_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_slides_session_index_idx" ON "presentation_slides" USING btree ("presentation_session_id","slide_index");--> statement-breakpoint
CREATE UNIQUE INDEX "simulation_attempts_session_number_idx" ON "simulation_attempts" USING btree ("session_id","attempt_number");--> statement-breakpoint
CREATE INDEX "simulation_score_history_user_idx" ON "simulation_score_history" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "simulation_sessions_user_idx" ON "simulation_sessions" USING btree ("user_id","created_at");