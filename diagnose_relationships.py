import asyncio
import asyncpg
from uuid import UUID

async def diagnose():
    conn = await asyncpg.connect('postgresql://postgres@localhost:5432/cnc')
    print("==================================================")
    print("1. BATCHES (CSE 2027 - A & B)")
    print("==================================================")
    batches = await conn.fetch("""
        SELECT b.id, b.name, b.code, b.status, b.semester, b.academic_year, b.department_id, b.institution_id
        FROM batches b
        WHERE b.code IN ('CSE27A', 'CSE27B')
    """)
    for b in batches:
        print(dict(b))

    batch_map = {b['code']: b['id'] for b in batches}

    print("\n==================================================")
    print("2. PARTICIPANTS IN CSE27A & CSE27B")
    print("==================================================")
    for code, bid in batch_map.items():
        print(f"\n--- Batch {code} ({bid}) ---")
        # Check student_profiles
        sp_rows = await conn.fetch("""
            SELECT sp.id as profile_id, sp.user_id, sp.roll_number, sp.batch_id, u.name, u.email, u.role
            FROM student_profiles sp
            JOIN users u ON u.id = sp.user_id
            WHERE sp.batch_id = $1
        """, bid)
        print(f"student_profiles with batch_id = {bid}: {len(sp_rows)}")
        for r in sp_rows:
            print("  Profile:", dict(r))

        # Check enrollments
        enr_rows = await conn.fetch("""
            SELECT e.id as enrollment_id, e.participant_user_id, e.course_id, e.batch_id, e.current_semester,
                   e.enrollment_status, e.payment_status, e.access_status, u.name, u.email
            FROM enrollments e
            JOIN users u ON u.id = e.participant_user_id
            WHERE e.batch_id = $1
        """, bid)
        print(f"enrollments with batch_id = {bid}: {len(enr_rows)}")
        for r in enr_rows:
            print("  Enrollment:", dict(r))

        # Check batch_trainers
        bt_rows = await conn.fetch("""
            SELECT bt.id, bt.batch_id, bt.trainer_user_id, u.name, u.email
            FROM batch_trainers bt
            JOIN users u ON u.id = bt.trainer_user_id
            WHERE bt.batch_id = $1
        """, bid)
        print(f"batch_trainers for {code}: {len(bt_rows)}")
        for r in bt_rows:
            print("  Trainer:", dict(r))

    print("\n==================================================")
    print("3. ALEX JOHNSON RECORD")
    print("==================================================")
    u_alex = await conn.fetchrow("SELECT * FROM users WHERE email = 'alex.johnson@eedi.com'")
    print("User:", dict(u_alex) if u_alex else "NOT FOUND")
    if u_alex:
        sp_alex = await conn.fetchrow("SELECT * FROM student_profiles WHERE user_id = $1", u_alex["id"])
        print("Student Profile:", dict(sp_alex) if sp_alex else "NOT FOUND")
        enr_alex = await conn.fetch("SELECT * FROM enrollments WHERE participant_user_id = $1", u_alex["id"])
        print("Enrollments:", [dict(e) for e in enr_alex])

    print("\n==================================================")
    print("4. ALL PARTICIPANTS IN WINNERS CREEK UNIVERSITY")
    print("==================================================")
    all_students = await conn.fetch("""
        SELECT u.id, u.name, u.email, sp.roll_number, sp.batch_id, b.name as batch_name, b.code as batch_code
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN batches b ON b.id = sp.batch_id
        WHERE u.role = 'STUDENT' AND u.institution_id = '5f2fce16-149e-430b-991f-9ea13b29dd29'
    """)
    for s in all_students:
        print(dict(s))

    await conn.close()

if __name__ == "__main__":
    asyncio.run(diagnose())

