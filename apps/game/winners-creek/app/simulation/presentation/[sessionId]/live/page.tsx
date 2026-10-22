import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPresentationDetail } from "@/lib/simulation/presentation-service";
import { AppError } from "@/lib/errors";
import { LiveWorkspace } from "@/components/simulation/live-workspace";

export default async function LivePresentationPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const { sessionId } = await params;
  const { attempt } = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/login?next=/simulation/presentation/${sessionId}/live`);
  if (!attempt) redirect(`/simulation/presentation/${sessionId}/prepare`);

  let detail: Awaited<ReturnType<typeof getPresentationDetail>>;
  try {
    detail = await getPresentationDetail(session, sessionId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }

  return <LiveWorkspace detail={detail} attemptId={attempt} />;
}
