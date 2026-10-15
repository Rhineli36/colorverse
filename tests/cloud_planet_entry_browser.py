"""Isolated first/returning student flows against a cloud-auth build."""
import io
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
from PIL import Image, ImageChops

expect.set_options(timeout=15000)
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5174')
subject, actor, class_a, class_b, peer, planet_id = [str(uuid.uuid4()) for _ in range(6)]
email = 'student@example.test'
def encode(data):
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
token = '.'.join([encode({'alg': 'HS256'}), encode({'sub': subject, 'exp': int(time.time()) + 3600, 'aud': 'authenticated', 'role': 'authenticated'}), 'isolated-test-signature'])
user = {'id': subject, 'email': email, 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}}
state = {'planet': None, 'posts': 0, 'class': '', 'role': 'student', 'visited': False, 'reaction': False, 'comment': False, 'hasPeers': False}
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
                state['planet'] = {'id': planet_id, 'owner_enrollment_id': actor, 'display_name': '学生测试', 'document': {'metadata': {'name': '流焰星'}, 'color': '#efa568', 'skin': 0, 'revision': 0, 'media': {}}, 'works': []}
                route.fulfill(json={'id': planet_id, 'created': True})
            else:
                planets = ([state['planet']] if state['planet'] else []) + [{'id': peer, 'owner_enrollment_id': peer, 'display_name': '同学', 'document': {'metadata': {'name': '同学的星球'}, 'color': '#82c9c7'}, 'works': []}]
                route.fulfill(json={'actorId': actor, 'planets': planets})
        elif path.endswith('/appearance'):
            data = json.loads(route.request.post_data)
            doc = state['planet']['document']
            assert data['revision'] == doc['revision']
            doc['metadata'].update({'name': data['name']})
            if 'summary' in data: doc['metadata']['summary'] = data['summary']
            for key in ['skin', 'color', 'atmosphere', 'halo', 'brightness', 'saturation']:
                if key in data: doc[key] = data[key]
            if data.get('practice') == 'tone': doc.setdefault('guide', {})['tone'] = True
            doc['revision'] += 1
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
        elif path.endswith('/learning-tasks'):route.fulfill(json={'tasks':[]})
  elif path.endswith('/guide'):
            if route.request.method == 'POST':
                assert json.loads(route.request.post_data)['planetId'] == peer
                state['visited'] = True
                route.fulfill(json={'saved': True})
            else:
                doc = state['planet']['document'] if state['planet'] else {}
                facts = {'exterior': doc.get('media', {}).get('exterior'), 'interior': doc.get('media', {}).get('interior'), 'atmosphere': doc.get('atmosphere', 'none') != 'none', 'tone': doc.get('guide', {}).get('tone'), 'summary': doc.get('metadata', {}).get('summary'), 'work': bool(state['planet'] and state['planet']['works']), 'element': any(w['revision'] > 0 for w in state['planet']['works']) if state['planet'] else False, 'visit': state['visited'], 'reaction': state['reaction'], 'comment': state['comment']}
                route.fulfill(json={'completed': [key for key, value in facts.items() if value], 'hasPeers': state['hasPeers']})
        elif path.endswith('/works') and route.request.method == 'POST':
            work_id = str(uuid.uuid4())
            state['planet']['works'].append({'id': work_id, 'title': '我的展示作业', 'description': '一件色彩作业', 'presetId': 'crystal', 'color': '#82c9c7', 'createdAt': '2026-10-11T12:00:00Z', 'params': {'x': .5, 'y': .6, 'size': .65, 'motion': 'float'}, 'revision': 0})
            route.fulfill(json={'id': work_id, 'created': True})
        elif path.endswith('/element'):
            data = json.loads(route.request.post_data)
            w = state['planet']['works'][0]
            assert data['revision'] == w['revision']
            w.update({'params': {k: data[k] for k in ['x','y','size','motion']}, 'presetId': data['presetId'], 'color': data['color'], 'revision': w['revision'] + 1})
            route.fulfill(json={'saved': True})
        elif path.endswith('/interactions'):
            if route.request.method == 'POST':
                data = json.loads(route.request.post_data)
                state['reaction' if data['kind'] in ['like','emoji'] else 'comment'] = True
            route.fulfill(json={'interactions': []})
        elif path.endswith('/review'): route.fulfill(json={'review':None})
        elif path.endswith('/overview'): route.fulfill(json={'classId': class_b, 'title': '第二班', 'timezone': 'Asia/Shanghai', 'generatedAt': '2026-10-11T12:00:00Z', 'students': []})
        else: route.fulfill(status=404, json={'error': {'message': 'unexpected isolated API request'}})
    page.route('https://*.supabase.co/auth/v1/**', auth)
    page.route("**/api/supabase/auth/v1/**",auth)
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
    guide = page.get_by_role('region', name='我的星球任务')
    expect(guide.get_by_role('progressbar')).to_have_attribute('value', '0')
    guide.get_by_role('button', name='查看全部任务').click()
    expect(guide.get_by_role('button',name='等待同学加入')).to_have_count(3)
    for button in guide.get_by_role('button',name='等待同学加入').all(): expect(button).to_be_disabled()
    expect(guide.get_by_role('button',name='上传后可编辑')).to_be_disabled()
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-student-guide-first.png'),full_page=True)
    guide.get_by_role('button', name='收起任务列表').click()
    guide.get_by_role('button', name='关闭任务引导', exact=True).click()
    expect(guide.get_by_role('heading')).to_have_count(0)
    expect(guide.get_by_role('progressbar')).to_have_attribute('value','0')
    page.get_by_role('button',name='编辑星球外貌与背景',exact=True).click()
    settings = page.get_by_role('region',name='云端星球设置')
    settings.get_by_role('button',name='星球介绍',exact=True).click()
    expect(page.get_by_label('星球介绍',exact=True)).to_be_visible()
    settings.get_by_role('button',name='完成设置',exact=True).click()
    page.get_by_role('button',name='打开功能探索进度',exact=True).click()
    expect(guide.get_by_role('button',name='关闭任务引导',exact=True)).to_be_visible()
    passed('guide can close completely; uncompleted tasks do not prevent freely opening settings')
    state['hasPeers'] = True
    page.get_by_role('button',name='刷新作品',exact=True).click()
    passed('peer tasks wait for classmates; element task waits for the first upload')
    guide.get_by_role('button', name='替换外貌图片 →', exact=True).click()
    settings = page.get_by_role('region', name='云端星球设置')
    page.get_by_role('button', name='选择紫雾星').click()
    page.get_by_role('button', name='保存默认外观').click()
    expect(settings.get_by_role('status')).to_contain_text('已保存到云端')
    expect(guide.get_by_role('progressbar')).to_have_attribute('value', '0')
    image = str(ROOT / 'apps/web/public/demo/body-0.png')
    page.get_by_label('星球外貌图片', exact=True).set_input_files(image)
    page.get_by_role('button', name='上传星球外貌', exact=True).click()
    expect(settings.get_by_role('status')).to_contain_text('星球外貌已上传')
    expect(guide.get_by_role('progressbar')).to_have_attribute('value', '1')
    guide.get_by_role('button', name='选择粒子效果 →', exact=True).click()
    expect(settings.get_by_role('button', name='粒子氛围', exact=True)).to_have_attribute('aria-pressed','true')
    preview = page.get_by_label('星球效果即时预览')
    def preview_pixels(): return Image.open(io.BytesIO(preview.screenshot(animations='disabled'))).convert('RGB')
    no_effect = preview_pixels()
    page.get_by_role('button', name='萤火微光', exact=True).click()
    particles = preview_pixels()
    changed = lambda a,b: sum(1 for pixel in ImageChops.difference(a,b).getdata() if max(pixel)>20)
    assert changed(no_effect,particles) > 200

    expect(preview.locator('.cloud-atmosphere.fireflies i')).to_have_count(24)
    page.get_by_role('button',name='霓虹光环',exact=True).click()
    expect(preview.locator('.halo-ring')).to_have_count(1)
    ring = preview_pixels()
    assert changed(particles,ring) > 400
    page.get_by_role('button',name='柔光光晕',exact=True).click()
    soft = preview_pixels()
    assert changed(ring,soft) > 400
    page.get_by_role('button',name='霓虹光环',exact=True).click()
    page.emulate_media(reduced_motion='reduce')
    assert preview.locator('.cloud-atmosphere i').first.evaluate('(el)=>getComputedStyle(el).animationName') == 'none'
    still = preview_pixels();page.wait_for_timeout(350);assert ImageChops.difference(still,preview_pixels()).getbbox() is None
    page.emulate_media(reduced_motion='no-preference')
    preview.screenshot(path=str(ROOT / 'outputs/COLORVERSE-effects-preview-detail.png'),animations='disabled')
    passed('particle and both halo choices change real preview pixels immediately; reduced motion keeps the scene still')
    assert state['planet']['document'].get('halo','none') == 'none'
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-effects-live-preview.png'),full_page=True)
    page.get_by_role('button', name='保存星球设置', exact=True).click()
    expect(page.locator('.cloud-room .cloud-atmosphere.fireflies i')).to_have_count(24)
    guide.get_by_role('button', name='替换内部背景 →', exact=True).click()
    page.get_by_label('星球内部背景图片', exact=True).set_input_files(image)
    page.get_by_role('button', name='上传内部背景', exact=True).click()
    expect(settings.get_by_role('status')).to_contain_text('内部背景已上传')
    expect(page.get_by_role('img', name='星球内部背景')).to_be_visible()
    guide.get_by_role('button', name='调整色调 →', exact=True).click()
    page.get_by_label('背景饱和度',exact=True).fill('0.5')
    expect(page.locator('.cloud-preview-backdrop')).to_have_attribute('style', __import__('re').compile(r'saturate\(0.5\)'))
    page.get_by_role('button', name='保存星球设置', exact=True).click()
    expect(page.locator('.cloud-room-scenery')).to_have_attribute('style', __import__('re').compile(r'saturate\(0.5\)'))
    guide.get_by_role('button', name='填写星球介绍 →', exact=True).click()
    page.get_by_label('云端星球名称').fill('我的色彩实验室')
    page.get_by_label('星球介绍', exact=True).fill('用蓝紫色描绘自己的色彩世界。')
    page.get_by_role('button', name='保存星球设置', exact=True).click()
    expect(settings.get_by_role('status')).to_contain_text('已保存到云端')
    expect(guide.get_by_role('progressbar')).to_have_attribute('value', '5')
    page.get_by_role('button', name='完成设置').click()
    passed('guided design tasks route to focused sections and complete only after actual cloud saves')
    guide.get_by_role('button', name='上传展示作业 →', exact=True).click()
    upload = page.get_by_role('dialog', name='上传云端展示作品')
    upload.get_by_label('作品名称').fill('我的展示作业')
    upload.locator('input[type=file]').set_input_files(image)
    upload.get_by_role('button', name='提交并点亮星球', exact=True).click()
    expect(upload).not_to_be_visible()
    expect(page.locator('.cloud-growth.born')).to_have_count(1)
    expect(page.locator('.cloud-growth.born')).to_have_count(0, timeout=6000)
    guide.get_by_role('button', name='编辑成长元素 →', exact=True).click()
    editor = page.get_by_role('region', name='云端元素编辑')
    expect(editor).to_be_visible()
    guide.get_by_role('button', name='关闭任务引导', exact=True).click()
    expect(guide.get_by_role('heading')).to_have_count(0)
    expect(page.get_by_label('元素编辑操作').get_by_role('button',name='退出元素编辑',exact=True)).to_be_enabled()
    page.get_by_role('button',name='退出元素编辑',exact=True).click()
    expect(editor).to_have_count(0)
    page.get_by_role('button',name='编辑星球外貌与背景',exact=True).click()
    expect(settings).to_be_visible()
    settings.get_by_role('button',name='完成设置',exact=True).click()
    page.get_by_role('button',name='打开功能探索进度',exact=True).click()
    guide.get_by_role('button',name='编辑成长元素 →',exact=True).click()
    editor.get_by_label('元素运动').select_option('still')
    page.get_by_label('元素编辑操作').get_by_role('button',name='保存并结束编辑',exact=True).click()
    expect(editor).not_to_be_visible()
    expect(guide.get_by_role('progressbar')).to_have_attribute('value', '7')
    passed('guide opens work upload and element editing, saving completes separate tasks')
    state['hasPeers'] = False
    page.get_by_role('button',name='刷新作品',exact=True).click()
    expect(guide.get_by_role('button',name='等待同学加入',exact=True)).to_be_disabled()
    guide.get_by_role('button',name='关闭任务引导',exact=True).click()
    page.get_by_role('button',name='宇宙演示',exact=True).click()
    badge = page.get_by_role('button',name='打开功能探索进度',exact=True)
    expect(badge).to_contain_text('7/10')
    badge.click()
    expect(guide.get_by_role('button',name='关闭任务引导',exact=True)).to_be_visible()
    guide.get_by_role('button',name='关闭任务引导',exact=True).click()
    page.reload();page.wait_for_load_state('networkidle')
    expect(badge).to_contain_text('7/10')
    page.get_by_role('button',name='我的星球与作品',exact=True).click()
    expect(guide.get_by_role('button',name='打开任务引导',exact=True)).to_be_visible()
    page.get_by_role('button',name='编辑星球外貌与背景',exact=True).click()
    expect(settings).to_be_visible()
    settings.get_by_role('button',name='完成设置',exact=True).click()
    guide.get_by_role('button',name='打开任务引导',exact=True).click()
    state['hasPeers'] = True
    page.get_by_role('button',name='刷新作品',exact=True).click()
    passed('seven completed tasks and unavailable peers do not lock editing; main-page progress reopens the guide and closed preference survives reload')
    guide.get_by_role('button', name='拜访同学 →', exact=True).click()
    expect(guide.get_by_role('progressbar')).to_have_attribute('value','8')
    page.get_by_role('button', name='♡ 点赞星球',exact=True).click()
    expect(guide.get_by_role('progressbar')).to_have_attribute('value','9')
    guide.get_by_role('button', name='写下留言 →',exact=True).click()
    expect(page.get_by_label('星球留言',exact=True)).to_be_focused()
    page.get_by_label('星球留言',exact=True).fill('蓝紫色搭配很有层次，想看看你的下一件作品。')
    page.get_by_role('button', name='发送留言',exact=True).click()
    expect(guide.get_by_role('heading',name='初次航行完成 ✦')).to_be_visible()
    expect(guide.get_by_role('progressbar')).to_have_attribute('value','10')
    guide.get_by_role('button', name='查看全部任务').click()
    expect(guide.locator('li.completed')).to_have_count(10)
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-student-guide-complete.png'),full_page=True)
    passed('verified peer visit, reaction and comment complete all ten tasks')
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
    expect(page.get_by_role('region',name='我的星球任务').get_by_role('progressbar')).to_have_attribute('value','10')
    passed('returning entry and reload select the owned planet; peers have no editing controls')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='编辑星球外貌与背景').click()
    page.get_by_role('region', name='我的星球任务').get_by_role('button',name='查看全部任务').click()
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
