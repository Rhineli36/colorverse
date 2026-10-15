"""Extract the actual delivery ZIP and browse it with all non-loopback requests blocked."""
import os, sys, json, zipfile, tempfile, subprocess, time
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlparse
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright, expect

delivery = ROOT/'outputs/competition-delivery'
folder = Path(tempfile.mkdtemp(prefix='package-acceptance-', dir=ROOT/'work'))
with zipfile.ZipFile(delivery/'色彩星球静态展示备用包.zip') as archive:
    for name in archive.namelist():
        assert (folder/name).resolve().is_relative_to(folder.resolve())
    archive.extractall(folder)
static = folder/'colorverse-static'
process = subprocess.Popen(['node', 'serve.mjs'], cwd=static, stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
try:
    for attempt in range(50):
        try:
            assert urlopen('http://127.0.0.1:5198/', timeout=1).status == 200
            break
        except Exception:
            if process.poll() is not None:
                raise RuntimeError('Packaged preview process exited')
            time.sleep(.1)
    else:
        raise RuntimeError('Packaged preview did not start')
    blocked, errors = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        def local_only(route):
            if urlparse(route.request.url).hostname in ['127.0.0.1', 'localhost']:
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort()
        page.route('**/*', local_only)
        page.on('pageerror', lambda error: errors.append(error.message))
        page.goto('http://127.0.0.1:5198/', wait_until='networkidle')
        expect(page.locator('.cloud-universe-node')).to_have_count(10)
        page.locator('[data-planet-id="demo-1"]').click()
        expect(page.locator('.scene-growth')).to_have_count(5)
        page.wait_for_function("()=>{const i=document.querySelector('.scene-saved-background');return i.complete&&i.naturalWidth>0}")
        page.locator('.scene-growth').first.click()
        dialog = page.get_by_role('dialog', name='比赛作品展示')
        expect(dialog.get_by_role('img')).to_be_visible()
        expect(dialog).to_contain_text('只读展示快照')
        dialog.get_by_role('button', name='关闭作品', exact=True).click()
        page.locator('.explorer-viewport').screenshot(path=str(ROOT/'outputs/exploration-packaged-scene.png'))
        page.get_by_role('button', name='演示学生 02', exact=True).click()
        expect(page.locator('.scene-saved-background')).to_have_attribute('src', './competition/case-2-interior.webp')
        assert not errors, errors
        assert not blocked, 'Unexpected external requests during the tested browsing route'
        browser.close()
    result = {'status': 'passed', 'actualZipExtracted': True, 'externalRequestsBlocked': True,
        'externalRequestsAttempted': len(blocked), 'nodeDependenciesInstalled': False,
        'checks': ['universe contains ten planets', 'two saved student interiors', 'five mapped growth elements',
                   'work image and read-only feedback', 'no browser runtime errors'],
        'fullOfflineClassroomClaimed': False}
    (ROOT/'outputs/competition-package-acceptance.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result), flush=True)
finally:
    process.terminate()
    process.wait(timeout=10)
