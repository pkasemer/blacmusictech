import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getConfig } from "@/server/config";
import { getPageSession } from "@/server/page-session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getPageSession();
  if (!s) redirect("/login");
  const cfg = getConfig();
  const environment = cfg.production ? new URL(cfg.siteOrigin).hostname : "Local workspace";
  // Only the user and the CSRF token go to the browser; the Backend tokens stay in the cookie.
  return (
    <Shell user={s.user} csrf={s.csrf} environment={environment}>
      {children}
    </Shell>
  );
}
