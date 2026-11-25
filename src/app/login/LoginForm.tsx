"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const a = useId();
  const b = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const mins = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : undefined;
        setError(`Too many attempts. Try again${mins ? ` in about ${mins} minute${mins === 1 ? "" : "s"}` : " later"}.`);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not sign in.");
      }
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor={a}>
        <Input id={a} type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor={b}>
        <Input id={b} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <ErrorBox error={error} />}
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !email || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
