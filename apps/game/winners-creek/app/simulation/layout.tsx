import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TopNav } from "@/components/simulation/top-nav";

export default async function SimulationLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/simulation");

  return (
    <div className="flex min-h-screen flex-col bg-surface-0">
      <TopNav session={session} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
