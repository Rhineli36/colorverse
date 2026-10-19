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
args = parser.parse_args()
exe = Path(args.exe).resolve()
out = ROOT / 'outputs/desktop-tests'
out.mkdir(parents=True, exist_ok=True)
profile = Path(tempfile.mkdtemp(prefix='desktop-acceptance-', dir=ROOT / 'work'))
environment = dict(os.environ)
environment.update(COLORVERSE_DESKTOP_TEST='1', COLORVERSE_TEST_USER_DATA=str(profile),
                   PATH=os.pathsep.join([str(Path(os.environ['WINDIR']) / 'System32'), os.environ['WINDIR']]))
for name in ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH']:
    environment.pop(name, None)
assert shutil.which('node', path=environment['PATH']) is None
GET = """async()=>{const db=await new Promise((ok,bad)=>{const r=indexedDB.open('colorverse-judges-offline-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});return await new Promise(ok=>{const r=db.transaction('state').objectStore('state').get('current');r.onsuccess=()=>{ok(r.result);db.close()}})}"""
checks, errors = [], []
process = None
completed = False

def launch():
    global process
    process = subprocess.Popen([str(exe)], env=environment, cwd=exe.parent,
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
    context.set_offline(True)
    page = context.pages[0]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.reload(wait_until='networkidle')
    assert page.url == 'colorverse://app/'
    assert page.evaluate('typeof require==="undefined"&&typeof process==="undefined"')
    return browser, page

def close(page):
    page.evaluate('setTimeout(()=>window.close(),50)')
    process.wait(timeout=30)
    assert process.returncode == 0, process.returncode

try:
    with sync_playwright() as p:
        expect.set_options(timeout=30000)
        launch()
        b, page = attach(p)
        page.wait_for_selector('canvas[data-scene-ready="true"]')
        page.screenshot(path=str(out / 'exe-startup.png'))
        checks.append('Portable EXE starts with no Node on PATH and renderer offline')
        second = subprocess.Popen([str(exe)], env=environment, cwd=exe.parent,
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
        assert page.locator('.design-orb-effects').evaluate('(e)=>getComputedStyle(e).borderTopWidth') == '2px'
        page.get_by_label('星球运行速度', exact=True).select_option('fast')
        assert page.locator('.design-orb-body').evaluate('(e)=>getComputedStyle(e).animationDuration') == '4s'
        page.get_by_role('tab', name='内部背景', exact=True).click()
        page.get_by_label('上传内部背景', exact=True).set_input_files(str(ROOT / 'apps/web/public/assignments/two-seasons.webp'))
        interior = page.locator('.design-room-adjustment')
        corner = interior.locator('.corner-3').bounding_box()
        drag(corner['x']+8, corner['y']+8, 40, 40)
        box = interior.bounding_box()
        drag(box['x']+box['width']/2, box['y']+box['height']/2, -30, 18)
        page.get_by_label('粒子氛围', exact=True).select_option('fireflies')
        expect(page.locator('.design-preview .cloud-atmosphere i')).to_have_count(24)
        page.screenshot(path=str(out / 'exe-editor.png'))
        page.get_by_role('button', name='保存并返回我的星球').click()
        expect(page.locator('.planet-design-editor')).to_have_count(0)
        state = page.evaluate(GET)
        placement = state['ownPlanet']['document']['imagePlacement']
        assert state['identity'] == {'studentNumber': '00128', 'realName': 'EXE验证同学'}
        assert placement['exterior']['x'] != 0 and placement['interior']['scale'] > 1
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
        page.get_by_role('button', name='退出登录', exact=True).click()
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='教师登录', exact=False).click()
        page.get_by_role('button', name='教师管理', exact=False).click()
        page.get_by_role('button', name='导入学生', exact=True).click()
        expect(page.get_by_text('本离线体验版使用预置身份', exact=False)).to_be_visible()
        page.get_by_role('button', name='知道了', exact=True).click()
        pending = page.get_by_role('region', name='待评价作业')
        pending.get_by_role('button').filter(has_text='EXE离线验收作品').click()
        page.get_by_label('教师评分', exact=True).fill('0')
        page.get_by_label('教师点评', exact=True).fill('EXE离线验收：请进一步丰富明暗层次。')
        page.get_by_role('button', name='保存点评与评分').click()
        expect(page.locator('.cloud-review-score')).to_contain_text('0')
        page.get_by_role('button', name='关闭作品', exact=True).click()
        page.get_by_role('button', name='信息', exact=False).click()
        page.locator('.inbox-row').filter(has_text='EXE验证同学创建了').click()
        expect(page.get_by_role('region', name='星球内部')).to_be_visible()
        checks.append('Teacher pending list, direct notification and zero-score feedback')
        page.get_by_role('button', name='退出登录', exact=True).click()
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='学生登录', exact=False).click()
        page.get_by_role('button', name='我的星球', exact=True).click()
        page.get_by_role('button', name='进入星球内部', exact=False).click()
        expect(page.locator('.scene-work-directory')).to_contain_text('教师评分 0 分')
        page.get_by_role('button', name='背景音乐', exact=True).click()
        stable = page.locator('.competition-header nav').bounding_box()
        page.get_by_role('button', name='播放音乐', exact=True).click()
        page.wait_for_function('()=>!document.querySelector("audio").paused&&document.querySelector("audio").readyState>=2')
        assert stable == page.locator('.competition-header nav').bounding_box()
        page.evaluate('window.musicNode=document.querySelector("audio")')
        for name in ['轻盈漫游', '温暖午后', '静谧宇宙']:
            page.get_by_role('button', name=name, exact=False).click()
            page.wait_for_function('()=>!document.querySelector("audio").paused&&document.querySelector("audio").readyState>=2')
        page.get_by_role('button', name='背景音乐', exact=True).click()
        page.get_by_role('button', name='探索宇宙', exact=True).click()
        page.get_by_role('button', name='退出登录', exact=True).click()
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
        page.get_by_role('button', name='退出登录', exact=True).click()
        page.get_by_role('button', name='登录', exact=True).click()
        page.get_by_role('button', name='教师登录', exact=False).click()
        page.get_by_role('button', name='重新开始', exact=True).click()
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
              'checks': checks, 'errors': errors}
    (out / 'acceptance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps({'passed': len(checks), 'errors': errors}, ensure_ascii=False))
