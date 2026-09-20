import asyncio
import time
import json
import httpx

async def profile_http():
    base = "http://127.0.0.1:8000/api/v1"
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Login as Trainer
        t0 = time.perf_counter()
        res_login = await client.post(f"{base}/auth/login", json={
            "identifier": "r.bose@abcengg.edu",
            "password": "Eedi@2026",
            "rememberMe": True,
        })
        t_login = (time.perf_counter() - t0) * 1000
        print(f"1. Login Status: {res_login.status_code} in {t_login:.2f} ms")
        if res_login.status_code != 200:
            print("Login failed:", res_login.text)
            return

        login_data = res_login.json()["data"]
        token = login_data["accessToken"]
        cookies = res_login.cookies
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Refresh Token
        t0 = time.perf_counter()
        res_refresh = await client.post(f"{base}/auth/refresh", cookies=cookies)
        t_refresh = (time.perf_counter() - t0) * 1000
        print(f"2. Refresh Session Status: {res_refresh.status_code} in {t_refresh:.2f} ms")

        # 3. GET /auth/me
        t0 = time.perf_counter()
        res_me = await client.get(f"{base}/auth/me", headers=headers)
        t_me = (time.perf_counter() - t0) * 1000
        print(f"3. GET /auth/me Status: {res_me.status_code} in {t_me:.2f} ms (Size: {len(res_me.content)} B)")

        # 4. GET /notifications/unread-count
        t0 = time.perf_counter()
        res_notif = await client.get(f"{base}/notifications/unread-count", headers=headers)
        t_notif = (time.perf_counter() - t0) * 1000
        print(f"4. GET /notifications/unread-count Status: {res_notif.status_code} in {t_notif:.2f} ms")

        # 5. GET /trainer/dashboard (Mono API)
        timings_dash = []
        dash_size = 0
        for _ in range(5):
            t0 = time.perf_counter()
            res_dash = await client.get(f"{base}/trainer/dashboard", headers=headers)
            t_dash = (time.perf_counter() - t0) * 1000
            timings_dash.append(t_dash)
            dash_size = len(res_dash.content)

        avg_dash = sum(timings_dash) / len(timings_dash)
        print(f"5. GET /trainer/dashboard: avg={avg_dash:.2f} ms, min={min(timings_dash):.2f} ms, max={max(timings_dash):.2f} ms (Size: {dash_size} B)")

        # 6. GET /trainer/batches
        timings_batches = []
        batch_size = 0
        for _ in range(5):
            t0 = time.perf_counter()
            res_batches = await client.get(f"{base}/trainer/batches", headers=headers)
            t_batches = (time.perf_counter() - t0) * 1000
            timings_batches.append(t_batches)
            batch_size = len(res_batches.content)

        avg_batches = sum(timings_batches) / len(timings_batches)
        print(f"6. GET /trainer/batches: avg={avg_batches:.2f} ms, min={min(timings_batches):.2f} ms (Size: {batch_size} B)")

if __name__ == "__main__":
    asyncio.run(profile_http())

