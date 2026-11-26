// Upload part tokens. The Backend hands out presigned storage URLs for each part of an audio upload. The browser
// must never choose where this server sends bytes (that would let a signed-in administrator make the server call
// any address), so the URLs are sealed into tokens only this server can open, bound to the session and expiring.

import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash } from "node:crypto";
import { getConfig } from "./config";

export interface PartClaim {
  /** the presigned storage URL for this part */
  url: string;
  /** the exact number of bytes this part must carry (single uploads: the most it may carry) */
  size: number;
  /** "part" must match exactly, "single" may be smaller */
  exact: boolean;
}

function key(): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`${getConfig().secret}|upload-part`).digest());
}

export async function sealPart(sid: string, claim: PartClaim, expiresAt: Date): Promise<string> {
  const max = Date.now() + 90 * 60_000;
  const exp = Math.floor(Math.min(expiresAt.getTime() || max, max) / 1000);
  return new EncryptJWT({ sid, ...claim }).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime(exp).encrypt(key());
}

/** Returns the claim, or null when the token is forged, expired, for another session, or points somewhere odd. */
export async function openPart(token: string, sid: string): Promise<PartClaim | null> {
  try {
    const { payload } = await jwtDecrypt(token, key(), { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    if (payload.sid !== sid || typeof payload.url !== "string" || typeof payload.size !== "number" || typeof payload.exact !== "boolean") return null;
    const u = new URL(payload.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return { url: payload.url, size: payload.size, exact: payload.exact };
  } catch {
    return null;
  }
}
