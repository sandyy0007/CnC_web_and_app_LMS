import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPresentationDetail } from "@/lib/simulation/presentation-service";
import { AppError } from "@/lib/errors";
import { PrepareWorkspace } from "@/components/simulation/prepare-workspace";

export default async function PreparePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/simulation/presentation/${sessionId}/prepare`);

  let detail: Awaited<ReturnType<typeof getPresentationDetail>>;
  try {
    detail = await getPresentationDetail(session, sessionId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }

  return <PrepareWorkspace detail={detail} />;
}
