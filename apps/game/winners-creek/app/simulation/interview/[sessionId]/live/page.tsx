import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getInterviewDetail } from "@/lib/simulation/interview-service";
import { InterviewWorkspace } from "@/components/simulation/interview-workspace";

export default async function LiveInterviewPage(props: {
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

  return (
    <div className="min-h-screen bg-surface-0">
      <InterviewWorkspace data={detail} />
    </div>
  );
}
