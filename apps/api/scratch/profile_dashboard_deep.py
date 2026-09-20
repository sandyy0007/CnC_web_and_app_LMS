import asyncio
import time
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.core.database import get_db, init_db
from app.authz.context import ScopeContext
from app.authz.models import Role
from app.repositories.collections import (
    AttendanceRepo,
    BatchRepo,
    CourseProgressRepo,
    SkillAssessmentRepo,
    StudentProfileRepo,
    TrainingSessionRepo,
    UserRepo,
    WeakStudentAlertRepo,
)
from app.services import analytics

async def main():
    await init_db()
    # Find trainer r.bose@abcengg.edu
    trainer = await get_db().users.find_one({"email": "r.bose@abcengg.edu"})
    if not trainer:
        print("Trainer not found!")
        return
    
    # Get trainer's batches
    batches = await get_db().batches.find({"trainerIds": trainer["_id"]}).to_list(100)
    batch_ids = {b["_id"] for b in batches}
    dept_ids = {b["departmentId"] for b in batches if b.get("departmentId")}

    ctx = ScopeContext(
        tenant_id=trainer["institutionId"],
        user_id=trainer["_id"],
        role=Role.TRAINER,
        department_ids=frozenset(dept_ids),
        batch_ids=frozenset(batch_ids),
    )

    print(f"Profiling for trainer {trainer['email']}")
    print(f"Assigned batches: {len(batch_ids)}, departments: {len(dept_ids)}")

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    async def timed(label, coro):
        t0 = time.perf_counter()
        res = await coro
        dur = (time.perf_counter() - t0) * 1000
        print(f"  {label:35s}: {dur:8.2f} ms")
        return res

    print("\n--- Individual Query Timings ---")
    await timed("1. BatchRepo.find_all", BatchRepo(ctx).find_all(limit=100))
    await timed("2. StudentProfileRepo.count", StudentProfileRepo(ctx).count())
    await timed("3. analytics.attendance_overall", analytics.attendance_overall(ctx))
    await timed("4. analytics.assessment_summary", analytics.assessment_summary(ctx))
    await timed("5. SkillAssessmentRepo.count", SkillAssessmentRepo(ctx).count({"assessedBy": ctx.user_id, "state": "draft"}))
    await timed("6. WeakStudentAlertRepo.count", WeakStudentAlertRepo(ctx).count({"resolvedAt": None}))
    todays_sessions = await timed("7. TrainingSessionRepo.find_all", TrainingSessionRepo(ctx).find_all(
        {"date": {"$gte": today_start, "$lt": today_start + timedelta(days=1)}},
        limit=20,
        sort=[("date", 1)],
    ))
    await timed("8. analytics.attendance_trend", analytics.attendance_trend(ctx, weeks=8))
    await timed("9. analytics.assessment_by_module", analytics.assessment_by_module(ctx))

    if todays_sessions:
        await timed("10. AttendanceRepo.aggregate (today)", AttendanceRepo(ctx).aggregate(
            [
                {"$match": {"trainingSessionId": {"$in": [s["_id"] for s in todays_sessions]}}},
                {"$group": {"_id": "$trainingSessionId", "marked": {"$sum": 1}}},
            ]
        ))
    
    await timed("11. CourseProgressRepo.aggregate", CourseProgressRepo(ctx).col.aggregate(
        [
            {"$match": {"departmentId": {"$in": list(ctx.department_ids)} if ctx.department_ids else None}},
            {"$group": {"_id": None, "avg": {"$avg": "$percent"}}},
        ]
        if ctx.department_ids
        else [{"$match": {"_id": None}}]
    ).to_list(length=1))

if __name__ == "__main__":
    asyncio.run(main())

