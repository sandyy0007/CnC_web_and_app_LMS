import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAttemptDetailById, getPresentationDetail } from "@/lib/simulation/presentation-service";
import { AppError } from "@/lib/errors";
import { ResultsView } from "@/components/simulation/results-view";

export default async function ResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/simulation/results/${attemptId}`);

  let attemptDetail: Awaited<ReturnType<typeof getAttemptDetailById>>;
  let presentationDetail: Awaited<ReturnType<typeof getPresentationDetail>>;
  try {
    attemptDetail = await getAttemptDetailById(session, attemptId);
    presentationDetail = await getPresentationDetail(session, attemptDetail.session.id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }

  return <ResultsView attemptDetail={attemptDetail} presentationDetail={presentationDetail} />;
}
