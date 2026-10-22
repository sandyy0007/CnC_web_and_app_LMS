import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import { toApiError } from "@/lib/errors";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = LoginSchema.parse(await req.json());
    const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password", code: "INVALID_CREDENTIALS" }, { status: 401 });
    }
    await createSessionCookie({
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    });
    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role, email: user.email } });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
