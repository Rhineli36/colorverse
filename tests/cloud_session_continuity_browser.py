"""Same-account renewal retains drafts; identity changes and failed checks revoke access.

Run against a cloud-auth build. All Auth and classroom API requests are isolated fixtures.
"""
import base64
import json
import os
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5174')
expect.set_options(timeout=15000)
subject, actor, cls, planet, work_id = [str(uuid.uuid4()) for _ in range(5)]
user = {'id': subject, 'email': 'refresh@example.test', 'aud': 'authenticated',
        'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}}
state = {'status': 200, 'hold': False, 'role': 'student', 'access': 'active'}
held, assets, checks, errors = [], [], [], []
encode = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')

def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

def identity_response(route):
    if state['status'] != 200:
        route.fulfill(status=state['status'], json={'error': {'message': 'isolated unavailable'}})
        return
    route.fulfill(json={'identity': {'id': user['id'], 'email': user['email']},
        'access': state['access'], 'database': 'connected', 'cloudWrites': True,
        'memberships': [{'enrollmentId': actor, 'classId': cls, 'title': '续期测试班',
            'timezone': 'Asia/Shanghai', 'role': state['role']}] if state['access'] == 'active' else []})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None,
        proxy={'server': os.environ['COLORVERSE_TEST_PROXY']} if os.environ.get('COLORVERSE_TEST_PROXY') else None,
        args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: assets.append(r.url) if '/assets/auth-client-' in r.url else None)

    def auth(route):
        if '/token' in route.request.url:
            token = '.'.join([encode({'alg': 'HS256'}), encode({'sub': user['id'],
                'exp': int(time.time()) + 3600, 'aud': 'authenticated', 'role': 'authenticated'}), 'isolated'])
            route.fulfill(json={'access_token': token, 'refresh_token': 'isolated-refresh',
                'expires_in': 3600, 'token_type': 'bearer', 'user': user})
        elif '/user' in route.request.url:
            route.fulfill(json=user)
        elif '/logout' in route.request.url:
            route.fulfill(status=204, body='')
        else:
            route.fulfill(status=400, json={'message': 'unexpected isolated Auth request'})

    def api(route):
        url = route.request.url
        if url.endswith('/session'):
            if state['hold']:
                held.append(route)
            else:
                identity_response(route)
        elif url.endswith('/planets'):
            assert route.request.method == 'GET'
            route.fulfill(json={'actorId': actor, 'planets': [{'id': planet,
                'owner_enrollment_id': actor, 'display_name': '续期测试学生',
                'document': {'metadata': {'name': '续期测试星球'}, 'color': '#82c9c7',
                    'skin': 0, 'revision': 0, 'media': {}}, 'works': [{'id': work_id,
                    'title': '续期测试作品', 'description': '', 'presetId': 'crystal', 'color': '#82c9c7',
                    'createdAt': '2026-10-12T00:00:00Z', 'params': {}, 'revision': 0}]}]})
        elif url.endswith('/guide'):
            route.fulfill(json={'completed': ['work'], 'hasPeers': False})
        elif '/interactions?' in url:
            route.fulfill(json={'interactions': []})
        elif url.endswith('/image'):
            route.fulfill(body=(ROOT / 'apps/web/public/demo/v2/body-2.webp').read_bytes(), content_type='image/webp')
        else:
            raise AssertionError('unexpected fixture request: ' + route.request.method + ' ' + url)

    page.route('https://*.supabase.co/auth/v1/**', auth)
    page.route('**/api/v1/cloud/**', api)
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='登录', exact=True).click()
    page.get_by_label('课堂邮箱').fill(user['email'])
    page.get_by_label('密码', exact=True).fill('isolated-password')
    page.get_by_role('dialog').get_by_role('button', name='登录', exact=True).click()
    page.get_by_role('button', name='进入我的星球 →', exact=True).click()
    expect(page.get_by_role('heading', name='续期测试星球', exact=True)).to_be_visible()
    nav = page.get_by_role('navigation', name='主导航')
    expect(nav.get_by_role('button', name='我的星球与作品', exact=True)).to_be_visible()
    expect(nav.get_by_role('button', name='编辑你的星球', exact=True)).to_have_count(0)
    expect(nav.get_by_role('button', name='课程作业', exact=True)).to_have_count(0)
    page.get_by_role('button', name='宇宙演示', exact=True).click()
    expect(page.get_by_role('complementary', name='课堂入口提示')).to_be_visible()
    page.get_by_role('button', name='日落收藏家', exact=True).click()
    page.get_by_role('button', name='进入星球内部 ↗', exact=True).click()
    expect(page.get_by_role('button', name='编辑这颗星球 ↗', exact=True)).to_have_count(0)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-cloud-student-navigation.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.get_by_role('button', name='进入我的云端星球 →', exact=True).click()
    passed('student navigation separates real classroom from local demonstration')

    def renew():
        assert assets
        result = page.evaluate('async (url) => {const m=await import(url); const r=await m.g().auth.refreshSession(); return !r.error;}', assets[0])
        assert result

    def release():
        state['hold'] = False
        for _ in range(20):
            if held:
                break
            page.wait_for_timeout(50)
        assert held
        for route in held[:]:
            identity_response(route)
        held.clear()
        expect(page.get_by_role('button', name='我的云端账户', exact=True)).to_be_visible()

    page.get_by_role('button', name='＋ 上传展示作品', exact=True).click()
    upload = page.get_by_role('dialog', name='上传云端展示作品')
    upload.get_by_label('作品名称').fill('尚未提交的草稿')
    upload.get_by_label('想表达什么').fill('这段描述需要保留')
    upload.get_by_label('作品图片').set_input_files(str(ROOT / 'apps/web/public/demo/v2/body-2.webp'))
    state['hold'] = True
    renew()
    expect(page.get_by_role('button', name='验证登录…', exact=True)).to_be_visible()
    expect(upload).to_be_visible()
    expect(upload.get_by_label('作品名称')).to_have_value('尚未提交的草稿')
    release()
    expect(upload.get_by_label('想表达什么')).to_have_value('这段描述需要保留')
    assert upload.get_by_label('作品图片').evaluate('(e)=>e.files.length') == 1
    # Exercise the navigation handler even when the upload backdrop covers pointer clicks.
    page.get_by_role('button', name='宇宙演示', exact=True).evaluate('(el)=>el.click()')
    expect(upload).to_be_visible()
    expect(page.get_by_role('status').filter(has_text='请先保存或取消云端课堂')).to_be_visible()
    expect(page.get_by_label('作品班级')).to_be_disabled()
    assert page.evaluate('!window.dispatchEvent(new Event("beforeunload",{cancelable:true}))')
    page.keyboard.press('Escape')
    passed('delayed token renewal preserves upload title, description and selected file; navigation cannot discard it')

    page.get_by_role('button', name='编辑星球外貌与背景', exact=True).click()
    settings = page.get_by_role('region', name='云端星球设置')
    settings.get_by_role('button', name='星球介绍', exact=True).click()
    page.get_by_label('星球介绍', exact=True).fill('未保存的星球介绍')
    renew()
    expect(page.get_by_label('星球介绍', exact=True)).to_have_value('未保存的星球介绍')
    page.get_by_role('button', name='完成设置', exact=True).click()
    expect(settings).to_be_visible()
    expect(settings.get_by_role('status')).to_contain_text('还有未保存的修改')
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    expect(page.get_by_role('button', name='退出登录', exact=True)).to_be_disabled()
    page.get_by_role('button', name='关闭登录', exact=True).click()
    page.get_by_role('button', name='放弃未保存修改', exact=True).click()
    expect(settings).to_have_count(0)
    passed('renewal preserves planet settings; unfinished settings require saving or explicit discard')

    page.get_by_role('button', name='查看作品 续期测试作品', exact=True).click()
    page.get_by_role('button', name='编辑元素', exact=True).click()
    editor = page.get_by_role('region', name='云端元素编辑')
    editor.get_by_label('元素运动', exact=True).select_option('rotate')
    renew()
    expect(editor.get_by_label('元素运动', exact=True)).to_have_value('rotate')
    page.get_by_role('button', name='取消修改', exact=True).click()
    passed('element editing and its unsaved motion survive normal renewal')

    state['role'] = 'teacher'
    renew()
    expect(page.get_by_role('button', name='教师演示', exact=True)).to_be_visible()
    state['status'] = 503
    renew()
    expect(page.get_by_role('button', name='教师演示', exact=True)).to_have_count(0)
    expect(page.locator('.cloud-gallery')).to_have_count(0)
    state['status'] = 200
    state['role'] = 'student'
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    page.get_by_role('button', name='重新核对班级', exact=True).click()
    page.get_by_role('button', name='进入我的星球 →', exact=True).click()
    passed('failed verification revokes cached teacher controls and classroom access; retry recovers')

    page.get_by_role('button', name='＋ 上传展示作品', exact=True).click()
    page.get_by_label('作品名称', exact=True).fill('属于上一个账户的草稿')
    user['id'] = str(uuid.uuid4())
    user['email'] = 'other@example.test'
    page.evaluate('async (url) => {const m=await import(url); await m.g().auth.signInWithPassword({email:"other@example.test",password:"isolated-password"});}', assets[0])
    expect(upload).to_have_count(0)
    expect(page.get_by_role('heading', name='续期测试星球', exact=True)).to_be_visible()
    page.get_by_role('button', name='＋ 上传展示作品', exact=True).click()
    expect(page.get_by_label('作品名称', exact=True)).to_have_value('')
    page.keyboard.press('Escape')
    state['status'] = 401
    renew()
    expect(page.locator('.cloud-gallery')).to_have_count(0)
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('登录已失效')
    page.get_by_role('button', name='退出登录', exact=True).click()
    page.get_by_role('button', name='关闭登录', exact=True).click()
    expect(page.get_by_role('button', name='登录', exact=True)).to_be_visible()
    passed('account changes do not inherit another user draft; invalid identity and sign-out clear access')

    assert not errors, errors
    (ROOT / 'outputs/cloud-session-continuity-browser.json').write_text(json.dumps(
        {'status': 'passed', 'checks': checks, 'pageErrors': errors, 'mode': 'isolated Auth/API'},
        ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
