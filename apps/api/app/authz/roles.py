"""The 8-role architecture and what each role may do."""
from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    STUDENT = "STUDENT"
    TRAINER = "TRAINER"
    HOD = "HOD"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"
    PLACEMENT_CELL = "PLACEMENT_CELL"
    RECRUITER = "RECRUITER"
    PARENT = "PARENT"


#: Roles fully implemented in Phase 1.
PHASE_1_ROLES = frozenset({Role.STUDENT, Role.TRAINER, Role.HOD, Role.ADMIN})

#: Roles with protected routes + scope rules but no large feature surface yet.
RESERVED_ROLES = frozenset({Role.SUPER_ADMIN, Role.PLACEMENT_CELL, Role.RECRUITER, Role.PARENT})

#: Roles bound to exactly one college.
COLLEGE_BOUND = frozenset(
    {Role.STUDENT, Role.TRAINER, Role.HOD, Role.ADMIN, Role.PLACEMENT_CELL}
)

#: Roles bound to exactly one department.
DEPARTMENT_BOUND = frozenset({Role.HOD, Role.STUDENT})

#: Roles that may read across every college.
PLATFORM_WIDE = frozenset({Role.SUPER_ADMIN})

ROLE_HOME: dict[Role, str] = {
    Role.STUDENT: "/student/dashboard",
    Role.TRAINER: "/trainer/dashboard",
    Role.HOD: "/hod/dashboard",
    Role.ADMIN: "/admin/dashboard",
    Role.SUPER_ADMIN: "/super-admin",
    Role.PLACEMENT_CELL: "/placement",
    Role.RECRUITER: "/recruiter",
    Role.PARENT: "/parent",
}

ROLE_LABEL: dict[Role, str] = {
    Role.STUDENT: "Participant",
    Role.TRAINER: "Trainer",
    Role.HOD: "SPOC",
    Role.ADMIN: "Institution Admin",
    Role.SUPER_ADMIN: "Super Admin",
    Role.PLACEMENT_CELL: "Placement Cell",
    Role.RECRUITER: "Recruiter",
    Role.PARENT: "Parent",
}


def parse_role(value: str | Role) -> Role:
    if isinstance(value, Role):
        return value
    try:
        return Role(str(value).strip().upper())
    except ValueError as exc:
        from app.core.errors import ValidationError

        raise ValidationError(f"'{value}' is not a recognised role") from exc
