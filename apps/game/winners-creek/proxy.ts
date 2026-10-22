import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge-safe route guard (Next.js 16 "proxy" convention — the successor to
 * middleware.ts). Full RBAC (ownership checks etc.) happens in the route
 * handlers via lib/auth/rbac.ts — this layer only keeps signed-out visitors
 * and students out of /trainer/* and out of protected pages, cheaply,
 * before any page code runs.
 */

const PROTECTED_PREFIXES = ["/simulation", "/trainer"];
const TRAINER_PREFIXES = ["/trainer"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get("wc_session")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me");
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as string;

    const needsTrainer = TRAINER_PREFIXES.some((p) => pathname.startsWith(p));
    if (needsTrainer && role === "student") {
      const url = req.nextUrl.clone();
      url.pathname = "/simulation";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/simulation/:path*", "/trainer/:path*"],
};
