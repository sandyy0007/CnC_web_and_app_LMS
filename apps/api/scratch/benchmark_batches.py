import asyncio
import json
import time
import statistics
from bson import ObjectId

from app.db.mongo import connect_to_mongo, serialize
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.repositories.collections import (
    BatchRepo,
    StudentProfileRepo,
)
from app.services import analytics

async def sequential_batches(ctx, rows):
    out = []
    queries = 0
    for batch in rows:
        count = await StudentProfileRepo(ctx).count({"batchId": batch["_id"]})
        attendance = await analytics.attendance_overall(ctx, filters={"batchId": batch["_id"]})
        assessment = await analytics.assessment_summary(ctx, filters={"batchId": batch["_id"]})
        queries += 3
        out.append({
            **serialize(batch),
            "studentCount": count,
            "attendancePercent": attendance["percentage"],
            "averageScore": assessment["average"],
        })
    return out, queries

async def concurrent_batches(ctx, rows, max_concurrency=10):
    sem = asyncio.Semaphore(max_concurrency)
    queries = [0]

    async def _fetch_batch(batch):
        async with sem:
            count, attendance, assessment = await asyncio.gather(
                StudentProfileRepo(ctx).count({"batchId": batch["_id"]}),
                analytics.attendance_overall(ctx, filters={"batchId": batch["_id"]}),
                analytics.assessment_summary(ctx, filters={"batchId": batch["_id"]}),
            )
            queries[0] += 3
            return {
                **serialize(batch),
                "studentCount": count,
                "attendancePercent": attendance["percentage"],
                "averageScore": assessment["average"],
            }

    out = await asyncio.gather(*[_fetch_batch(b) for b in rows])
    return list(out), queries[0]

async def run_benchmark():
    db = await connect_to_mongo()
    # Check existing batches
    existing_batches = await db.batches.find({}).to_list(100)
    college = await db.colleges.find_one({})
    college_id = college["_id"] if college else ObjectId()
    dept = await db.departments.find_one({})
    dept_id = dept["_id"] if dept else ObjectId()

    # Ensure we have at least 25 batches to test 1, 5, 10, 25
    batch_list = list(existing_batches)
    created_dummy = []
    while len(batch_list) < 25:
        dummy_batch = {
            "collegeId": college_id,
            "departmentId": dept_id,
            "name": f"Benchmark Batch {len(batch_list) + 1}",
            "code": f"BM-{len(batch_list) + 1}",
            "semesterNumber": 1,
            "status": "active",
            "capacity": 60,
        }
        res = await db.batches.insert_one(dummy_batch)
        dummy_batch["_id"] = res.inserted_id
        batch_list.append(dummy_batch)
        created_dummy.append(res.inserted_id)

    batch_ids = tuple(b["_id"] for b in batch_list)
    ctx = ScopeContext(
        user_id=ObjectId(),
        role=Role.TRAINER,
        college_id=college_id,
        department_id=dept_id,
        session_id="benchmark-session",
        department_ids=(dept_id,),
        batch_ids=batch_ids,
    )

    batch_counts = [1, 5, 10, 25]
    runs = 5

    results = []

    print(f"{'Batches':<8} | {'Method':<12} | {'Avg (ms)':<10} | {'p50 (ms)':<10} | {'p95 (ms)':<10} | {'DB Queries':<10} | {'Size (B)':<10}")
    print("-" * 80)

    for n in batch_counts:
        sub_rows = batch_list[:n]

        # Benchmark Sequential
        seq_times = []
        seq_size = 0
        seq_q = 0
        for _ in range(runs):
            t0 = time.perf_counter()
            out, q = await sequential_batches(ctx, sub_rows)
            t1 = time.perf_counter()
            seq_times.append((t1 - t0) * 1000)
            seq_size = len(json.dumps(out).encode("utf-8"))
            seq_q = q

        seq_avg = statistics.mean(seq_times)
        seq_p50 = sorted(seq_times)[len(seq_times) // 2]
        seq_p95 = sorted(seq_times)[int(len(seq_times) * 0.95)]

        print(f"{n:<8} | {'Sequential':<12} | {seq_avg:<10.2f} | {seq_p50:<10.2f} | {seq_p95:<10.2f} | {seq_q:<10} | {seq_size:<10}")

        # Benchmark Concurrent
        con_times = []
        con_size = 0
        con_q = 0
        for _ in range(runs):
            t0 = time.perf_counter()
            out, q = await concurrent_batches(ctx, sub_rows)
            t1 = time.perf_counter()
            con_times.append((t1 - t0) * 1000)
            con_size = len(json.dumps(out).encode("utf-8"))
            con_q = q

        con_avg = statistics.mean(con_times)
        con_p50 = sorted(con_times)[len(con_times) // 2]
        con_p95 = sorted(con_times)[int(len(con_times) * 0.95)]

        print(f"{n:<8} | {'Concurrent':<12} | {con_avg:<10.2f} | {con_p50:<10.2f} | {con_p95:<10.2f} | {con_q:<10} | {con_size:<10}")

        speedup = seq_avg / con_avg if con_avg > 0 else 1.0
        results.append({
            "batches": n,
            "seq_avg": seq_avg,
            "seq_p50": seq_p50,
            "seq_p95": seq_p95,
            "con_avg": con_avg,
            "con_p50": con_p50,
            "con_p95": con_p95,
            "queries": seq_q,
            "size_bytes": seq_size,
            "speedup": speedup,
        })
        print("-" * 80)

    # Clean up dummy batches
    if created_dummy:
        await db.batches.delete_many({"_id": {"$in": created_dummy}})

    print("\nBENCHMARK_SUMMARY_JSON:")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    asyncio.run(run_benchmark())
