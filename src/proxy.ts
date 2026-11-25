// Runs before every request: per-request CSP nonce, and a cheap redirect for visitors with no session
// cookie. The real check (decrypt, expiry, role) happens in the layouts and the API routes.

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/server/config";

export function proxy(req: NextRequest) {
  const cfg = getConfig();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = !cfg.production;
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${cfg.imageOrigins.join(" ")}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(cfg.production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const { pathname } = req.nextUrl;
  const open = pathname === "/login" || pathname.startsWith("/api/");
  if (!open && !req.cookies.get(cfg.cookieName)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
