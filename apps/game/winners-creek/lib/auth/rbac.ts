import { Errors } from "@/lib/errors";
import type { Session } from "./session";

export type Role = Session["role"];

const RANK: Record<Role, number> = { student: 0, trainer: 1, admin: 2 };

export function hasRole(session: Session, minimum: Role): boolean {
  return RANK[session.role] >= RANK[minimum];
}

export function requireRole(session: Session, minimum: Role): void {
  if (!hasRole(session, minimum)) {
    throw Errors.forbidden(`This action requires the "${minimum}" role or higher.`);
  }
}

/** Ownership check: students may only touch their own records; trainers/admins may touch anyone's. */
export function requireOwnerOrTrainer(session: Session, ownerUserId: string): void {
  if (session.userId === ownerUserId) return;
  if (hasRole(session, "trainer")) return;
  throw Errors.forbidden("You can only access your own sessions.");
}
