import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getInterviewDetail } from "@/lib/simulation/interview-service";
import { synthesizeInterviewSession } from "@/lib/ai/evaluators/interview-evaluator";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  Play,
  CheckCircle,
} from "@/components/ui/icons";
import { formatDate } from "@/lib/utils";

export default async function InterviewResultsPage(props: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await requireSession();
  const { sessionId } = await props.params;

  let detail;
  try {
    detail = await getInterviewDetail(session, sessionId);
  } catch {
    redirect("/simulation/interview");
  }

  const { interview, questions, answers, evaluations } = detail;

  const evalList = evaluations.map((e) => ({
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
  }));

  const synthesis = synthesizeInterviewSession(evalList);

  const recommendationTone =
    synthesis.recommendation === "strong_hire" || synthesis.recommendation === "hire"
      ? "success"
      : synthesis.recommendation === "lean_hire"
      ? "neutral"
      : "warning";

  return (
    <div className="flex flex-col gap-6 pb-16 pt-4 max-w-6xl mx-auto w-full px-4">
      {/* Top Bar */}
      <div className="flex flex-col gap-2">
        <Link
          href="/simulation"
          className="inline-flex w-fit items-center gap-1 text-sm text-ink-tertiary hover:text-ink-primary"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Simulation Lab
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">
                Interview Performance Synthesis
              </h1>
              <Badge tone={recommendationTone} className="text-xs uppercase">
                {synthesis.recommendation.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm text-ink-tertiary mt-0.5">
              {interview.seniority} {interview.role} ({interview.track}) · {formatDate(detail.session.createdAt)}
            </p>
          </div>
          <Link href="/simulation/interview">
            <Button>
              <Play className="h-4 w-4" /> Start New Interview
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Score Card */}
      <Card className="border-border-subtle bg-gradient-to-br from-surface-1 to-surface-0 shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-center">
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-surface-2 border border-border-subtle text-center">
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-tertiary mb-1">
                Composite Score
              </span>
              <div className="text-5xl font-black text-ink-primary tracking-tight">
                {synthesis.compositeScore}
                <span className="text-xl font-normal text-ink-tertiary">/100</span>
              </div>
              <span className="text-xs text-ink-secondary mt-2">
                {questions.length} questions completed
              </span>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <h3 className="text-base font-semibold text-ink-primary">Interviewer Decision Summary</h3>
              <p className="text-sm leading-relaxed text-ink-secondary">{synthesis.executiveSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strengths & Growth Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" /> Key Demonstrated Strengths
            </h3>
            <ul className="text-xs text-ink-secondary space-y-2">
              {synthesis.strengths.map((str, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink-primary">Priority Areas for Growth</h3>
            <ul className="text-xs text-ink-secondary space-y-2">
              {synthesis.areasForGrowth.map((area, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Turn-by-Turn Question Evaluation */}
      <h2 className="text-base font-semibold text-ink-primary mt-2">Question-by-Question Deep Dive</h2>
      <div className="flex flex-col gap-4">
        {questions.map((q, idx) => {
          const answer = answers.find((a) => a.questionId === q.id);
          const evaluation = evaluations.find((e) => e.answerId === answer?.id);

          return (
            <Card key={q.id} className="shadow-sm border-border-subtle">
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">Q{idx + 1}</Badge>
                    <span className="text-sm font-semibold text-ink-primary">{q.questionText}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {evaluation?.starStructureDetected && (
                      <Badge tone="success" className="text-[10px]">STAR Detected</Badge>
                    )}
                    <Badge tone="neutral" className="text-[10px] uppercase">
                      {q.category}
                    </Badge>
                  </div>
                </div>

                {answer && (
                  <div className="flex flex-col gap-1.5 bg-surface-1 p-3 rounded-lg border border-border-subtle">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                      Candidate Spoken Answer
                    </span>
                    <p className="text-xs font-mono leading-relaxed text-ink-secondary whitespace-pre-wrap">
                      {answer.transcript}
                    </p>
                  </div>
                )}

                {evaluation && (
                  <div className="flex flex-col gap-3 mt-1">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                      <div className="p-2 rounded bg-surface-1 border border-border-subtle">
                        <span className="text-[10px] text-ink-tertiary uppercase">Relevance</span>
                        <div className="text-sm font-bold text-ink-primary">{evaluation.relevanceScore}/100</div>
                      </div>
                      <div className="p-2 rounded bg-surface-1 border border-border-subtle">
                        <span className="text-[10px] text-ink-tertiary uppercase">Specificity</span>
                        <div className="text-sm font-bold text-ink-primary">{evaluation.specificityScore}/100</div>
                      </div>
                      <div className="p-2 rounded bg-surface-1 border border-border-subtle">
                        <span className="text-[10px] text-ink-tertiary uppercase">Completeness</span>
                        <div className="text-sm font-bold text-ink-primary">{evaluation.completenessScore}/100</div>
                      </div>
                      <div className="p-2 rounded bg-surface-1 border border-border-subtle">
                        <span className="text-[10px] text-ink-tertiary uppercase">Communication</span>
                        <div className="text-sm font-bold text-ink-primary">{evaluation.communicationScore}/100</div>
                      </div>
                      <div className="p-2 rounded bg-surface-1 border border-border-subtle col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-ink-tertiary uppercase">Technical</span>
                        <div className="text-sm font-bold text-ink-primary">{evaluation.technicalScore}/100</div>
                      </div>
                    </div>

                    {evaluation.betterAnswerStructure && (
                      <div className="text-xs bg-accent-50/20 p-2.5 rounded border border-accent-200 dark:border-accent-900 text-ink-primary">
                        <strong className="text-accent-700 dark:text-accent-400">Better Structure: </strong>
                        {evaluation.betterAnswerStructure}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
