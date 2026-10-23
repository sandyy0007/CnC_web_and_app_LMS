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


def _clean_doc(val: Any) -> Any:
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, dict):
        return {k: _clean_doc(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_clean_doc(v) for v in val]
    return val


async def create_course_payment(
    *,
    student_user_id: Any,
    college_id: Any = None,
    course_id: Any,
    course_mode: str = "ONLINE",
    payment_method: str = "UPI",
    idempotency_key: str | None = None,
    transaction_ref: str | None = None,
    payer_upi_id: str | None = None,
    receipt_url: str | None = None,
) -> dict[str, Any]:
    c_uuid = None
    u_uuid = None
    try:
        c_uuid = uuid.UUID(str(course_id))
    except (ValueError, TypeError):
        c_uuid = None
    try:
        u_uuid = uuid.UUID(str(student_user_id))
    except (ValueError, TypeError):
        u_uuid = None

    if settings.USE_POSTGRES and u_uuid:
        from app.repositories.course_repo import CourseRepository
        from app.repositories.enrollment_repo import EnrollmentRepository
        from app.repositories.payment_repo import PaymentRepository
        from app.db.postgres import get_pg_connection

        async with get_pg_connection() as conn:
            if not c_uuid:
                slug_row = await conn.fetchrow(
                    "SELECT id FROM courses WHERE LOWER(slug) = LOWER($1) AND deleted_at IS NULL",
                    str(course_id).strip(),
                )
                if slug_row:
                    c_uuid = slug_row["id"]

            if not c_uuid:
                raise NotFound("Course not found.")

            course = await CourseRepository.get_by_id(c_uuid)
            if not course:
                raise NotFound("Course not found.")

            fee = float(course.get("fee") or 0.0)
            currency = course.get("currency") or "INR"

            if fee < 0:
                raise ValidationError("Course fee cannot be negative.")

            # Check if this user already has a verified payment for this exact course
            verified_pay = await conn.fetchrow(
                "SELECT id FROM payments WHERE participant_user_id = $1 AND course_id = $2 AND status = 'VERIFIED'",
                u_uuid, c_uuid
            )
            if verified_pay:
                raise Conflict("You have already purchased and verified access to this course.")

            if transaction_ref:
                existing_ref = await conn.fetchval("SELECT id FROM payments WHERE transaction_ref = $1", transaction_ref.strip())
                if existing_ref:
                    raise Conflict("This transaction reference / UTR has already been submitted.")

            user = await conn.fetchrow("SELECT id, name, email, institution_id, department_id FROM users WHERE id = $1", u_uuid)
            if not user:
                raise NotFound("User account not found.")

            enr = await conn.fetchrow(
                "SELECT id, payment_status, access_status FROM enrollments WHERE participant_user_id = $1 AND course_id = $2",
                u_uuid, c_uuid
            )
            enr_id = None
            if enr:
                if enr["payment_status"] == "VERIFIED" and enr["access_status"] == "ACTIVE":
                    raise Conflict("You are already enrolled with verified access.")
                enr_id = enr["id"]
            else:
                profile = await conn.fetchrow(
                    "SELECT institution_id, department_id, batch_id, current_semester FROM student_profiles WHERE user_id = $1",
                    u_uuid,
                )
                inst_id = user["institution_id"] or (profile["institution_id"] if profile else None)
                dept_id = user["department_id"] or (profile["department_id"] if profile else None)
                batch_id = profile["batch_id"] if profile else None
                sem = profile["current_semester"] if profile and profile["current_semester"] else 1

                new_enr = await conn.fetchrow(
                    """
                    INSERT INTO enrollments (
                        participant_user_id, course_id, institution_id, department_id, batch_id,
                        current_semester, enrollment_status, payment_status, access_status
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'PENDING', 'INACTIVE')
                    RETURNING id;
                    """,
                    u_uuid, c_uuid, inst_id, dept_id, batch_id, sem
                )
                enr_id = new_enr["id"]

            txn_ref = transaction_ref or f"UTR-{secrets.token_hex(6).upper()}"
            metadata = {
                "courseTitle": course.get("title"),
                "courseSlug": course.get("slug"),
                "merchantName": course.get("merchant_name") or "Winners Creek LMS",
                "upiId": course.get("upi_id") or "pay@winnerscreek",
                "courseMode": course_mode,
                "idempotencyKey": idempotency_key,
            }

            pay_row = await PaymentRepository.create_payment(
                enrollment_id=enr_id,
                participant_id=u_uuid,
                course_id=c_uuid,
                amount=fee,
                transaction_ref=txn_ref,
                semester=1,
                currency=currency,
                method=payment_method,
                status="PENDING",
                receipt_url=receipt_url,
                payer_upi_id=payer_upi_id,
                metadata=metadata,
            )

            inv_num = f"INV-{txn_ref}"
            return {
                "id": str(pay_row["id"]),
                "_id": str(pay_row["id"]),
                "paymentId": str(pay_row["id"]),
                "enrollmentId": str(enr_id),
                "courseId": str(c_uuid),
                "courseTitle": course.get("title"),
                "courseMode": course_mode,
                "amount": fee,
                "currency": currency,
                "status": "pending_verification",
                "paymentMethod": payment_method,
                "transactionId": txn_ref,
                "transactionRef": txn_ref,
                "invoiceNumber": inv_num,
                "upiId": course.get("upi_id") or "pay@winnerscreek",
                "merchantName": course.get("merchant_name") or "Winners Creek LMS",
                "qrCodeUrl": course.get("qr_code_url"),
                "paymentInstructions": course.get("payment_instructions"),
                "receiptUrl": receipt_url,
                "payerUpiId": payer_upi_id,
                "createdAt": pay_row["created_at"].isoformat() if pay_row.get("created_at") else _now().isoformat(),
            }

    db = get_db()
    if idempotency_key:
        existing = await db.payments.find_one({"idempotencyKey": idempotency_key})
        if existing:
            return serialize(existing)

    user = None
    try:
        user = await db.users.find_one({"$or": [{"_id": student_user_id}, {"_id": str(student_user_id)}]})
    except Exception:
        pass
    if not user:
        try:
            from app.repositories.user_repo import UserRepository
            pg_user = await UserRepository.get_by_id(student_user_id)
            if pg_user:
                user = {
                    "_id": pg_user["id"],
                    "id": str(pg_user["id"]),
                    "name": pg_user["name"],
                    "email": pg_user["email"],
                    "collegeId": pg_user.get("institution_id"),
                    "departmentId": pg_user.get("department_id"),
                }
        except Exception:
            pass
    if not user:
        raise NotFound("User account not found.")

    course_oid = course_id
    try:
        from bson import ObjectId
        course_oid = ObjectId(str(course_id))
    except Exception:
        pass
    course = await db.courses.find_one({"$or": [{"_id": course_oid}, {"_id": str(course_id)}]})
    if not course:
        raise NotFound("Course not found.")
    course_id = course["_id"]

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
    res = await db.payments.insert_one(_clean_doc(payment_doc))
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
    await db.invoices.insert_one(_clean_doc(invoice_doc))

    # Create enrollment in pending_verification status (access unlocked only on Super Admin verification)
    existing_enrollment = await db.enrollments.find_one({"studentUserId": str(student_user_id), "courseId": course_id})
    if existing_enrollment:
        await db.enrollments.update_one(
            {"_id": existing_enrollment["_id"]},
            {
                "$set": _clean_doc({
                    "courseMode": course_mode,
                    "collegeId": effective_college_id,
                    "status": "pending_verification",
                    "updatedAt": now,
                })
            },
        )
    else:
        await db.enrollments.insert_one(_clean_doc({
            "collegeId": effective_college_id,
            "departmentId": user.get("departmentId") if course_mode == "OFFLINE" else None,
            "studentUserId": str(student_user_id),
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
        }))

    return serialize(payment_doc)


async def verify_course_payment(payment_id: Any, verified_by: Any, note: str = "") -> dict[str, Any]:
    """Super Admin approves transaction: transitions payment to verified."""
    try:
        pid_uuid = uuid.UUID(str(payment_id))
    except (ValueError, TypeError):
        pid_uuid = None

    if settings.USE_POSTGRES and pid_uuid:
        from app.repositories.payment_repo import PaymentRepository
        from app.db.postgres import get_pg_connection
        v_uid = None
        try:
            v_uid = uuid.UUID(str(verified_by)) if verified_by else None
        except Exception:
            v_uid = None

        res = await PaymentRepository.verify_payment(pid_uuid, v_uid or pid_uuid, note, activate_access=True)
        return {
            "success": True,
            "status": "VERIFIED",
            "accessStatus": "ACTIVE",
            "paymentId": str(res["id"]),
        }

    from app.models.domain_models import AccessStatus, DeliveryMode, EnrollmentStatus, PaymentStatus

    db = get_db()
    p_oid = ObjectId(str(payment_id)) if not isinstance(payment_id, ObjectId) else payment_id
    payment = await db.payments.find_one({"_id": p_oid})
    if not payment:
        raise NotFound("Payment transaction not found.")

    if payment.get("status") == PaymentStatus.VERIFIED or payment.get("status") == "verified":
        raise Conflict("Payment is already verified.")

    now = _now()
    await db.payments.update_one(
        {"_id": payment_id},
        {
            "$set": _clean_doc({
                "status": PaymentStatus.VERIFIED,
                "verifiedBy": verified_by,
                "verifiedAt": now,
                "verificationNote": note,
                "updatedAt": now,
            })
        },
    )

    course_mode = payment.get("courseMode", DeliveryMode.ONLINE)
    is_online = course_mode == DeliveryMode.ONLINE and not payment.get("collegeId")

    # For online training, Super Admin directly activates. For college/institution, access requires Admin activation.
    initial_access_status = AccessStatus.ACTIVE if is_online else AccessStatus.INACTIVE
    initial_enrollment_status = "active"

    stu_id = payment["studentUserId"]
    uid_match = {"$in": [stu_id, str(stu_id)]} if not isinstance(stu_id, list) else stu_id
    enrollment = await db.enrollments.find_one({
        "studentUserId": uid_match,
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

    await db.enrollments.update_many(
        {"studentUserId": uid_match, "courseId": payment["courseId"]},
        {
            "$set": _clean_doc({
                "status": initial_enrollment_status,
                "enrollmentStatus": initial_enrollment_status,
                "paymentStatus": PaymentStatus.VERIFIED,
                "accessStatus": initial_access_status,
                "currentPeriod": updated_period,
                "updatedAt": now,
            })
        },
    )

    # Mark invoice paid
    await db.invoices.update_many(
        {"paymentId": payment_id},
        {"$set": {"status": "paid", "paidAt": now}},
    )

    # Convert any trial for this course
    await db.course_trials.update_many(
        {"studentUserId": payment["studentUserId"], "courseId": payment["courseId"]},
        {"$set": {"status": "converted", "convertedAt": now, "updatedAt": now}},
    )

    await db.payment_events.insert_one(_clean_doc({
        "paymentId": payment_id,
        "eventType": "verification_approved",
        "actorId": verified_by,
        "isOnline": is_online,
        "accessStatus": initial_access_status,
        "note": note,
        "createdAt": now,
    }))

    return {
        "success": True,
        "status": "verified",
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


async def reject_course_payment(payment_id: Any, rejected_by: Any = None, reason: str = "") -> dict[str, Any]:
    """Super Admin rejects transaction: transitions payment to rejected."""
    try:
        pid_uuid = uuid.UUID(str(payment_id))
    except (ValueError, TypeError):
        pid_uuid = None

    if settings.USE_POSTGRES and pid_uuid:
        from app.repositories.payment_repo import PaymentRepository
        v_uid = None
        try:
            v_uid = uuid.UUID(str(rejected_by)) if rejected_by else None
        except Exception:
            v_uid = None

        res = await PaymentRepository.reject_payment(pid_uuid, v_uid or pid_uuid, reason)
        return {"success": True, "status": "REJECTED", "paymentId": str(res["id"])}

    db = get_db()
    p_oid = ObjectId(str(payment_id)) if not isinstance(payment_id, ObjectId) else payment_id
    payment = await db.payments.find_one({"_id": p_oid})
    if not payment:
        raise NotFound("Payment transaction not found.")

    now = _now()
    await db.payments.update_one(
        {"_id": p_oid},
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
        {"paymentId": p_oid},
        {"$set": {"status": "rejected"}},
    )

    await db.payment_events.insert_one({
        "paymentId": p_oid,
        "eventType": "verification_rejected",
        "actorId": rejected_by,
        "reason": reason,
        "createdAt": now,
    })

    return {"success": True, "status": "rejected", "paymentId": str(payment_id)}


async def refund_course_payment(payment_id: Any, refunded_by: Any = None, amount: float | None = None, refund_ref: str | None = None, reason: str = "Admin approved refund") -> dict[str, Any]:
    """Super Admin refunds transaction: transitions payment to refunded and revokes enrollment."""
    try:
        pid_uuid = uuid.UUID(str(payment_id))
    except (ValueError, TypeError):
        pid_uuid = None

    if settings.USE_POSTGRES and pid_uuid:
        from app.repositories.payment_repo import PaymentRepository
        v_uid = None
        try:
            v_uid = uuid.UUID(str(refunded_by)) if refunded_by else None
        except Exception:
            v_uid = None

        res = await PaymentRepository.refund_payment(pid_uuid, v_uid or pid_uuid, amount, refund_ref, reason=reason)
        return {
            "success": True,
            "status": "REFUNDED",
            "paymentId": str(res["id"]),
            "refundAmount": float(res["refund_amount"]),
        }

    db = get_db()
    p_oid = ObjectId(str(payment_id)) if not isinstance(payment_id, ObjectId) else payment_id
    payment = await db.payments.find_one({"_id": p_oid})
    if not payment:
        raise NotFound("Payment not found.")

    if payment.get("status") == "refunded":
        raise Conflict("Payment has already been refunded.")

    provider = get_payment_provider()
    charge = await provider.refund_charge(payment.get("transactionId", "TXN"), payment.get("amount", 0.0))

    now = _now()
    await db.payments.update_one(
        {"_id": p_oid},
        {"$set": {"status": "refunded", "refundReason": reason, "refundedAt": now, "updatedAt": now}},
    )
    await db.payment_events.insert_one({
        "paymentId": p_oid,
        "eventType": "refund",
        "reason": reason,
        "refundDetails": charge,
        "createdAt": now,
    })

    return {"success": True, "status": "refunded", "paymentId": str(payment_id)}

