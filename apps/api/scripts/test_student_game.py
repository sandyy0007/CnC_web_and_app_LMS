import asyncio
from app.db.postgres import get_pg_connection
from app.core.security import hash_password, verify_password

async def main():
    async with get_pg_connection() as conn:
        row = await conn.fetchrow("""
            SELECT u.id, u.email, u.role, u.status, u.password_hash, s.roll_number 
            FROM users u 
            JOIN students s ON s.user_id = u.id 
            WHERE s.roll_number = '25EARCS001'
        """)
        if not row:
            print("Student 25EARCS001 not found")
            return
        d = dict(row)
        print("Student found:", d['email'], d['roll_number'], d['status'])
        # Test password against known passwords
        for pwd in ["Password@123", "Arya@2025", "Arya@2026", "Student@123", "Eedi@2026", "Welcome@123", "AryaCollege@2025", "25EARCS001"]:
            if verify_password(pwd, d['password_hash']):
                print(f"MATCHING PASSWORD FOUND: {pwd}")
                break
        else:
            print("No simple password matched. Password hash starts with:", d['password_hash'][:20])

if __name__ == "__main__":
    asyncio.run(main())

