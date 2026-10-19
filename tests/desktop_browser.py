"""Verify the real portable EXE, without Node on PATH and with the renderer offline.

Run with a Python environment containing Playwright:
  python tests/desktop_browser.py --exe path/to/colorverse.exe
Only a new, isolated test profile is created; the user's normal profile is untouched.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--exe', required=True)
parser.add_argument('--out', default='outputs/desktop-tests')
args = parser.parse_args()
exe = Path(args.exe).resolve()
out = (ROOT / args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
profile = Path(tempfile.mkdtemp(prefix='desktop-acceptance-', dir=ROOT / 'work'))
environment = dict(os.environ)
node_free_path = os.pathsep.join(
    folder for folder in os.environ.get('PATH', '').split(os.pathsep)
    if not shutil.which('node', path=folder.strip('"'))
)
environment.update(COLORVERSE_DESKTOP_TEST='1', COLORVERSE_TEST_USER_DATA=str(profile),
                   COLORVERSE_DESKTOP_SHOW='1',
                   PATH=node_free_path)
for name in ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH']:
    environment.pop(name, None)
for name in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NODE_USE_ENV_PROXY']:
    os.environ.pop(name, None)
    environment.pop(name, None)
os.environ['NO_PROXY'] = 'localhost,127.0.0.1,::1'
environment['NO_PROXY'] = os.environ['NO_PROXY']
assert shutil.which('node', path=environment['PATH']) is None
GET = """async()=>{const db=await new Promise((ok,bad)=>{const r=indexedDB.open('colorverse-judges-offline-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});return await new Promise(ok=>{const r=db.transaction('state').objectStore('state').get('current');r.onsuccess=()=>{ok(r.result);db.close()}})}"""
class Progress(list):
    def append(self, message):
        super().append(message)
        print(message, flush=True)

checks, errors = Progress(), []
process = None
completed = False
launch_args = [str(exe), '--disable-background-timer-throttling',
               '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
               '--force-device-scale-factor=1', '--mute-audio']

def launch():
    global process
    process = subprocess.Popen(launch_args, env=environment, cwd=exe.parent,
                               creationflags=subprocess.CREATE_NO_WINDOW,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            if urlopen('http://127.0.0.1:9250/json/version', timeout=.5).status == 200:
                return
        except Exception:
            if process.poll() is not None:
                raise RuntimeError('Portable launcher exited before its window started')
            time.sleep(.25)
    raise RuntimeError('Portable window did not start')

def attach(playwright):
    browser = playwright.chromium.connect_over_cdp('http://127.0.0.1:9250')
    context = browser.contexts[0]
    page = context.pages[0]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='登录', exact=True)).to_be_visible()
    context.set_offline(True)
    page.reload(wait_until='networkidle')
    assert page.url == 'colorverse://app/'
    assert page.evaluate('typeof require==="undefined"&&typeof process==="undefined"')
    return browser, page

def close(page):
    page.evaluate('setTimeout(()=>window.close(),50)')
    process.wait(timeout=30)
    assert process.returncode == 0, process.returncode

def identity_action(page, label):
    page.locator('.identity-menu > .disclosure-trigger').click()
    page.get_by_role('button', name=label, exact=True).click()

try:
    with sync_playwright() as p:
        expect.set_options(timeout=30000)
        launch()
        b, page = attach(p)
        page.wait_for_selector('canvas[data-scene-ready="true"]')
        page.screenshot(path=str(out / 'exe-startup.png'))
        checks.append('Portable EXE starts with no Node on PATH and renderer offline')
        second = subprocess.Popen(launch_args, env=environment, cwd=exe.parent,
                                  creationflags=subprocess.CREATE_NO_WINDOW,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        second.wait(timeout=30)
        assert second.returncode == 0
        assert len(b.contexts[0].pages) == 1
        checks.append('Second launch reuses the existing window')
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='学生登录', exact=False).click()
        page.get_by_label('学号', exact=True).fill(' 00128 ')
        page.get_by_label('姓名', exact=True).fill(' EXE验证同学 ')
        page.get_by_role('button', name='开始创造我的星球').click()
        page.get_by_role('button', name='默认星球 4', exact=True).click()
        page.get_by_label('上传星球外貌', exact=True).set_input_files(str(ROOT / 'apps/web/public/assignments/two-moods.webp'))
        host = page.locator('.design-orb .framed-image')
        expect(host.locator('.image-adjust-border')).to_be_visible()

        def drag(x, y, dx, dy):
            page.mouse.move(x, y); page.mouse.down()
            page.mouse.move(x+dx, y+dy, steps=8); page.mouse.up()

        box = host.bounding_box()
        drag(box['x']+box['width']/2, box['y']+box['height']/2, 25, -15)
        page.get_by_role('button', name='复位', exact=True).click()
        box = host.bounding_box()
        drag(box['x']+box['width']/2, box['y']+box['height']/2, 20, -10)
        page.get_by_label('光晕效果', exact=True).select_option('ring')
        page.wait_for_function('()=>document.querySelector(".design-orb").classList.contains("halo-ring")&&parseFloat(getComputedStyle(document.querySelector(".design-orb-effects")).borderTopWidth)>1', polling=100)
        page.get_by_label('星球运行速度', exact=True).select_option('fast')
        page.wait_for_function('()=>getComputedStyle(document.querySelector(".design-orb-body")).animationDuration==="4s"', polling=100)
        page.get_by_role('tab', name='内部背景', exact=True).click()
        page.get_by_label('上传内部背景', exact=True).set_input_files(str(ROOT / 'apps/web/public/assignments/two-seasons.webp'))
        interior = page.locator('.design-room-adjustment')
        page.wait_for_function('()=>{const e=document.querySelector(".design-room-adjustment img");return e&&e.complete&&e.naturalWidth>1}', polling=100)
        control = interior.locator('.corner-3')
        control.hover()
        corner = control.bounding_box()
        page.mouse.down()
        page.mouse.move(corner['x']+corner['width']/2+40, corner['y']+corner['height']/2+40, steps=8)
        page.mouse.up()
        box = interior.bounding_box()
        drag(box['x']+box['width']/2, box['y']+box['height']/2, -30, 18)
        page.get_by_label('粒子氛围', exact=True).select_option('fireflies')
        expect(page.locator('.design-preview .cloud-atmosphere.fireflies i')).to_have_count(24)
        page.screenshot(path=str(out / 'exe-editor.png'))
        page.get_by_role('button', name='保存并返回我的星球').click()
        expect(page.locator('.planet-design-editor')).to_have_count(0)
        state = page.evaluate(GET)
        placement = state['ownPlanet']['document']['imagePlacement']
        assert state['identity'] == {'studentNumber': '00128', 'realName': 'EXE验证同学'}
        assert placement['exterior']['x'] != 0 and placement['interior']['scale'] > 1, placement
        checks.append('Identity, uploaded images, drag/zoom/reset, halo, motion and atmosphere')
        page.get_by_role('button', name='我的星球', exact=True).click()
        page.get_by_role('button', name='进入星球内部', exact=False).click()
        expect(page.locator('.immersive-center .cloud-atmosphere i')).to_have_count(24)
        page.get_by_role('button', name='＋ 提交作品', exact=False).click()
        page.get_by_label('作品名称', exact=True).fill('EXE离线验收作品')
        page.get_by_label('配色理由', exact=True).fill('用冷暖差异突出画面中的视觉焦点。')
        page.get_by_label('作品图像', exact=True).set_input_files(str(ROOT / 'apps/web/public/competition/student-1-work-1.webp'))
        page.get_by_role('button', name='提交作品', exact=True).click()
        expect(page.locator('.scene-work-directory')).to_contain_text('待评价')
        page.locator('.scene-work-directory li button').first.hover()
        expect(page.locator('[data-directory-highlighted="true"]')).to_have_count(1)
        background_before = page.locator('.explorer-viewport').bounding_box()
        page.get_by_role('button', name='收起星球资料', exact=True).click()
        assert page.locator('.explorer-viewport').bounding_box() == background_before
        checks.append('Offline work submission, hover ring and stationary background when hiding card')
        identity_action(page, '退出登录')
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='教师登录', exact=False).click()
        page.get_by_role('button', name='教师管理', exact=False).click()
        expect(page.locator('nav button[aria-current="page"]')).to_contain_text('教师管理')
        expect(page.locator('.teacher-thumbnail img')).to_have_count(6)
        page.wait_for_function('()=>[...document.querySelectorAll(".teacher-thumbnail img")].every(i=>i.complete&&i.naturalWidth>1)', polling=100)
        own_row = page.locator('tbody tr').filter(has_text='EXE验证同学')
        expect(own_row.locator('progress')).to_have_attribute('max', '1')
        expect(own_row.locator('progress')).to_have_attribute('value', '0')
        page.get_by_label('搜索学生或星球', exact=True).fill('00128')
        expect(page.locator('tbody tr')).to_have_count(1)
        page.get_by_label('搜索学生或星球', exact=True).fill('')
        own_row.get_by_role('button', name='更多操作', exact=False).click()
        expect(page.get_by_role('button', name='修改星球', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='隐藏', exact=True)).to_be_visible()
        page.keyboard.press('Escape')
        page.screenshot(path=str(out / 'exe-teacher.png'))
        checks.append('Updated teacher studio: real thumbnails, search, actual progress and More menu')
        page.get_by_role('button', name='导入学生', exact=True).click()
        expect(page.get_by_text('本离线体验版使用预置身份', exact=False)).to_be_visible()
        page.get_by_role('button', name='知道了', exact=True).click()
        pending = page.locator('.pending-submissions')
        pending.get_by_role('button').filter(has_text='EXE离线验收作品').click()
        page.get_by_label('教师评分', exact=True).fill('0')
        page.get_by_label('教师点评', exact=True).fill('EXE离线验收：请进一步丰富明暗层次。')
        page.get_by_role('button', name='保存点评与评分').click()
        expect(page.locator('.cloud-review-score')).to_contain_text('0')
        page.get_by_role('button', name='关闭作品', exact=True).click()
        page.get_by_role('button', name='教师管理', exact=False).click()
        expect(page.locator('.pending-empty')).to_be_visible()
        expect(own_row.locator('progress')).to_have_attribute('value', '1')
        page.get_by_role('button', name='消息', exact=False).click()
        page.locator('.inbox-row').filter(has_text='EXE验证同学创建了').click()
        expect(page.get_by_role('region', name='星球内部')).to_be_visible()
        checks.append('Teacher pending list, direct notification and zero-score feedback')
        identity_action(page, '退出登录')
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='学生登录', exact=False).click()
        page.get_by_role('button', name='我的星球', exact=True).click()
        page.get_by_role('button', name='进入星球内部', exact=False).click()
        expect(page.locator('.scene-work-directory')).to_contain_text('教师评分 0 分')
        page.get_by_role('button', name='背景音乐', exact=True).click()
        stable = page.locator('.competition-header nav').bounding_box()
        def wait_music():
            for _ in range(120):
                state = page.evaluate('()=>{const a=document.querySelector("audio");return {paused:a.paused,ready:a.readyState,error:a.error?{code:a.error.code,message:a.error.message}:null,src:a.src,panel:document.querySelector(".music-panel")?.innerText}}')
                if not state['paused'] and state['ready'] >= 2:
                    return
                time.sleep(.25)
            (out/'music-failure.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),'utf-8')
            raise AssertionError(state)
        page.get_by_role('button', name='播放音乐', exact=True).click()
        wait_music()
        assert stable == page.locator('.competition-header nav').bounding_box()
        page.evaluate('window.musicNode=document.querySelector("audio")')
        for name in ['轻盈漫游', '温暖午后', '静谧宇宙']:
            page.get_by_role('button', name=name, exact=False).click()
            wait_music()
        page.get_by_role('button', name='背景音乐', exact=True).click()
        page.get_by_role('button', name='探索宇宙', exact=True).click()
        identity_action(page, '退出登录')
        assert page.evaluate('window.musicNode===document.querySelector("audio")&&!window.musicNode.paused&&document.querySelectorAll("audio").length===1')
        checks.append('Three bundled music tracks play offline; no duplicate audio or navigation shift')
        before_close = page.evaluate(GET)
        page.screenshot(path=str(out / 'exe-before-close.png'))
        close(page)
        launch()
        b, page = attach(p)
        restored = page.evaluate(GET)
        assert restored == before_close
        assert page.evaluate('document.querySelector("audio").paused')
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='学生登录', exact=False).click()
        expect(page.get_by_label('学号', exact=True)).to_have_count(0)
        page.get_by_role('button', name='我的星球', exact=True).click()
        page.get_by_role('button', name='进入星球内部', exact=False).click()
        expect(page.locator('.scene-work-directory')).to_contain_text('教师评分 0 分')
        checks.append('Full app restart restores identity, images, work and score; music defaults paused')
        page.screenshot(path=str(out / 'exe-restored.png'))
        identity_action(page, '退出登录')
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='教师登录', exact=False).click()
        identity_action(page, '重新开始')
        page.get_by_role('button', name='保留并返回', exact=True).click()
        assert page.evaluate(GET)['ownPlanet'] is not None
        identity_action(page, '重新开始')
        page.get_by_role('button', name='确认重新开始', exact=True).click()
        assert page.evaluate(GET)['ownPlanet'] is None
        checks.append('Confirmed reset restores initial examples without changing application files')
        assert not errors, errors
        close(page)
        completed = True
finally:
    if process is not None and process.poll() is None:
        subprocess.run(['taskkill.exe', '/PID', str(process.pid), '/T', '/F'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=15, check=False)
    report = {'status': 'passed' if completed else 'failed', 'exe': str(exe), 'sha256': hashlib.sha256(exe.read_bytes()).hexdigest(),
              'profile': str(profile), 'nodeAbsentFromAppPath': True, 'rendererOffline': True,
              'audioMutedDuringAutomation': True,
              'checks': checks, 'errors': errors}
    (out / 'acceptance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps({'passed': len(checks), 'errors': errors}, ensure_ascii=False))
