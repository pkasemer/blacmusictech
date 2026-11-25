import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageSession } from "@/server/page-session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getPageSession()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          Blac Music <span className="text-brand">Admin</span>
        </h1>
        <p className="mb-5 mt-1 text-sm text-muted">Sign in with your administrator account.</p>
        <LoginForm />
      </div>
    </main>
  );
}
