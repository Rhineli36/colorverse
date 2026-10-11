"""Isolated first/returning student flows against a cloud-auth build."""
import base64
import json
import os
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=15000)
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5174')
subject, actor, class_a, class_b, peer, planet_id = [str(uuid.uuid4()) for _ in range(6)]
email = 'student@example.test'
def encode(data):
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
token = '.'.join([encode({'alg': 'HS256'}), encode({'sub': subject, 'exp': int(time.time()) + 3600, 'aud': 'authenticated', 'role': 'authenticated'}), 'isolated-test-signature'])
user = {'id': subject, 'email': email, 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}}
state = {'planet': None, 'posts': 0, 'class': '', 'role': 'student'}
checks, errors = [], []
def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None,
        args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    def auth(route):
        if '/token' in route.request.url:
            route.fulfill(json={'access_token': token, 'refresh_token': 'test-refresh', 'expires_in': 3600, 'token_type': 'bearer', 'user': user})
        elif '/user' in route.request.url: route.fulfill(json=user)
        elif '/logout' in route.request.url: route.fulfill(status=204, body='')
        else: route.fulfill(status=400, json={'message': 'unexpected isolated auth request'})
    def api(route):
        path = urlsplit(route.request.url).path
        assert route.request.headers.get('authorization') == f'Bearer {token}'
        if path.endswith('/session'):
            route.fulfill(json={'identity': {'id': subject, 'email': email}, 'access': 'active', 'database': 'connected', 'cloudWrites': True,
                'memberships': [{'enrollmentId': actor if i else peer, 'classId': cls, 'title': title, 'timezone': 'Asia/Shanghai', 'role': state['role']} for i, cls, title in [(0, class_a, '第一班'), (1, class_b, '第二班')]]})
        elif path.endswith('/planets'):
            state['class'] = path.split('/')[-2]
            if route.request.method == 'POST':
                assert json.loads(route.request.post_data) == {'random': True}
                state['posts'] += 1
                state['planet'] = {'id': planet_id, 'owner_enrollment_id': actor, 'display_name': '学生测试', 'document': {'metadata': {'name': '流焰星'}, 'color': '#efa568', 'skin': 2, 'revision': 0, 'media': {}}, 'works': []}
                route.fulfill(json={'id': planet_id, 'created': True})
            else:
                planets = ([state['planet']] if state['planet'] else []) + [{'id': peer, 'owner_enrollment_id': peer, 'display_name': '同学', 'document': {'metadata': {'name': '同学的星球'}, 'color': '#82c9c7'}, 'works': []}]
                route.fulfill(json={'actorId': actor, 'planets': planets})
        elif path.endswith('/appearance'):
            data = json.loads(route.request.post_data)
            doc = state['planet']['document']
            assert data['revision'] == doc['revision']
            doc.update({'metadata': {'name': data['name']}, 'skin': data['skin'], 'color': data['color'], 'revision': doc['revision'] + 1})
            route.fulfill(json={'saved': True})
        elif path.endswith('/exterior') or path.endswith('/interior'):
            kind = path.split('/')[-1]
            if route.request.method == 'POST':
                doc = state['planet']['document']
                doc['media'][kind] = {'id': str(uuid.uuid4())}
                doc['revision'] += 1
                route.fulfill(json={'saved': True, 'id': doc['media'][kind]['id']})
            else:
                route.fulfill(body=(ROOT / 'apps/web/public/demo/v2/body-2.webp').read_bytes(), content_type='image/webp')
        elif path.endswith('/interactions'): route.fulfill(json={'interactions': []})
        elif path.endswith('/overview'): route.fulfill(json={'classId': class_b, 'title': '第二班', 'timezone': 'Asia/Shanghai', 'generatedAt': '2026-10-11T12:00:00Z', 'students': []})
        else: route.fulfill(status=404, json={'error': {'message': 'unexpected isolated API request'}})
    page.route('https://*.supabase.co/auth/v1/**', auth)
    page.route('**/api/v1/cloud/**', api)
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='登录', exact=True).click()
    page.get_by_label('课堂邮箱').fill(email)
    page.get_by_label('密码', exact=True).fill('isolated-password')
    page.get_by_role('dialog').get_by_role('button', name='登录', exact=True).click()
    dialog = page.get_by_role('dialog', name='你的宇宙身份')
    expect(dialog.get_by_role('button', name='进入我的星球 →', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='第二班 学生', exact=True).click()
    assert dialog.get_by_role('button', name='进入我的星球 →').bounding_box()['height'] >= 56
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-student-enter.png'))
    dialog.get_by_role('button', name='进入我的星球 →').click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button', name='一键随机创建我的星球 ✦')).to_be_visible()
    expect(page.get_by_label('作品班级')).to_have_value(class_b)
    passed('large explicit entry opens the selected class, not the local workshop')
    page.get_by_role('button', name='一键随机创建我的星球 ✦').click()
    birth = page.locator('.cloud-planet-birth')
    expect(birth).to_be_visible()
    assert birth.evaluate('(el) => getComputedStyle(el).animationDuration') == '4.5s'
    page.wait_for_timeout(900)
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-planet-birth.png'))
    page.wait_for_timeout(1200)
    expect(birth).to_be_visible()
    expect(birth).to_have_count(0, timeout=6000)
    assert state['posts'] == 1
    passed('one-click random planet has a 4.5-second birth sequence and selects its owner')
    page.get_by_role('button', name='开始设计 →').click()
    settings = page.get_by_role('region', name='云端星球设置')
    page.get_by_label('云端星球名称').fill('我的色彩实验室')
    page.get_by_role('button', name='选择紫雾星').click()
    page.get_by_role('button', name='保存名称和默认外观').click()
    expect(settings.get_by_role('status')).to_contain_text('已保存到云端')
    image = str(ROOT / 'apps/web/public/demo/body-0.png')
    page.get_by_label('星球外貌图片', exact=True).set_input_files(image)
    page.get_by_role('button', name='上传星球外貌', exact=True).click()
    expect(settings.get_by_role('status')).to_contain_text('星球外貌已上传')
    page.get_by_label('星球内部背景图片', exact=True).set_input_files(image)
    page.get_by_role('button', name='上传内部背景', exact=True).click()
    expect(settings.get_by_role('status')).to_contain_text('内部背景已上传')
    expect(page.get_by_role('img', name='星球内部背景')).to_be_visible()
    page.get_by_role('button', name='完成设置').click()
    expect(page.get_by_role('button', name='开始设计 →')).to_have_count(0)
    passed('name, default appearance and both images save; onboarding prompt clears after completion')
    page.get_by_role('button', name='同学的星球', exact=False).click()
    expect(page.get_by_role('button', name='编辑星球外貌与背景')).to_have_count(0)
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    page.get_by_role('button', name='进入我的星球 →', exact=True).click()
    expect(page.get_by_role('heading', name='我的色彩实验室', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='一键随机创建我的星球 ✦')).to_have_count(0)
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    page.get_by_role('button', name='进入我的星球 →', exact=True).click()
    expect(page.get_by_role('heading', name='我的色彩实验室', exact=True)).to_be_visible()
    passed('returning entry and reload select the owned planet; peers have no editing controls')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='编辑星球外貌与背景').click()
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-cloud-planet-settings-mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    passed('mobile onboarding and image settings do not overflow')
    page.get_by_role('button', name='完成设置').click()
    state['role'] = 'teacher'
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    page.get_by_role('button', name='重新核对班级').click()
    page.get_by_role('button', name='第二班 教师', exact=True).click()
    page.get_by_role('button', name='进入班级管理 →').click()
    expect(page.get_by_role('heading', name='看见每一颗星球的成长。')).to_be_visible()
    passed('teacher entry opens classroom management instead of student creation')
    assert not errors, errors
    (ROOT / 'outputs/cloud-planet-entry-browser.json').write_text(json.dumps({'status': 'passed', 'checks': checks, 'pageErrors': errors, 'mode': 'isolated Auth/API fixtures'}, ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
