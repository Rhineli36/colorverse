"""Teacher-only local tools require a cloud-auth build and an isolated verified session.
This fixture never uses a real teacher account or calls a real identity endpoint.
"""
import base64, json, time, uuid
from playwright.sync_api import expect

def install_identity(page, role="teacher"):
    context = page.context
    if hasattr(context, "_colorverse_identity_fixture"):
        return context._colorverse_identity_fixture
    subject, enrollment, class_id = [str(uuid.uuid4()) for _ in range(3)]
    email = "teacher-tools@example.test"
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    token = ".".join([encode({"alg":"HS256"}), encode({"sub":subject,"exp":int(time.time())+3600,"aud":"authenticated","role":"authenticated"}), "isolated-signature"])
    user = {"id":subject,"email":email,"aud":"authenticated","role":"authenticated","app_metadata":{},"user_metadata":{"role":"teacher"}}
    state = {"role":role,"access":"active","available":True,"email":email}
    def auth(route):
        if "/token" in route.request.url:
            route.fulfill(json={"access_token":token,"refresh_token":"isolated-refresh","expires_in":3600,"token_type":"bearer","user":user})
        elif "/user" in route.request.url: route.fulfill(json=user)
        elif "/logout" in route.request.url: route.fulfill(status=204,body="")
        else: route.fulfill(status=400,json={"message":"unexpected isolated Auth call"})
    def session(route):
        assert route.request.headers.get("authorization") == "Bearer " + token
        if not state["available"]:
            route.fulfill(status=503,json={"error":{"message":"暂时无法验证班级"}});return
        route.fulfill(json={"identity":{"id":subject,"email":email},"access":state["access"],"database":"connected","cloudWrites":False,"memberships":[{"enrollmentId":enrollment,"classId":class_id,"title":"教师工具测试班","timezone":"Asia/Shanghai","role":state["role"]}] if state["access"]=="active" else []})
    context.route("https://*.supabase.co/auth/v1/**",auth)
    context.route("**/api/supabase/auth/v1/**",auth)
    context.route("**/api/v1/cloud/session",session)
    context._colorverse_identity_fixture = state
    return state

def login_fixture(page):
    state=page.context._colorverse_identity_fixture
    login=page.get_by_role("button",name="登录",exact=True)
    expect(login).to_be_visible() # Build with VITE_ENABLE_CLOUD_AUTH=true.
    login.click();dialog=page.get_by_role("dialog")
    dialog.get_by_label("课堂邮箱").fill(state["email"])
    dialog.get_by_label("密码",exact=True).fill("isolated-password")
    dialog.get_by_role("button",name="登录",exact=True).click()
    expect(dialog.get_by_role("button",name="重新核对班级",exact=True)).to_be_visible()
    dialog.get_by_role("button",name="关闭登录",exact=True).click()

def enable_teacher(page):
    state=install_identity(page)
    state["role"]="teacher";state["access"]="active";state["available"]=True
    if page.get_by_role("button",name="登录",exact=True).count(): login_fixture(page)
    elif not page.get_by_role("button",name="教师演示",exact=True).count():
        page.get_by_role("button",name="我的云端账户",exact=True).click()
        page.get_by_role("button",name="重新核对班级",exact=True).click()
        expect(page.get_by_role("button",name="教师演示",exact=True)).to_be_visible()
        page.get_by_role("button",name="关闭登录",exact=True).click()
    expect(page.get_by_role("button",name="教师演示",exact=True)).to_be_visible()
