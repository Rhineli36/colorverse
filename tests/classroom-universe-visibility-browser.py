"""Hidden planets stay out of every role's universe but remain recoverable by staff.

Uses isolated HTTP fixtures; never writes to the classroom database.
"""
import base64
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work/python-deps"))
from playwright.sync_api import sync_playwright, expect

URL = os.getenv("CLASSROOM_UI_URL", "http://127.0.0.1:5187/")
host = re.search(r"https://([a-z0-9]+\.supabase\.co)", (ROOT / "apps/web/.env.local").read_text()).group(1)
subject, cls, teacher, owner = [str(uuid.uuid4()) for _ in range(4)]
planets = [
    {"id": str(uuid.uuid4()), "owner_enrollment_id": owner if i == 0 else str(uuid.uuid4()),
     "display_name": f"虚拟学生{i}",
     "document": {"metadata": {"name": f"验收星球{i}"}, "skin": 0, "visible": i == 0},
     "works": [], "stats": {"likes": 1, "emojis": 0, "comments": 0}}
    for i in range(7)
]
errors, checks = [], []

def enc(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], proxy={"server": os.getenv("CLASSROOM_TEST_PROXY", "http://127.0.0.1:7892")} if URL.startswith("https://") else None)
    for role in ["teacher", "student"]:
        actor = teacher if role == "teacher" else owner
        user = {"id": subject, "email": "fixture@example.test", "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}}
        token = enc({"alg": "HS256"}) + "." + enc({"sub": subject, "exp": int(time.time()) + 3600, "role": "authenticated"}) + ".fixture"
        session = {"access_token": token, "refresh_token": "fixture", "expires_at": int(time.time()) + 3600, "expires_in": 3600, "token_type": "bearer", "user": user}
        ctx = browser.new_context(viewport={"width": 1440, "height": 960}, reduced_motion="reduce")
        ctx.add_init_script("localStorage.setItem(" + json.dumps("colorverse.auth." + host) + "," + json.dumps(json.dumps(session)) + ")")
        page = ctx.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        unexpected = []

        def api(route):
            path = route.request.url.split("/api/v1/cloud/")[1].split("?")[0]
            item = path.split("/")[-1]
            if route.request.method != "GET":
                unexpected.append(route.request.method + " " + path)
                route.fulfill(status=405)
                return
            if path == "session":
                data = {"identity": {"id": subject, "email": user["email"]}, "access": "active", "database": "connected", "cloudWrites": True, "memberships": [{"enrollmentId": actor, "classId": cls, "title": "虚拟验收班", "timezone": "Asia/Shanghai", "role": role}]}
            elif item == "planets":
                data = {"actorId": actor, "planets": planets}
            elif item == "overview":
                data = {"classId": cls, "title": "虚拟验收班", "timezone": "Asia/Shanghai", "generatedAt": "2026-11-11T00:00:00Z", "students": [{"enrollment_id": v["owner_enrollment_id"], "display_name": v["display_name"], "account_status": "active", "enrollment_status": "active", "planet_id": v["id"], "planet_name": v["document"]["metadata"]["name"], "weekly_showcase_count": 0, "course_submission_count": 0, "weekly_sent_count": 0, "weekly_received_count": 0, "last_submission": None, "showcase_count": 0, "sent_count": 0, "received_count": 1, "reviewed_showcase_count": 0, "average_showcase_score": None} for v in planets]}
            elif item == "account":
                data = {"name": "虚拟学生", "studentNumber": "00001", "mustChangePassword": False}
            elif item == "profile":
                data = {"profile": {"studentNumber": "00001", "name": "虚拟学生"}}
            elif item == "learning-tasks": data = {"tasks": []}
            elif item == "publications": data = {"publications": []}
            elif item == "my-assignments": data = {"planetId": planets[0]["id"], "assignments": [], "works": []}
            elif item == "notifications": data = {"notifications": [], "readIds": []}
            elif item == "guide": data = {"completed": [], "hasPeers": True}
            elif item == "interactions": data = {"interactions": []}
            elif item == "unlinked": data = {"works": []}
            elif item == "roster": data = {"students": []}
            else:
                unexpected.append(path)
                route.fulfill(status=404)
                return
            route.fulfill(json=data)

        page.route("**/api/v1/cloud/**", api)
        page.route("**/api/supabase/auth/v1/**", lambda route: route.fulfill(json=user))
        page.goto(URL, wait_until="networkidle")
        if role == "teacher":
            page.get_by_role("button", name="星球管理", exact=True).click()
            expect(page.get_by_role("button", name="进入星球", exact=False)).to_have_count(7)
            expect(page.locator(".teacher-status").filter(has_text="隐藏")).to_have_count(6)
            row = page.get_by_role("row").filter(has=page.get_by_text("验收星球1", exact=True))
            row.get_by_role("button", name="验收星球1更多操作", exact=True).click()
            expect(row.get_by_role("button", name="显示", exact=True)).to_be_visible()
            checks.append("teacher management retains all six hidden planets and restore controls")
        page.get_by_role("button", name="探索宇宙", exact=True).click()
        labels = page.locator(".observatory-labels")
        expect(labels.get_by_text("验收星球0", exact=True)).to_have_count(1)
        for i in range(1, 7):
            expect(labels.get_by_text(f"验收星球{i}", exact=True)).to_have_count(0)
            expect(page.locator(f'.cloud-highlights button[aria-label="查看互动亮点：虚拟学生{i}"]')).to_have_count(0)
        expect(page.locator('.cloud-highlights button[aria-label="查看互动亮点：虚拟学生0"]')).to_have_count(1)
        page.reload(wait_until="networkidle")
        page.get_by_role("button", name="探索宇宙", exact=True).click()
        expect(page.locator(".observatory-labels").get_by_text("验收星球1", exact=True)).to_have_count(0)
        assert not unexpected, unexpected
        checks.append(role + " universe and highlights exclude six hidden planets after reload")
        ctx.close()
    assert not errors, errors
    print(json.dumps({"status": "passed", "checks": checks, "pageErrors": errors}, ensure_ascii=False))
    browser.close()
