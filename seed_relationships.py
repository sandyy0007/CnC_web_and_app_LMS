import asyncio
import asyncpg
from uuid import UUID, uuid4

async def main():
    conn = await asyncpg.connect('postgresql://postgres@localhost:5432/cnc')
    
    inst_id = UUID('5f2fce16-149e-430b-991f-9ea13b29dd29')
    dept_id = UUID('1e8a74c6-c78f-4518-9588-6f0f51df3aad')
    bose_id = UUID('77698c0a-05bd-5088-b520-1d34b6a34ed1')
    alex_id = UUID('40405aae-40c9-5268-a33d-198e1105475b')

    # 1. Clean up incorrect link in batch_trainers
    await conn.execute("""
        DELETE FROM batch_trainers 
        WHERE trainer_user_id = $1 AND batch_id = '46e707d3-23c6-493b-bf6c-e5cd991ee880'
    """, bose_id)

    # 2. Insert or update batches for Winners Creek University / CSE
    batch_a = await conn.fetchrow("""
        SELECT * FROM batches 
        WHERE institution_id = $1 AND code = 'CSE27A'
    """, inst_id)
    if not batch_a:
        batch_a = await conn.fetchrow("""
            INSERT INTO batches (
                institution_id, department_id, name, code, academic_year, semester,
                status, created_at, updated_at
            )
            VALUES ($1, $2, 'CSE 2027 - A', 'CSE27A', '2026-2027', 5, 'ACTIVE', NOW(), NOW())
            RETURNING *
        """, inst_id, dept_id)
        print("Created Batch A:", batch_a["id"])
    else:
        print("Batch A exists:", batch_a["id"])

    batch_b = await conn.fetchrow("""
        SELECT * FROM batches 
        WHERE institution_id = $1 AND code = 'CSE27B'
    """, inst_id)
    if not batch_b:
        batch_b = await conn.fetchrow("""
            INSERT INTO batches (
                institution_id, department_id, name, code, academic_year, semester,
                status, created_at, updated_at
            )
            VALUES ($1, $2, 'CSE 2027 - B', 'CSE27B', '2026-2027', 5, 'ACTIVE', NOW(), NOW())
            RETURNING *
        """, inst_id, dept_id)
        print("Created Batch B:", batch_b["id"])
    else:
        print("Batch B exists:", batch_b["id"])

    batch_a_id = batch_a["id"]
    batch_b_id = batch_b["id"]

    # 3. Assign both batches to Dr. R. Bose in batch_trainers
    for bid in [batch_a_id, batch_b_id]:
        exists = await conn.fetchval("""
            SELECT 1 FROM batch_trainers WHERE batch_id = $1 AND trainer_user_id = $2
        """, bid, bose_id)
        if not exists:
            await conn.execute("""
                INSERT INTO batch_trainers (batch_id, trainer_user_id, assigned_at)
                VALUES ($1, $2, NOW())
            """, bid, bose_id)
            print(f"Assigned batch {bid} to Dr. Bose")

    # 4. Ensure trainer profile for Dr. Bose
    t_prof = await conn.fetchrow("SELECT * FROM trainer_profiles WHERE user_id = $1", bose_id)
    if not t_prof:
        await conn.execute("""
            INSERT INTO trainer_profiles (user_id, title, specializations, rating, institution_id, department_id, created_at, updated_at)
            VALUES ($1, 'Lead Technical Trainer', ARRAY['Cognitive Skills', 'System Architecture'], 4.9, $2, $3, NOW(), NOW())
        """, bose_id, inst_id, dept_id)
        print("Created trainer profile for Dr. Bose")
    else:
        await conn.execute("""
            UPDATE trainer_profiles 
            SET institution_id = $2, department_id = $3, updated_at = NOW()
            WHERE user_id = $1
        """, bose_id, inst_id, dept_id)
        print("Updated trainer profile for Dr. Bose")

    # 5. Link Alex Johnson to Batch A
    await conn.execute("""
        UPDATE student_profiles
        SET batch_id = $2, updated_at = NOW()
        WHERE user_id = $1
    """, alex_id, batch_a_id)
    print("Linked Alex Johnson to Batch A in student_profiles")

    # 6. Check enrollment for Alex Johnson
    course = await conn.fetchrow("SELECT id FROM courses WHERE published = TRUE LIMIT 1")
    course_id = course["id"] if course else UUID('4a29fb5f-d33f-4ef7-88e7-8d114f0dda27')

    enr = await conn.fetchrow("SELECT * FROM enrollments WHERE participant_user_id = $1", alex_id)
    if not enr:
        await conn.execute("""
            INSERT INTO enrollments (
                participant_user_id, course_id, institution_id, department_id, batch_id,
                current_semester, enrollment_status, payment_status, access_status,
                access_start_date, access_end_date, created_at, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5,
                5, 'ACTIVE', 'VERIFIED', 'ACTIVE',
                CURRENT_DATE, CURRENT_DATE + INTERVAL '180 days', NOW(), NOW()
            )
        """, alex_id, course_id, inst_id, dept_id, batch_a_id)
        print("Created enrollment for Alex Johnson in Batch A")
    else:
        await conn.execute("""
            UPDATE enrollments
            SET batch_id = $2, enrollment_status = 'ACTIVE', access_status = 'ACTIVE', payment_status = 'VERIFIED', updated_at = NOW()
            WHERE participant_user_id = $1
        """, alex_id, batch_a_id)
        print("Updated enrollment for Alex Johnson to Batch A")

    # 7. Check or create control student outside Batch A (enrolled in Batch B)
    ctrl_email = "outside.student@eedi.com"
    ctrl_user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", ctrl_email)
    if not ctrl_user:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        pw_hash = pwd_context.hash("Eedi@2026")
        ctrl_user = await conn.fetchrow("""
            INSERT INTO users (
                email, name, password_hash, role, institution_id, department_id,
                status, created_at, updated_at
            )
            VALUES (
                $1, 'Jordan Smith', $2, 'STUDENT', $3, $4,
                'ACTIVE', NOW(), NOW()
            )
            RETURNING *
        """, ctrl_email, pw_hash, inst_id, dept_id)
        print("Created control student Jordan Smith:", ctrl_user["id"])
    
    ctrl_id = ctrl_user["id"]
    ctrl_prof = await conn.fetchrow("SELECT * FROM student_profiles WHERE user_id = $1", ctrl_id)
    if not ctrl_prof:
        await conn.execute("""
            INSERT INTO student_profiles (
                user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at
            )
            VALUES ($1, 'CSE21B199', $2, $3, $4, NOW(), NOW())
        """, ctrl_id, inst_id, dept_id, batch_b_id)
        print("Created student profile for Jordan Smith in Batch B")
    else:
        await conn.execute("""
            UPDATE student_profiles SET batch_id = $2, updated_at = NOW() WHERE user_id = $1
        """, ctrl_id, batch_b_id)

    ctrl_enr = await conn.fetchrow("SELECT * FROM enrollments WHERE participant_user_id = $1", ctrl_id)
    if not ctrl_enr:
        await conn.execute("""
            INSERT INTO enrollments (
                participant_user_id, course_id, institution_id, department_id, batch_id,
                current_semester, enrollment_status, payment_status, access_status,
                access_start_date, access_end_date, created_at, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5,
                5, 'ACTIVE', 'VERIFIED', 'ACTIVE',
                CURRENT_DATE, CURRENT_DATE + INTERVAL '180 days', NOW(), NOW()
            )
        """, ctrl_id, course_id, inst_id, dept_id, batch_b_id)
        print("Created enrollment for Jordan Smith in Batch B")

    print("\n--- SEED VERIFICATION COMPLETE ---")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())

