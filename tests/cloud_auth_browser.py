"""Run against a cloud-auth build; all Auth/session requests are mocked."""
import base64
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5174')
expect.set_options(timeout=15000)
checks = []
errors = []
subject = '7d050bbd-2ea7-416c-b70b-748594dc9a05'
email = 'student@example.test'

def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')

token = '.'.join([encode({'alg': 'HS256', 'typ': 'JWT'}), encode({
    'sub': subject, 'exp': int(time.time()) + 3600, 'aud': 'authenticated', 'role': 'authenticated'
}), 'browser-test-signature'])

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None,
        proxy={'server': os.environ['COLORVERSE_TEST_PROXY']} if os.environ.get('COLORVERSE_TEST_PROXY') else None,
        args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 960}, reduced_motion='reduce')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    state = {'valid': False, 'available': True, 'login_calls': 0, 'session_calls': 0}

    def auth(route):
        path = route.request.url
        if '/token' in path:
            state['login_calls'] += 1
            if not state['valid']:
                route.fulfill(status=400, json={'code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
            else:
                route.fulfill(json={'access_token': token, 'refresh_token': 'test-refresh-token',
                    'expires_in': 3600, 'token_type': 'bearer', 'user': {'id': subject, 'email': email,
                    'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}}})
        elif '/logout' in path:
            route.fulfill(status=204, body='')
        else:
            route.fulfill(status=400, json={'message': 'Unexpected Auth request in isolated test'})

    def session(route):
        state['session_calls'] += 1
        assert route.request.headers.get('authorization') == f'Bearer {token}'
        if state['available']:
            route.fulfill(json={'identity': {'id': subject, 'email': email}, 'access': 'pending-enrollment', 'cloudWrites': False})
        else:
            route.fulfill(status=503, json={'error': {'message': 'unavailable'}})

    page.route('https://*.supabase.co/auth/v1/**', auth)
    page.route('**/api/v1/cloud/session', session)
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='登录', exact=True)).to_be_visible()
    expect(page.locator('dialog')).not_to_be_visible()
    assert state['login_calls'] == 0 and state['session_calls'] == 0
    passed('guest browsing starts without a login wall or Auth request')

    page.get_by_role('button', name='登录', exact=True).click()
    dialog = page.get_by_role('dialog', name='登录你的色彩宇宙')
    expect(dialog).to_be_visible()
    expect(page.get_by_label('课堂邮箱')).to_be_focused()
    page.get_by_label('课堂邮箱').fill(email)
    page.get_by_label('密码', exact=True).fill('wrong-test-password')
    dialog.get_by_role('button', name='登录', exact=True).click()
    expect(dialog.get_by_role('status')).to_contain_text('邮箱或密码不正确')
    expect(page.get_by_label('密码', exact=True)).to_have_value('')
    page.keyboard.press('Escape')
    expect(dialog).not_to_be_visible()
    passed('login error is actionable; password clears and Escape closes dialog')

    state['valid'] = True
    page.get_by_role('button', name='登录', exact=True).click()
    page.get_by_label('密码', exact=True).fill('valid-test-password')
    page.get_by_role('dialog').get_by_role('button', name='登录', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('身份已验证，待加入班级')
    expect(page.get_by_role('dialog')).to_contain_text(email)
    expect(page.get_by_role('dialog')).to_contain_text('仍保存在本机')
    assert state['session_calls'] > 0
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-cloud-login-pilot.png'), full_page=True)
    page.get_by_role('button', name='继续浏览', exact=True).click()
    page.reload()
    expect(page.get_by_role('button', name='我的云端账户', exact=True)).to_be_visible()
    passed('signed-in identity is server-verified and rechecked after reload; no cloud-write grant')

    state['available'] = False
    page.reload()
    expect(page.get_by_role('button', name='我的云端账户', exact=True)).to_be_visible()
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('暂时无法验证云端身份')
    expect(page.get_by_role('dialog')).not_to_contain_text(email)
    page.get_by_role('button', name='退出登录', exact=True).click()
    expect(page.get_by_role('dialog', name='登录你的色彩宇宙')).to_be_visible()
    page.get_by_role('button', name='继续浏览', exact=True).click()
    page.reload()
    expect(page.get_by_role('button', name='登录', exact=True)).to_be_visible()
    passed('service failure withholds identity; users can still sign out and clear saved session')

    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='登录', exact=True).click()
    box = page.get_by_role('dialog').bounding_box()
    assert box and box['x'] >= 0 and box['x'] + box['width'] <= 390
    expect(page.get_by_label('课堂邮箱')).to_be_visible()
    expect(page.get_by_role('button', name='继续浏览', exact=True)).to_be_visible()
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-cloud-login-mobile.png'), full_page=True)
    passed('mobile login stays within viewport and remains operable')
    assert not errors, errors
    context.close()
    browser.close()

(ROOT / 'outputs/cloud-auth-browser-report.json').write_text(json.dumps({'checks': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
