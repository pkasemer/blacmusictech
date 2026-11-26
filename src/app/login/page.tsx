import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getPageSession } from "@/server/page-session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getPageSession()) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-[22rem]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="" width={36} height={36} priority unoptimized />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Blac Music Admin</h1>
            <p className="mt-1 text-sm text-muted">Sign in with your administrator account.</p>
          </div>
        </div>
        <div className="rounded-card border border-line bg-panel p-5 shadow-ambient">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-faint">Administrator access only. Every action is recorded.</p>
      </div>
    </main>
  );
}
