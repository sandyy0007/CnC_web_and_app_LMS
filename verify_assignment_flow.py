import asyncio
import httpx
import json
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

async def test_full_flow():
    async with httpx.AsyncClient(timeout=30.0) as client:
        print("=== TEST 1: Trainer Login ===")
        login_res = await client.post(f"{BASE_URL}/auth/login", json={
            "identifier": "r.bose@abcengg.edu",
            "password": "Eedi@2026"
        })
        assert login_res.status_code == 200, f"Trainer login failed: {login_res.status_code} {login_res.text}"
        trainer_data = login_res.json()["data"]
        trainer_token = trainer_data["accessToken"]
        trainer_headers = {"Authorization": f"Bearer {trainer_token}"}
        print(f"Trainer logged in: {trainer_data['user']['name']} ({trainer_data['user']['email']})")

        print("\n=== TEST 2: GET /trainer/batches ===")
        batches_res = await client.get(f"{BASE_URL}/trainer/batches", headers=trainer_headers)
        assert batches_res.status_code == 200, f"Batches fetch failed: {batches_res.status_code} {batches_res.text}"
        batches_body = batches_res.json()
        batches = batches_body.get("data", [])
        print(f"Trainer batches returned: {len(batches)}")
        for b in batches:
            print(f"  - {b['name']} ({b['code']}) [ID: {b['id']}] - Status: {b['status']} - Students: {b.get('studentCount')}")
        
        # Verify only assigned batches are returned
        batch_codes = [b["code"] for b in batches]
        assert "CSE27A" in batch_codes, "Batch CSE27A missing from trainer batches"
        assert "CSE27B" in batch_codes, "Batch CSE27B missing from trainer batches"
        assert "B_6D3B17" not in batch_codes, "Unassigned batch B_6D3B17 should NOT be present"

        batch_a = next(b for b in batches if b["code"] == "CSE27A")
        batch_b = next(b for b in batches if b["code"] == "CSE27B")

        print("\n=== TEST 3: Assign Validation Checks ===")
        # 3a. Missing fields
        bad_req = await client.post(f"{BASE_URL}/trainer/games/assign", json={
            "gameCode": "reading-detective"
        }, headers=trainer_headers)
        print(f"Missing batchId check: status={bad_req.status_code}")
        assert bad_req.status_code in (400, 422), f"Expected 400/422 on missing batchId, got {bad_req.status_code}"

        # 3b. Non-existent game
        fake_game = await client.post(f"{BASE_URL}/trainer/games/assign", json={
            "gameCode": "non-existent-game-999",
            "batchId": batch_a["id"]
        }, headers=trainer_headers)
        print(f"Non-existent game check: status={fake_game.status_code}")
        assert fake_game.status_code == 404, f"Expected 404 on fake game, got {fake_game.status_code}"

        # 3c. Unassigned batch check
        unassigned_batch_id = "46e707d3-23c6-493b-bf6c-e5cd991ee880"
        unauth_batch = await client.post(f"{BASE_URL}/trainer/games/assign", json={
            "gameCode": "reading-detective",
            "batchId": unassigned_batch_id
        }, headers=trainer_headers)
        print(f"Unassigned batch check: status={unauth_batch.status_code} (detail: {unauth_batch.text})")
        assert unauth_batch.status_code == 403, f"Expected 403 on unassigned batch, got {unauth_batch.status_code}"

        print("\n=== TEST 4: Valid Game Assignment ===")
        assign_payload = {
            "gameCode": "reading-detective",
            "batchId": batch_a["id"],
            "dueDate": "2026-11-15T23:59:59Z",
            "notes": "Please complete Module 1 investigation before Friday's lab."
        }
        assign_res = await client.post(f"{BASE_URL}/trainer/games/assign", json=assign_payload, headers=trainer_headers)
        if assign_res.status_code == 409:
            print("Game was already assigned; testing duplicate protection verified immediately.")
        else:
            assert assign_res.status_code == 200, f"Assignment failed: {assign_res.status_code} {assign_res.text}"
            print("Assignment success response:", assign_res.json())

        print("\n=== TEST 5: Duplicate Assignment Protection (409 Conflict) ===")
        dup_res = await client.post(f"{BASE_URL}/trainer/games/assign", json=assign_payload, headers=trainer_headers)
        print(f"Duplicate assignment status: {dup_res.status_code} (detail: {dup_res.text})")
        assert dup_res.status_code == 409, f"Expected 409 Conflict, got {dup_res.status_code}"
        assert "already assigned" in dup_res.text.lower()

        print("\n=== TEST 6: Participant Isolation Verification ===")
        # 6a. Student Alex Johnson in Batch A (must see assigned game)
        alex_login = await client.post(f"{BASE_URL}/auth/login", json={
            "identifier": "alex.johnson@eedi.com",
            "password": "Eedi@2026"
        })
        assert alex_login.status_code == 200, f"Alex login failed: {alex_login.status_code}"
        alex_token = alex_login.json()["data"]["accessToken"]
        alex_headers = {"Authorization": f"Bearer {alex_token}"}

        alex_games_res = await client.get(f"{BASE_URL}/student/games", headers=alex_headers)
        assert alex_games_res.status_code == 200, f"Alex games fetch failed: {alex_games_res.status_code}"
        alex_games = alex_games_res.json()["data"]["games"]
        
        target_game_alex = next((g for g in alex_games if g["code"] == "reading-detective"), None)
        assert target_game_alex is not None, "reading-detective game not returned for Alex"
        print(f"Alex (Batch A) reading-detective: isAssigned={target_game_alex.get('isAssigned')}, assignment={target_game_alex.get('assignment')}")
        assert target_game_alex.get("isAssigned") is True, f"Alex should see isAssigned: True for reading-detective"
        assert target_game_alex.get("assignment") is not None, "Alex assignment metadata missing"

        # 6b. Control Student Jordan Smith in Batch B (must NOT see reading-detective as assigned)
        jordan_login = await client.post(f"{BASE_URL}/auth/login", json={
            "identifier": "outside.student@eedi.com",
            "password": "Eedi@2026"
        })
        assert jordan_login.status_code == 200, f"Jordan login failed: {jordan_login.status_code}"
        jordan_token = jordan_login.json()["data"]["accessToken"]
        jordan_headers = {"Authorization": f"Bearer {jordan_token}"}

        jordan_games_res = await client.get(f"{BASE_URL}/student/games", headers=jordan_headers)
        assert jordan_games_res.status_code == 200, f"Jordan games fetch failed: {jordan_games_res.status_code}"
        jordan_games = jordan_games_res.json()["data"]["games"]

        target_game_jordan = next((g for g in jordan_games if g["code"] == "reading-detective"), None)
        assert target_game_jordan is not None, "reading-detective game not returned for Jordan"
        print(f"Jordan (Batch B) reading-detective: isAssigned={target_game_jordan.get('isAssigned')}")
        assert target_game_jordan.get("isAssigned") is False, f"Jordan in Batch B should NOT see isAssigned: True"

        print("\n=== TEST 7: Trainer Analytics With Batch Filter ===")
        analytics_res = await client.get(f"{BASE_URL}/trainer/games/analytics?batchId={batch_a['id']}", headers=trainer_headers)
        assert analytics_res.status_code == 200, f"Analytics fetch failed: {analytics_res.status_code}"
        analytics_data = analytics_res.json()["data"]
        print("Trainer analytics data:", json.dumps(analytics_data, indent=2))
        assert "totalPlays" in analytics_data or "total_attempts" in analytics_data, "Missing analytics fields"

        print("\n==============================================")
        print(">>> ALL VERIFICATION TESTS PASSED 100% <<<")
        print("==============================================")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
