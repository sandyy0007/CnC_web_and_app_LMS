import asyncio
from app.db.mongo import get_db, connect_to_mongo

async def run():
    db = await connect_to_mongo()
    cols = await db.list_collection_names()
    print("Collections and counts:")
    for col in sorted(cols):
        cnt = await db[col].count_documents({})
        print(f"  {col:30s}: {cnt}")

if __name__ == "__main__":
    asyncio.run(run())

