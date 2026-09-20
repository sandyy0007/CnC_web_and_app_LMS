"""TEMPORARY security-review probe #2. Delete after use."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_probe_recruiter_lists_every_report_job(admin, hod, client):
    # 1. HOD produces a department-wide export.
    created = await hod.post("/hod/reports", json={"reportType": "attendance", "format": "csv"})
    assert created.status_code == 202, created.text
    print("hod job:", created.json()["data"].get("id"))

    # 2. Admin provisions a RECRUITER account (allowed by UserRequest).
    made = await admin.post(
        "/admin/users",
        json={
            "name": "Probe Recruiter",
            "email": "probe.recruiter@example.com",
            "role": "RECRUITER",
        },
    )
    print("create recruiter:", made.status_code, made.text[:300])
    data = made.json()["data"]

    login = await client.post(
        "/api/v1/auth/login",
        json={"identifier": data["email"], "password": data["temporaryPassword"]},
    )
    print("recruiter login:", login.status_code)
    token = login.json()["data"]["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/reports/jobs", headers=headers)
    print("RECRUITER /reports/jobs:", r.status_code)
    if r.status_code == 200:
        items = r.json()["items"]
        print("  jobs visible:", len(items))
        for it in items[:4]:
            print(
                "   -",
                it.get("reportType"),
                it.get("requestedByRole"),
                it.get("requestedByLabel"),
                "downloadUrl" in it,
            )
        with_url = [i for i in items if i.get("downloadUrl")]
        if with_url:
            f = await client.get(with_url[0]["downloadUrl"])
            print("  fetched foreign export:", f.status_code, len(f.content), "bytes")
            print("  first rows:", f.content.decode("utf-8-sig", "replace").splitlines()[:2])
