import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

/**
 * Interim session layer.
 *
 * Winners Creek's real authentication system was not reachable from this
 * build environment (see README "Integration notes"), so this is a minimal,
 * self-contained stand-in: a signed JWT in an httpOnly cookie carrying
 * {userId, role}. Every place that needs "who is signed in" goes through
 * `getSession()` below — when this module is swapped for the real Winners
 * Creek auth, that's the only file downstream code needs to keep working
 * unchanged (same shape: {userId, role, name}).
 */

const COOKIE_NAME = "wc_session";
const secret = new TextEncoder().encode(config.SESSION_SECRET);

export interface Session {
  userId: string;
  role: "student" | "trainer" | "admin";
  name: string;
  email: string;
}

export async function createSessionCookie(session: Session): Promise<void> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(
  req?: { cookies?: { get: (name: string) => { value: string } | undefined } } | Request,
): Promise<Session | null> {
  let token: string | undefined;

  if (req && "cookies" in req && typeof req.cookies?.get === "function") {
    token = req.cookies.get(COOKIE_NAME)?.value;
  }

  if (!token && req && "headers" in req && typeof req.headers?.get === "function") {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
      if (match) token = match[1];
    }
  }

  if (!token) {
    try {
      const store = await cookies();
      token = store.get(COOKIE_NAME)?.value;
    } catch {
      // In standalone tests or outside request context
    }
  }

  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function requireSession(
  req?: { cookies?: { get: (name: string) => { value: string } | undefined } } | Request,
): Promise<Session> {
  const session = await getSession(req);
  if (!session) {
    const { Errors } = await import("@/lib/errors");
    throw Errors.unauthorized();
  }
  return session;
}
