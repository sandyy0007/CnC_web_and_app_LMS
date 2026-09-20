"""The authorization context.

Scope is ALWAYS derived here from the authenticated server-side identity. No part of the
application reads collegeId / departmentId / batchId from the client (SRS §14.2, master prompt §8).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.authz.roles import Role
from app.core.errors import ScopeForbidden


@dataclass(frozen=True)
class ScopeContext:
    user_id: ObjectId
    role: Role
    college_id: ObjectId | None
    department_id: ObjectId | None
    session_id: str
    request_id: str = "unknown"
    ip: str | None = None
    email: str | None = None
    name: str | None = None
    #: Batches the trainer is actually assigned to (resolved from trainer_assignments).
    batch_ids: tuple[ObjectId, ...] = field(default_factory=tuple)
    department_ids: tuple[ObjectId, ...] = field(default_factory=tuple)
    #: Student ids a PARENT is linked to.
    linked_student_ids: tuple[ObjectId, ...] = field(default_factory=tuple)

    # ------------------------------------------------------------- predicates
    @property
    def is_platform_wide(self) -> bool:
        return self.role is Role.SUPER_ADMIN

    @property
    def actor_label(self) -> str:
        from app.authz.roles import ROLE_LABEL

        return f"{self.name or self.email or self.user_id} ({ROLE_LABEL.get(self.role, self.role)})"

    # ------------------------------------------------------------- filters
    def base_filter(self) -> dict[str, Any]:
        """The mandatory scope filter every scoped query must carry."""
        if self.is_platform_wide:
            return {}
        f: dict[str, Any] = {}
        if self.college_id is not None:
            f["collegeId"] = self.college_id
        if self.role is Role.HOD and self.department_id is not None:
            f["departmentId"] = self.department_id
        elif self.role is Role.STUDENT and self.department_id is not None:
            f["departmentId"] = self.department_id
        elif self.role is Role.TRAINER:
            if self.batch_ids:
                f["batchId"] = {"$in": list(self.batch_ids)}
            elif self.department_ids:
                f["departmentId"] = {"$in": list(self.department_ids)}
            else:
                # An unassigned trainer sees nothing rather than everything.
                f["batchId"] = {"$in": []}
        return f

    def own_records_filter(self) -> dict[str, Any]:
        """Student/parent self-scope: own rows only."""
        if self.role is Role.STUDENT:
            return {**self.base_filter(), "studentUserId": self.user_id}
        if self.role is Role.PARENT:
            return {"studentUserId": {"$in": list(self.linked_student_ids)}}
        return self.base_filter()

    def narrow(self, **requested: Any) -> dict[str, Any]:
        """Apply caller-supplied filters *within* scope.

        A filter may only narrow. Any value outside the derived scope is a scope violation —
        it is never silently intersected away (master prompt §23, SRS FR-13).
        """
        base = self.base_filter()
        out = dict(base)
        for key, value in requested.items():
            if value is None:
                continue
            if key == "collegeId" and not self.is_platform_wide:
                if self.college_id is None or ObjectId(str(value)) != self.college_id:
                    raise ScopeForbidden()
                continue
            if key == "departmentId":
                allowed = base.get("departmentId")
                oid = ObjectId(str(value))
                if isinstance(allowed, ObjectId) and oid != allowed:
                    raise ScopeForbidden()
                if isinstance(allowed, dict) and oid not in allowed.get("$in", []):
                    raise ScopeForbidden()
                out["departmentId"] = oid
                continue
            if key == "batchId":
                allowed = base.get("batchId")
                oid = ObjectId(str(value))
                if isinstance(allowed, dict) and oid not in allowed.get("$in", []):
                    raise ScopeForbidden()
                out["batchId"] = oid
                continue
            out[key] = value
        return out

    def stamp(self) -> dict[str, Any]:
        """Scope + audit fields written onto every document this context creates."""
        now = datetime.now(timezone.utc)
        doc: dict[str, Any] = {"createdAt": now, "updatedAt": now, "createdBy": self.user_id}
        if self.college_id is not None:
            doc["collegeId"] = self.college_id
        if self.department_id is not None:
            doc["departmentId"] = self.department_id
        return doc

    def touch(self) -> dict[str, Any]:
        return {"updatedAt": datetime.now(timezone.utc), "updatedBy": self.user_id}
