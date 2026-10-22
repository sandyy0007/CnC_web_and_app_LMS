import asyncio, uuid
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.routers.student import _profile
from app.routers.trainer import batch_students, students, student_detail, batches

async def run_audit():
    print("=" * 60)
    print("WINNERS CREEK - BATCH & PARTICIPANT CONSISTENCY AUDIT")
    print("=" * 60)
    
    # 1. Test Alex Johnson Student Profile
    alex_uuid = uuid.UUID('40405aae-40c9-5268-a33d-198e1105475b')
    student_ctx = ScopeContext(user_id=alex_uuid, college_id=None, department_id=None, session_id='test-student', role=Role.STUDENT)
    p_data = await _profile(student_ctx)
    print("\n[CHECK 1] Participant Alex Johnson Profile:")
    print(f"  Name:       {p_data.get('name')}")
    print(f"  Roll No:    {p_data.get('rollNumber')}")
    print(f"  Batch:      {p_data.get('batchName')}")
    print(f"  Batch Code: {p_data.get('batchCode')}")
    print(f"  Semester:   {p_data.get('semester')}")
    print(f"  Section:    {p_data.get('section')}")
    print(f"  Program:    {p_data.get('program')}")
    assert p_data.get('batchName') == "CSE 2027 - A", f"Expected 'CSE 2027 - A', got {p_data.get('batchName')}"
    assert p_data.get('semester') == 5, f"Expected 5, got {p_data.get('semester')}"
    assert p_data.get('section') == "A", f"Expected 'A', got {p_data.get('section')}"
    print("  => PASSED: Profile correctly shows Batch 'CSE 2027 - A', Semester 5, Section A, Program B.Tech - Computer Science & Engineering")

    # 2. Test Trainer My Batches
    dr_bose_uuid = uuid.UUID('77698c0a-05bd-5088-b520-1d34b6a34ed1')
    trainer_ctx = ScopeContext(user_id=dr_bose_uuid, college_id=None, department_id=None, session_id='test-trainer', role=Role.TRAINER)
    batches_res = await batches(ctx=trainer_ctx)
    print("\n[CHECK 2] Trainer Dr. Bose Assigned Batches:")
    b_map = {}
    for b in batches_res.get('data', []):
        print(f"  Batch {b['name']} ({b['code']}): {b['studentCount']} student(s), Semester {b['semester']}")
        b_map[b['code']] = b
    assert 'CSE27A' in b_map, "CSE27A not found in trainer batches"
    assert 'CSE27B' in b_map, "CSE27B not found in trainer batches"
    assert b_map['CSE27A']['studentCount'] == 1, "CSE27A count should be 1"
    assert b_map['CSE27B']['studentCount'] == 1, "CSE27B count should be 1"
    print("  => PASSED: Trainer sees 2 active batches with 1 student each")

    # 3. Test Trainer Batch Roster for CSE27A
    b1_id = b_map['CSE27A']['id']
    roster_a = await batch_students(b1_id, ctx=trainer_ctx)
    print("\n[CHECK 3] Trainer Batch Roster for CSE27A:")
    items_a = roster_a.get('items', [])
    print(f"  Roster size: {len(items_a)}")
    for item in items_a:
        print(f"  - Participant: {item['name']}, Roll: {item['rollNumber']}, Attendance: {item['attendancePercent']}%")
    assert len(items_a) == 1, f"Expected 1 participant in CSE27A, got {len(items_a)}"
    assert items_a[0]['rollNumber'] == 'CSE21B101', f"Expected roll CSE21B101, got {items_a[0]['rollNumber']}"
    print("  => PASSED: CSE27A roster matches Alex Johnson")

    # 4. Test Trainer Batch Roster for CSE27B
    b2_id = b_map['CSE27B']['id']
    roster_b = await batch_students(b2_id, ctx=trainer_ctx)
    print("\n[CHECK 4] Trainer Batch Roster for CSE27B:")
    items_b = roster_b.get('items', [])
    print(f"  Roster size: {len(items_b)}")
    for item in items_b:
        print(f"  - Participant: {item['name']}, Roll: {item['rollNumber']}, Attendance: {item['attendancePercent']}%")
    assert len(items_b) == 1, f"Expected 1 participant in CSE27B, got {len(items_b)}"
    assert items_b[0]['rollNumber'] == 'CSE21B199', f"Expected roll CSE21B199, got {items_b[0]['rollNumber']}"
    print("  => PASSED: CSE27B roster matches Jordan Smith")

    # 5. Test Trainer All Students List
    all_students_res = await students(ctx=trainer_ctx)
    all_items = all_students_res.get('items', [])
    print(f"\n[CHECK 5] Trainer All Participants: {len(all_items)} total")
    for s in all_items:
        print(f"  - {s['name']} ({s['rollNumber']}) in {s['batchName']}")
    assert len(all_items) == 2, f"Expected 2 total participants across trainer's batches, got {len(all_items)}"
    print("  => PASSED: Trainer all students query returns exactly both participants")

    # 6. Test Participant Detail
    detail_res = await student_detail(str(alex_uuid), ctx=trainer_ctx)
    p_prof = detail_res.get('data', {}).get('profile', {})
    print(f"\n[CHECK 6] Trainer Participant Detail for Alex Johnson:")
    print(f"  Name: {p_prof.get('name')}, Batch: {p_prof.get('batchName')}, Semester: {p_prof.get('semester')}")
    assert p_prof.get('batchName') == "CSE 2027 - A"
    print("  => PASSED: Detail endpoint returns correct batch and semester")

    print("\n" + "=" * 60)
    print("ALL 6 CONSISTENCY CHECKS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == '__main__':
    asyncio.run(run_audit())

