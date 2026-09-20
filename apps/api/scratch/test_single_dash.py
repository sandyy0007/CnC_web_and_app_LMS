import asyncio
import httpx

async def run():
    base = "http://127.0.0.1:8000/api/v1"
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(f"{base}/auth/login", json={
            "identifier": "r.bose@abcengg.edu",
            "password": "Eedi@2026",
            "rememberMe": True,
        })
        token = res.json()["data"]["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}
        print("Logged in, calling /trainer/dashboard...")
        res_dash = await client.get(f"{base}/trainer/dashboard", headers=headers)
        print(f"Dashboard status: {res_dash.status_code}")

if __name__ == "__main__":
    asyncio.run(run())

