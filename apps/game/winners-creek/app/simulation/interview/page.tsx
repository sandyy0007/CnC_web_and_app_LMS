import { ComingSoon } from "@/components/simulation/coming-soon";
import { Briefcase } from "@/components/ui/icons";

export default function InterviewSimulatorPage() {
  return (
    <ComingSoon
      icon={<Briefcase className="h-6 w-6" />}
      title="AI Interview Simulator"
      phase="Arriving in Phase 4"
      description="An adaptive AI interviewer that asks role-specific questions, challenges vague answers with real follow-ups, and evaluates your responses against relevance, specificity and technical depth — the same evaluation architecture behind the Presentation Simulator, applied to conversation."
      bullets={[
        "Role, interview type, difficulty and duration setup — already modeled in the database",
        "Resume-aware question generation, remembering your claimed projects and skills",
        "Adaptive follow-ups that dig into vague answers rather than moving on",
        "Question-by-question evaluation report with a better-answer structure for each response",
      ]}
    />
  );
}
