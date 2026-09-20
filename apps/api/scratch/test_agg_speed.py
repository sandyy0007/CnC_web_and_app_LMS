import asyncio
import time
from app.db.mongo import get_db, connect_to_mongo
from app.seed.run import seed

async def run():
    db = await connect_to_mongo()
    print("Seeding minimal database...")
    t0 = time.perf_counter()
    await seed(reset=True, minimal=False)
    print(f"Seed complete in {(time.perf_counter() - t0):.2f} s")

    user = await db.users.find_one({"email": "r.bose@abcengg.edu"})
    batches = await db.batches.find({"trainerIds": user["_id"]}).to_list(100)
    batch_ids = [b["_id"] for b in batches]
    print(f"Batch IDs: {batch_ids}")

    # 1. Aggregate
    t0 = time.perf_counter()
    res1 = await db.attendance.aggregate([
        {"$match": {"batchId": {"$in": batch_ids}}},
        {
            "$group": {
                "_id": None,
                "total": {"$sum": 1},
                "present": {"$sum": {"$cond": [{"$in": ["$status", ["present", "late"]]}, 1, 0]}},
            }
        }
    ]).to_list(length=None)
    t_agg = (time.perf_counter() - t0) * 1000
    print(f"Aggregate time: {t_agg:.2f} ms, result: {res1}")

    # 2. Simple find with projection
    t0 = time.perf_counter()
    cursor = db.attendance.find(
        {"batchId": {"$in": batch_ids}},
        {"status": 1, "_id": 0}
    )
    docs = await cursor.to_list(length=100000)
    total = len(docs)
    present = sum(1 for d in docs if d.get("status") in ("present", "late"))
    t_find = (time.perf_counter() - t0) * 1000
    print(f"Find + python sum time: {t_find:.2f} ms, count: {total}, present: {present}")

if __name__ == "__main__":
    asyncio.run(run())

