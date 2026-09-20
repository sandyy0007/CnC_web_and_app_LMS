"""Payment Service with Provider Abstraction.

Implements a provider-independent payment layer (§7).
In development/local mode, a mock provider fulfills payments idempotently without requiring
external gateway credentials. Sensitive payment credentials (cards, CVVs) are NEVER stored.
"""
from __future__ import annotations

import uuid
import secrets
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any
from bson import ObjectId

from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationError
from app.db.mongo import get_db, serialize


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PaymentProvider(ABC):
    @abstractmethod
    async def create_charge(self, amount: float, currency: str, description: str, metadata: dict) -> dict[str, Any]: ...

    @abstractmethod
    async def refund_charge(self, transaction_id: str, amount: float) -> dict[str, Any]: ...


class MockPaymentProvider(PaymentProvider):
    async def create_charge(self, amount: float, currency: str, description: str, metadata: dict) -> dict[str, Any]:
        txn_id = f"TXN_{secrets.token_hex(8).upper()}"
        return {
            "transactionId": txn_id,
            "status": "completed",
            "provider": "mock_gateway",
            "fee": round(amount * 0.02, 2),
            "paidAt": _now().isoformat(),
        }

    async def refund_charge(self, transaction_id: str, amount: float) -> dict[str, Any]:
        return {
            "refundId": f"REF_{secrets.token_hex(6).upper()}",
            "transactionId": transaction_id,
            "status": "refunded",
            "amount": amount,
            "refundedAt": _now().isoformat(),
        }


def get_payment_provider() -> PaymentProvider:
    return MockPaymentProvider()


async def create_course_payment(
    *,
    student_user_id: ObjectId,
    college_id: ObjectId | None,
    course_id: ObjectId,
    course_mode: str = "ONLINE",
    payment_method: str = "Card / NetBanking",
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    db = get_db()
    if idempotency_key:
        existing = await db.payments.find_one({"idempotencyKey": idempotency_key})
        if existing:
            return serialize(existing)

    user = await db.users.find_one({"_id": student_user_id})
    if not user:
        raise NotFound("User account not found.")

    course = await db.courses.find_one({"_id": course_id})
    if not course:
        raise NotFound("Course not found.")

    # Validate mode against availableModes
    available_modes = course.get("availableModes") or [course.get("courseMode", "ONLINE")]
    if course_mode not in available_modes:
        course_mode = available_modes[0]

    # Offline courses require college binding
    resolved_college_id = college_id or user.get("collegeId")
    if course_mode == "OFFLINE" and not resolved_college_id:
        raise ValidationError("An institution/college is required for offline course enrollment.")

    # Online courses bypass institution binding
    effective_college_id = resolved_college_id if course_mode == "OFFLINE" else None

    # Determine course price
    amount = float(course.get("price", 4999.0))
    currency = course.get("currency", "INR")

    provider = get_payment_provider()
    charge = await provider.create_charge(
        amount=amount,
        currency=currency,
        description=f"Enrollment for {course.get('title')} ({course_mode})",
        metadata={"studentId": str(student_user_id), "courseId": str(course_id), "mode": course_mode},
    )

    invoice_number = f"INV-{_now().strftime('%Y%m')}-{secrets.token_hex(3).upper()}"
    now = _now()
    payment_doc = {
        "collegeId": effective_college_id,
        "departmentId": user.get("departmentId") if course_mode == "OFFLINE" else None,
        "studentUserId": student_user_id,
        "studentName": user.get("name"),
        "studentEmail": user.get("email"),
        "courseId": course_id,
        "courseTitle": course.get("title"),
        "courseMode": course_mode,
        "amount": amount,
        "currency": currency,
        # Starts in pending_verification until Super Admin approves
        "status": "pending_verification",
        "paymentMethod": payment_method,
        "transactionId": charge["transactionId"],
        "provider": charge["provider"],
        "idempotencyKey": idempotency_key or str(uuid.uuid4()),
        "invoiceNumber": invoice_number,
        "verifiedBy": None,
        "verifiedAt": None,
        "verificationNote": None,
        "createdAt": now,
        "updatedAt": now,
    }
    res = await db.payments.insert_one(payment_doc)
    payment_doc["_id"] = res.inserted_id

    # Create associated invoice
    invoice_doc = {
        "paymentId": payment_doc["_id"],
        "collegeId": effective_college_id,
        "invoiceNumber": invoice_number,
        "studentName": user.get("name"),
        "studentEmail": user.get("email"),
        "courseTitle": course.get("title"),
        "courseMode": course_mode,
        "subtotal": round(amount * 0.82, 2),
        "tax": round(amount * 0.18, 2),
        "total": amount,
        "currency": currency,
        "status": "pending_verification",
        "issuedAt": now,
    }
    await db.invoices.insert_one(invoice_doc)

    # Create enrollment in pending_verification status (access unlocked only on Super Admin verification)
    existing_enrollment = await db.enrollments.find_one({"studentUserId": student_user_id, "courseId": course_id})
    if existing_enrollment:
        await db.enrollments.update_one(
            {"_id": existing_enrollment["_id"]},
            {
                "$set": {
                    "courseMode": course_mode,
                    "collegeId": effective_college_id,
                    "status": "pending_verification",
                    "updatedAt": now,
                }
            },
        )
    else:
        await db.enrollments.insert_one({
            "collegeId": effective_college_id,
            "departmentId": user.get("departmentId") if course_mode == "OFFLINE" else None,
            "studentUserId": student_user_id,
            "studentName": user.get("name"),
            "rollNumber": user.get("rollNumber", "N/A"),
            "courseId": course_id,
            "courseTitle": course.get("title"),
            "courseMode": course_mode,
            "enrollmentType": "paid",
            "enrolledAt": now,
            "status": "pending_verification",
            "createdAt": now,
            "updatedAt": now,
            "deletedAt": None,
        })

    return serialize(payment_doc)


async def verify_course_payment(payment_id: ObjectId, verified_by: ObjectId, note: str = "") -> dict[str, Any]:
    """Super Admin approves transaction: transitions payment to verified.
    Requirement 15: For institution-based training, payment verification does NOT automatically
    grant active access until authorized Admin activates it.
    For ONLINE courses, Super Admin verification directly activates access.
    """
    from app.models.domain_models import AccessStatus, DeliveryMode, EnrollmentStatus, PaymentStatus

    db = get_db()
    payment = await db.payments.find_one({"_id": payment_id})
    if not payment:
        raise NotFound("Payment transaction not found.")

    if payment.get("status") == PaymentStatus.VERIFIED or payment.get("status") == "verified":
        raise Conflict("Payment is already verified.")

    now = _now()
    await db.payments.update_one(
        {"_id": payment_id},
        {
            "$set": {
                "status": PaymentStatus.VERIFIED,
                "verifiedBy": verified_by,
                "verifiedAt": now,
                "verificationNote": note,
                "updatedAt": now,
            }
        },
    )

    course_mode = payment.get("courseMode", DeliveryMode.ONLINE)
    is_online = course_mode == DeliveryMode.ONLINE and not payment.get("collegeId")

    # For online training, Super Admin directly activates. For college/institution, access requires Admin activation.
    initial_access_status = AccessStatus.ACTIVE if is_online else AccessStatus.INACTIVE
    initial_enrollment_status = EnrollmentStatus.ACTIVE

    enrollment = await db.enrollments.find_one({
        "studentUserId": payment["studentUserId"],
        "courseId": payment["courseId"],
    })

    current_period = (enrollment or {}).get("currentPeriod") or {}
    start_date = current_period.get("startDate") or now
    # Default 6-month semester window if not preset
    from datetime import timedelta
    end_date = current_period.get("endDate") or (now + timedelta(days=180))

    updated_period = {
        "semesterNumber": current_period.get("semesterNumber", 1),
        "semesterLabel": current_period.get("semesterLabel", "Semester 1"),
        "startDate": start_date,
        "endDate": end_date,
        "accessStatus": initial_access_status,
        "paymentStatus": PaymentStatus.VERIFIED,
        "enrollmentStatus": initial_enrollment_status,
        "activatedBy": str(verified_by) if is_online else None,
        "activatedAt": now if is_online else None,
    }

    await db.enrollments.update_one(
        {"studentUserId": payment["studentUserId"], "courseId": payment["courseId"]},
        {
            "$set": {
                "status": initial_enrollment_status,
                "enrollmentStatus": initial_enrollment_status,
                "paymentStatus": PaymentStatus.VERIFIED,
                "accessStatus": initial_access_status,
                "currentPeriod": updated_period,
                "updatedAt": now,
            }
        },
        upsert=True,
    )

    # Mark invoice paid
    await db.invoices.update_many(
        {"paymentId": payment_id},
        {"$set": {"status": "paid", "paidAt": now}},
    )

    # Convert any active trial for this course
    await db.course_trials.update_many(
        {"studentUserId": payment["studentUserId"], "courseId": payment["courseId"], "status": "active"},
        {"$set": {"status": "converted", "convertedAt": now, "updatedAt": now}},
    )

    await db.payment_events.insert_one({
        "paymentId": payment_id,
        "eventType": "verification_approved",
        "actorId": verified_by,
        "isOnline": is_online,
        "accessStatus": initial_access_status,
        "note": note,
        "createdAt": now,
    })

    return {
        "success": True,
        "status": PaymentStatus.VERIFIED,
        "accessStatus": initial_access_status,
        "paymentId": str(payment_id),
    }


async def activate_participant_enrollment(
    *,
    enrollment_id: ObjectId,
    admin_user_id: ObjectId,
    access_end_date: datetime | None = None,
    notes: str = "",
) -> dict[str, Any]:
    """Requirement 16: Admin activation of participant access.
    Records who activated, when, which enrollment, which access period.
    """
    from app.models.domain_models import AccessStatus, EnrollmentStatus
    from datetime import timedelta

    db = get_db()
    enrollment = await db.enrollments.find_one({"_id": enrollment_id})
    if not enrollment:
        raise NotFound("Enrollment not found.")

    now = _now()
    current_period = enrollment.get("currentPeriod") or {}
    start_date = current_period.get("startDate") or now
    end_date = access_end_date or current_period.get("endDate") or (now + timedelta(days=180))

    updated_period = {
        **current_period,
        "startDate": start_date,
        "endDate": end_date,
        "accessStatus": AccessStatus.ACTIVE,
        "activatedBy": str(admin_user_id),
        "activatedAt": now,
        "activationNotes": notes,
    }

    await db.enrollments.update_one(
        {"_id": enrollment_id},
        {
            "$set": {
                "accessStatus": AccessStatus.ACTIVE,
                "status": EnrollmentStatus.ACTIVE,
                "currentPeriod": updated_period,
                "updatedAt": now,
            }
        },
    )

    audit_entry = {
        "enrollmentId": enrollment_id,
        "action": "admin_activated",
        "actorId": admin_user_id,
        "startDate": start_date,
        "endDate": end_date,
        "notes": notes,
        "createdAt": now,
    }
    await db.access_audit_logs.insert_one(audit_entry)

    return {
        "success": True,
        "accessStatus": AccessStatus.ACTIVE,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "activatedBy": str(admin_user_id),
        "activatedAt": now.isoformat(),
    }


async def deactivate_participant_enrollment(
    *,
    enrollment_id: ObjectId,
    admin_user_id: ObjectId,
    reason: str = "Administrative deactivation",
) -> dict[str, Any]:
    """Requirement 16: Admin deactivation of participant access.
    Records who deactivated, when, and reason.
    """
    from app.models.domain_models import AccessStatus

    db = get_db()
    enrollment = await db.enrollments.find_one({"_id": enrollment_id})
    if not enrollment:
        raise NotFound("Enrollment not found.")

    now = _now()
    current_period = enrollment.get("currentPeriod") or {}
    updated_period = {
        **current_period,
        "accessStatus": AccessStatus.INACTIVE,
        "deactivatedBy": str(admin_user_id),
        "deactivatedAt": now,
        "deactivationReason": reason,
    }

    await db.enrollments.update_one(
        {"_id": enrollment_id},
        {
            "$set": {
                "accessStatus": AccessStatus.INACTIVE,
                "currentPeriod": updated_period,
                "updatedAt": now,
            }
        },
    )

    audit_entry = {
        "enrollmentId": enrollment_id,
        "action": "admin_deactivated",
        "actorId": admin_user_id,
        "reason": reason,
        "createdAt": now,
    }
    await db.access_audit_logs.insert_one(audit_entry)

    return {
        "success": True,
        "accessStatus": AccessStatus.INACTIVE,
        "deactivatedBy": str(admin_user_id),
        "deactivatedAt": now.isoformat(),
        "reason": reason,
    }


async def renew_participant_semester(
    *,
    enrollment_id: ObjectId,
    new_semester_number: int,
    new_start_date: datetime,
    new_end_date: datetime,
    admin_user_id: ObjectId,
    notes: str = "",
) -> dict[str, Any]:
    """Requirements 14, 18, 45: Non-destructive semester renewal.
    Archives previous access period into historicalPeriods array.
    Does NOT overwrite past payments, attendance, evaluations, or reports.
    """
    from app.models.domain_models import AccessStatus, EnrollmentStatus, PaymentStatus

    db = get_db()
    enrollment = await db.enrollments.find_one({"_id": enrollment_id})
    if not enrollment:
        raise NotFound("Enrollment not found.")

    now = _now()
    old_period = enrollment.get("currentPeriod")

    new_period = {
        "semesterNumber": new_semester_number,
        "semesterLabel": f"Semester {new_semester_number}",
        "startDate": new_start_date,
        "endDate": new_end_date,
        "accessStatus": AccessStatus.ACTIVE,
        "paymentStatus": PaymentStatus.VERIFIED,
        "enrollmentStatus": EnrollmentStatus.ACTIVE,
        "activatedBy": str(admin_user_id),
        "activatedAt": now,
        "notes": notes,
        "renewedAt": now,
    }

    update_ops: dict[str, Any] = {
        "$set": {
            "currentPeriod": new_period,
            "accessStatus": AccessStatus.ACTIVE,
            "status": EnrollmentStatus.ACTIVE,
            "updatedAt": now,
        }
    }

    if old_period:
        update_ops["$push"] = {"historicalPeriods": old_period}

    await db.enrollments.update_one({"_id": enrollment_id}, update_ops)

    audit_entry = {
        "enrollmentId": enrollment_id,
        "action": "semester_renewed",
        "actorId": admin_user_id,
        "previousSemester": old_period.get("semesterNumber") if old_period else None,
        "newSemester": new_semester_number,
        "startDate": new_start_date,
        "endDate": new_end_date,
        "createdAt": now,
    }
    await db.access_audit_logs.insert_one(audit_entry)

    return {
        "success": True,
        "message": f"Successfully renewed for Semester {new_semester_number}",
        "currentPeriod": new_period,
    }


async def reject_course_payment(payment_id: ObjectId, rejected_by: ObjectId, reason: str = "") -> dict[str, Any]:
    """Super Admin rejects transaction: transitions payment to rejected and cancels enrollment."""
    db = get_db()
    payment = await db.payments.find_one({"_id": payment_id})
    if not payment:
        raise NotFound("Payment transaction not found.")

    now = _now()
    await db.payments.update_one(
        {"_id": payment_id},
        {
            "$set": {
                "status": "rejected",
                "rejectedBy": rejected_by,
                "rejectedAt": now,
                "rejectionReason": reason,
                "updatedAt": now,
            }
        },
    )

    # Mark enrollment rejected
    await db.enrollments.update_one(
        {"studentUserId": payment["studentUserId"], "courseId": payment["courseId"]},
        {"$set": {"status": "rejected", "updatedAt": now}},
    )

    await db.invoices.update_many(
        {"paymentId": payment_id},
        {"$set": {"status": "rejected"}},
    )

    await db.payment_events.insert_one({
        "paymentId": payment_id,
        "eventType": "verification_rejected",
        "actorId": rejected_by,
        "reason": reason,
        "createdAt": now,
    })

    return {"success": True, "status": "rejected", "paymentId": str(payment_id)}


async def refund_course_payment(payment_id: ObjectId, reason: str = "Admin approved refund") -> dict[str, Any]:
    db = get_db()
    payment = await db.payments.find_one({"_id": payment_id})
    if not payment:
        raise NotFound("Payment not found.")

    if payment.get("status") == "refunded":
        raise Conflict("Payment has already been refunded.")

    provider = get_payment_provider()
    charge = await provider.refund_charge(payment["transactionId"], payment["amount"])

    now = _now()
    await db.payments.update_one(
        {"_id": payment_id},
        {"$set": {"status": "refunded", "refundReason": reason, "refundedAt": now, "updatedAt": now}},
    )
    await db.payment_events.insert_one({
        "paymentId": payment_id,
        "eventType": "refund",
        "reason": reason,
        "refundDetails": charge,
        "createdAt": now,
    })

    return {"success": True, "status": "refunded", "paymentId": str(payment_id)}

