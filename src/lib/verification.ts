// What an administrator can do about an artist's verified badge, and how the Backend's refusals read.
import type { Verification } from "./types";

export type Decision = "approve" | "verify" | "reject" | "revoke";

/** The decision that gives the badge: a waiting request is approved; otherwise the admin verifies directly. */
export function grantDecision(state: Verification): "approve" | "verify" | null {
  if (state === "verified") return null;
  return state === "pending" ? "approve" : "verify";
}

export function verificationError(decision: Decision, code: string, fallback: string): string {
  if (code === "artist_banned") return "This artist is banned. Unban them before verifying.";
  if (code === "already_verified") return "This artist is already verified. Reload the page.";
  if (code === "not_verified") return "This artist is not verified any more. Reload the page.";
  if (code === "not_pending") return "That request is no longer waiting. Reload the page.";
  // an older server does not know the direct "verify" decision yet
  if (decision === "verify" && code === "bad_request") return "The server cannot verify an artist without a request yet. It needs the latest Backend update.";
  return fallback;
}
