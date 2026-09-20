import asyncio, time
from app.db.mongo import connect_to_mongo, is_inmemory, get_db
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.services import analytics
from app.repositories.collections import AttendanceRepo

async def verify():
    await connect_to_mongo()
    print("Is inmemory:", is_inmemory())

asyncio.run(verify())

